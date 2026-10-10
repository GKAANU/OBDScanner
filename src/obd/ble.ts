import { BleManager, State, type Device } from 'react-native-ble-plx';
import { isLikelyObd } from './ble-profile';
import { OBDError } from './protocol';
import { diagLog } from './diag-log';

/**
 * One BleManager for the app (the library wants a singleton). Created
 * lazily so the iOS Bluetooth permission prompt appears only when the user
 * picks Bluetooth, not at launch.
 */
let manager: BleManager | null = null;
export function bleManager(): BleManager {
  if (!manager) manager = new BleManager();
  return manager;
}

export type BleScanItem = { id: string; name: string; rssi: number | null; likely: boolean };

/** Wait for the Bluetooth radio to settle; throws BLE_OFF / BLE_UNAUTHORIZED. */
export async function ensureBleReady(timeoutMs = 4000): Promise<void> {
  const m = bleManager();
  const state = await new Promise<string>((resolve) => {
    let done = false;
    const finish = (s: string) => {
      if (done) return;
      done = true;
      sub.remove();
      clearTimeout(t);
      resolve(s);
    };
    const sub = m.onStateChange((s) => {
      if (s !== State.Unknown && s !== State.Resetting) finish(s);
    }, true);
    const t = setTimeout(() => finish(State.Unknown), timeoutMs);
  });
  if (state === State.PoweredOn) return;
  if (state === State.Unauthorized) throw new OBDError('BLE_UNAUTHORIZED', `Bluetooth state ${state}`, { step: 'ble' });
  if (state === State.Unsupported) throw new OBDError('CONNECT_FAILED', 'Bluetooth LE unsupported', { step: 'ble' });
  throw new OBDError('BLE_OFF', `Bluetooth state ${state}`, { step: 'ble' });
}

/**
 * Scan for BLE devices; calls `onUpdate` with the de-duplicated list
 * (likely OBD adapters first, then by signal). Returns a stop function.
 */
export function scanBle(onUpdate: (items: BleScanItem[]) => void, onError: (e: unknown) => void): () => void {
  const m = bleManager();
  const seen = new Map<string, BleScanItem>();
  let stopped = false;
  const emit = () => {
    const list = Array.from(seen.values()).sort(
      (a, b) => Number(b.likely) - Number(a.likely) || (b.rssi ?? -999) - (a.rssi ?? -999)
    );
    onUpdate(list);
  };
  diagLog.startAttempt('ble scan start');
  void m
    .startDeviceScan(null, { allowDuplicates: false }, async (error, device: Device | null) => {
      if (stopped) return;
      if (error) {
        onError(error);
        return;
      }
      if (!device) return;
      const name = device.localName ?? device.name ?? '';
      const likely = isLikelyObd(name, device.serviceUUIDs);
      // Some cheap clones advertise no name: keep nameless devices too (listed under "Diğer cihazlar").
      if (!seen.has(device.id)) {
        diagLog.log(
          `ble seen "${name || '-'}" rssi=${device.rssi ?? '?'} services=${(device.serviceUUIDs ?? []).map((u) => u.slice(4, 8)).join(',') || '-'}${likely ? ' likely' : ''}`
        );
      }
      seen.set(device.id, { id: device.id, name: name || 'Adsız cihaz', rssi: device.rssi ?? null, likely });
      emit();
    })
    .catch(onError);
  return () => {
    stopped = true;
    m.stopDeviceScan().catch(() => {});
  };
}

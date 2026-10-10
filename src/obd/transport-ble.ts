import type { Subscription } from 'react-native-ble-plx';
import type { Transport, TransportHandlers } from './transport';
import { OBDError } from './protocol';
import { NOOP_LOGGER, type DiagLogger } from './diag-log';
import { chooseChannel, chunk, fromBase64, toBase64, type BleChannel, type GattChar } from './ble-profile';
import { bleManager, ensureBleReady } from './ble';

const CONNECT_TIMEOUT_MS = 12000;

/**
 * Bluetooth LE link to an ELM327 adapter. Finds the adapter's write/notify
 * characteristics, then behaves like a byte stream (same as TcpTransport).
 */
export class BleTransport implements Transport {
  readonly label: string;
  private channel: BleChannel | null = null;
  private subs: Subscription[] = [];
  private open_ = false;
  /** Writes are async on BLE; keep them in order. */
  private queue: Promise<void> = Promise.resolve();
  private readonly log: DiagLogger;

  constructor(
    private readonly deviceId: string,
    name: string,
    options: { log?: DiagLogger } = {}
  ) {
    this.label = name || 'Bluetooth adaptör';
    this.log = options.log ?? NOOP_LOGGER;
  }

  async open(handlers: TransportHandlers): Promise<void> {
    const m = bleManager();
    const startedAt = Date.now();
    await ensureBleReady();
    this.log.log(`ble open ${this.label} (${this.deviceId})`);
    try {
      await m.connectToDevice(this.deviceId, { timeout: CONNECT_TIMEOUT_MS });
      await m.discoverAllServicesAndCharacteristicsForDevice(this.deviceId);
      const chars: GattChar[] = [];
      for (const s of await m.servicesForDevice(this.deviceId)) {
        for (const c of await m.characteristicsForDevice(this.deviceId, s.uuid)) {
          chars.push({
            service: s.uuid,
            uuid: c.uuid,
            notify: c.isNotifiable,
            indicate: c.isIndicatable,
            write: c.isWritableWithResponse,
            writeNoResponse: c.isWritableWithoutResponse,
          });
        }
      }
      this.log.log(`ble services: ${Array.from(new Set(chars.map((c) => c.service.slice(4, 8)))).join(',')}`);
      const channel = chooseChannel(chars);
      if (!channel) {
        await m.cancelDeviceConnection(this.deviceId).catch(() => {});
        throw new OBDError('BLE_NO_CHANNEL', 'No write/notify characteristic pair', { step: 'ble' });
      }
      this.channel = channel;
      this.log.log(`ble channel ${channel.profile} notify=${channel.notifyChar} write=${channel.writeChar} resp=${channel.withResponse}`);

      this.subs.push(
        m.monitorCharacteristicForDevice(this.deviceId, channel.service, channel.notifyChar, (error, c) => {
          if (error) {
            if (this.open_) this.log.log(`ble monitor error: ${error.message}`);
            return;
          }
          if (c?.value) handlers.onData(fromBase64(c.value));
        })
      );
      this.subs.push(
        m.onDeviceDisconnected(this.deviceId, (error) => {
          this.log.log(`ble disconnected after ${Date.now() - startedAt}ms${error ? `: ${error.message}` : ''}`);
          const wasOpen = this.open_;
          this.teardown();
          if (wasOpen) handlers.onClose(error ? new Error(error.message) : undefined);
        })
      );
      this.open_ = true;
      this.log.log(`ble connected in ${Date.now() - startedAt}ms`);
    } catch (e) {
      this.teardown();
      if (e instanceof OBDError) throw e;
      const raw = e instanceof Error ? e.message : String(e);
      this.log.log(`ble connect failed: ${raw}`);
      throw new OBDError('CONNECT_FAILED', raw, { step: 'ble', raw });
    }
  }

  write(data: string): void {
    const ch = this.channel;
    if (!this.open_ || !ch) throw new OBDError('NOT_CONNECTED', 'BLE link is not open');
    const m = bleManager();
    for (const part of chunk(data, 20)) {
      const b64 = toBase64(part);
      this.queue = this.queue
        .then(() =>
          ch.withResponse
            ? m.writeCharacteristicWithResponseForDevice(this.deviceId, ch.service, ch.writeChar, b64).then(() => {})
            : m.writeCharacteristicWithoutResponseForDevice(this.deviceId, ch.service, ch.writeChar, b64).then(() => {})
        )
        .catch((e: unknown) => {
          this.log.log(`ble write failed: ${e instanceof Error ? e.message : String(e)}`);
        });
    }
  }

  close(): void {
    const wasOpen = this.open_ || this.channel != null;
    this.teardown();
    if (wasOpen) bleManager().cancelDeviceConnection(this.deviceId).catch(() => {});
  }

  private teardown(): void {
    this.open_ = false;
    this.channel = null;
    for (const s of this.subs) {
      try {
        s.remove();
      } catch {}
    }
    this.subs = [];
  }
}

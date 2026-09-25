import { Platform } from 'react-native';
import * as Application from 'expo-application';
import * as Network from 'expo-network';
import type { OBDConfig } from '../obd/client';
import { diagLog, formatDiagLog } from '../obd/diag-log';
import { formatTimestamp } from '../utils/format';

const UNKNOWN = 'bilinmiyor';

/** Resolve `p`, or `fallback` after `ms` / on error. */
async function within<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p, new Promise<T>((r) => (timer = setTimeout(() => r(fallback), ms)))]);
  } catch {
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Header lines for the copied connection log. Phone IP and network type
 * come from local OS queries (getifaddrs / NWPathMonitor); nothing is
 * sent over the network.
 */
export async function buildDiagHeader(config: OBDConfig): Promise<string[]> {
  const ip = await within(Network.getIpAddressAsync(), 1500, UNKNOWN);
  const state = await within(Network.getNetworkStateAsync(), 1500, null);
  const yesNo = (b: boolean | undefined) => (b ? 'evet' : 'hayır');
  return [
    'Otova bağlantı günlüğü',
    `Oluşturma: ${formatTimestamp()}`,
    `Uygulama: ${Application.nativeApplicationVersion ?? UNKNOWN} (build ${Application.nativeBuildVersion ?? UNKNOWN})`,
    `${Platform.OS === 'ios' ? 'iOS' : Platform.OS}: ${String(Platform.Version ?? UNKNOWN)}`,
    `Ayar: ${config.host}:${config.port}, demo: ${yesNo(config.demo)}, yavaş ECU: ${yesNo(config.slowEcu)}`,
    `Telefon: IP ${ip || UNKNOWN}, ağ ${state?.type ?? UNKNOWN}${state ? `, bağlı: ${yesNo(state.isConnected)}` : ''}`,
  ];
}

/** Full plain-text log for the clipboard. */
export async function diagLogText(config: OBDConfig): Promise<string> {
  return formatDiagLog(diagLog.entries(), await buildDiagHeader(config));
}

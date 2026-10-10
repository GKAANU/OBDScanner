/** A host/port pair for a Wi-Fi ELM327 adapter. */
export type Endpoint = { host: string; port: number };

export type HostPreset = Endpoint & { /** Chip text in the settings sheet. */ label: string };

/**
 * Common factory addresses of Wi-Fi ELM327 adapters, most common first.
 * Used by the settings sheet chips and, in this order, by Otomatik bul.
 */
export const HOST_PRESETS: readonly HostPreset[] = [
  { host: '192.168.0.10', port: 35000, label: '192.168.0.10:35000 (en yaygın)' },
  { host: '192.168.0.11', port: 35000, label: '192.168.0.11:35000' },
  { host: '192.168.1.10', port: 35000, label: '192.168.1.10:35000' },
  { host: '192.168.4.1', port: 35000, label: '192.168.4.1:35000 (ESP modüller)' },
  { host: '10.10.100.254', port: 8899, label: '10.10.100.254:8899 (HF modüller)' },
  { host: '192.168.0.10', port: 23, label: '192.168.0.10:23 (Telnet)' },
];

export function hostPort(e: Endpoint): string {
  return `${e.host}:${e.port}`;
}

export function sameEndpoint(a: Endpoint, b: Endpoint): boolean {
  return a.host === b.host && a.port === b.port;
}

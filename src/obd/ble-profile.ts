/**
 * BLE ELM327 adapters expose a serial-like channel as GATT characteristics:
 * one to write commands, one that notifies replies. Vendors use a handful of
 * well-known layouts; anything else is found by capability. Pure module
 * (no native imports) so Jest covers it.
 */

export type GattChar = {
  service: string;
  uuid: string;
  notify: boolean;
  indicate: boolean;
  write: boolean;
  writeNoResponse: boolean;
};

export type BleChannel = {
  service: string;
  notifyChar: string;
  writeChar: string;
  /** Use write-with-response (some clones only support that). */
  withResponse: boolean;
  /** Which known layout matched, or "generic". */
  profile: string;
};

/** Expand a 16-bit UUID ("fff0") to the full Bluetooth base UUID; lowercase. */
export function fullUuid(u: string): string {
  const s = u.toLowerCase();
  if (/^[0-9a-f]{4}$/.test(s)) return `0000${s}-0000-1000-8000-00805f9b34fb`;
  if (/^[0-9a-f]{8}$/.test(s)) return `${s}-0000-1000-8000-00805f9b34fb`;
  return s;
}

function same(a: string, b: string): boolean {
  return fullUuid(a) === fullUuid(b);
}

/** Known layouts: service, notify characteristic, write characteristic. */
export const KNOWN_PROFILES: Array<{ name: string; service: string; notify: string; write: string }> = [
  // Most cheap ELM327 BLE clones (incl. many "OBDII", "OBDBLE", Veepeak).
  { name: 'fff0', service: 'fff0', notify: 'fff1', write: 'fff2' },
  // HM-10 style modules: one characteristic for both directions.
  { name: 'ffe0', service: 'ffe0', notify: 'ffe1', write: 'ffe1' },
  // vLinker / Vgate BLE.
  { name: '18f0', service: '18f0', notify: '2af0', write: '2af1' },
  // OBDLink CX and some iOS-oriented adapters.
  {
    name: 'e7810a71',
    service: 'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
    notify: 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f',
    write: 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f',
  },
  // Nordic UART service.
  {
    name: 'nus',
    service: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    notify: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
    write: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
  },
];

/** Services that are never the data channel (GAP, GATT, device info, battery). */
const SYSTEM_SERVICES = ['1800', '1801', '180a', '180f'].map(fullUuid);

/** Pick the write/notify pair to talk ELM327 over; null when none fits. */
export function chooseChannel(chars: GattChar[]): BleChannel | null {
  const find = (svc: string, uuid: string) => chars.find((c) => same(c.service, svc) && same(c.uuid, uuid));
  for (const p of KNOWN_PROFILES) {
    const n = find(p.service, p.notify);
    const w = find(p.service, p.write);
    if (n && w && (n.notify || n.indicate) && (w.write || w.writeNoResponse)) {
      return { service: n.service, notifyChar: n.uuid, writeChar: w.uuid, withResponse: !w.writeNoResponse, profile: p.name };
    }
  }
  // Generic: the first non-system service that has both a notifier and a writer.
  const services = Array.from(new Set(chars.map((c) => fullUuid(c.service)))).filter((s) => !SYSTEM_SERVICES.includes(s));
  for (const svc of services) {
    const inSvc = chars.filter((c) => fullUuid(c.service) === svc);
    const n = inSvc.find((c) => c.notify || c.indicate);
    const w = inSvc.find((c) => c.writeNoResponse) ?? inSvc.find((c) => c.write);
    if (n && w) return { service: n.service, notifyChar: n.uuid, writeChar: w.uuid, withResponse: !w.writeNoResponse, profile: 'generic' };
  }
  return null;
}

/** Split text into chunks of at most `size` bytes (BLE writes are small). */
export function chunk(text: string, size = 20): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** latin1 text -> base64 (the BLE library speaks base64). */
export function toBase64(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i += 3) {
    const a = text.charCodeAt(i) & 0xff;
    const b = i + 1 < text.length ? text.charCodeAt(i + 1) & 0xff : NaN;
    const c = i + 2 < text.length ? text.charCodeAt(i + 2) & 0xff : NaN;
    const n = (a << 16) | ((isNaN(b) ? 0 : b) << 8) | (isNaN(c) ? 0 : c);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += isNaN(b) ? '=' : B64[(n >> 6) & 63];
    out += isNaN(c) ? '=' : B64[n & 63];
  }
  return out;
}

/** base64 -> latin1 text (one char per byte, so stray high bytes stay harmless). */
export function fromBase64(b64: string): string {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  let out = '';
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      (B64.indexOf(clean[i]) << 18) |
      (B64.indexOf(clean[i + 1] ?? 'A') << 12) |
      ((i + 2 < clean.length ? B64.indexOf(clean[i + 2]) : 0) << 6) |
      (i + 3 < clean.length ? B64.indexOf(clean[i + 3]) : 0);
    out += String.fromCharCode((n >> 16) & 0xff);
    if (i + 2 < clean.length) out += String.fromCharCode((n >> 8) & 0xff);
    if (i + 3 < clean.length) out += String.fromCharCode(n & 0xff);
  }
  return out;
}

const OBD_NAME = /obd|elm|v-?link|vgate|veepeak|obdlink|konnwei|carista|scan|ios-vlink|android-vlink|icar|kiwi|hh ?obd|car ?diag/i;

/** True when a scanned device looks like an OBD adapter (by name or advertised service). */
export function isLikelyObd(name: string | null | undefined, serviceUuids: string[] | null | undefined = []): boolean {
  if (name && OBD_NAME.test(name)) return true;
  return (serviceUuids ?? []).some((u) => KNOWN_PROFILES.some((p) => same(p.service, u)));
}

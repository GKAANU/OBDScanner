/**
 * Pure parsers for ELM327 responses. No I/O, no state.
 */

import { findMarker, responseHex, responseMessages } from './response';

const TYPE_CHAR = ['P', 'C', 'B', 'U'] as const;

/**
 * Normalize a raw ELM327 response into one byte-aligned hex string
 * (see response.ts for everything that gets stripped).
 */
function normalize(raw: string): string {
  return responseHex(raw);
}

const DTC_MARKERS = ['43', '47', '4A'] as const;

/**
 * Parse a Mode 03 / 07 / 0A DTC response into canonical codes (e.g. "P0420").
 *
 * Each ECU reply is decoded separately:
 *  - ISO 15765 (CAN) replies carry a count byte: `43 NN <NN x 2 bytes>`, so
 *    the data after the mode byte has an odd byte length.
 *  - ISO 9141 / KWP / J1850 replies have no count byte and always carry
 *    exactly 3 DTC slots (6 bytes, zero padded), one line per 3 codes.
 */
export function parseDTCs(raw: string): string[] {
  const out: string[] = [];
  for (const msg of responseMessages(raw)) {
    const marker = DTC_MARKERS.find((m) => msg.startsWith(m));
    if (!marker) continue;
    const data = msg.substring(2);
    const byteLen = data.length / 2;
    let codes: string[];
    if (byteLen % 2 === 1) {
      const count = parseInt(data.substring(0, 2), 16);
      codes = decodeDTCList(data.substring(2, 2 + count * 4));
    } else {
      codes = decodeDTCList(data);
    }
    for (const c of codes) if (!out.includes(c)) out.push(c);
  }
  return out;
}

function decodeDTCList(data: string): string[] {
  const dtcs: string[] = [];
  for (let i = 0; i + 4 <= data.length; i += 4) {
    const chunk = data.substring(i, i + 4);
    if (chunk === '0000') continue; // empty slot
    const code = decodeDTCHex(chunk);
    if (code) dtcs.push(code);
  }
  return dtcs;
}

/**
 * Decode one 2-byte DTC (4 hex chars, e.g. "0420") into its canonical form
 * ("P0420"). Returns null for malformed input or the "no code" value 0000.
 */
export function decodeDTCHex(hex4: string): string | null {
  if (!/^[0-9A-F]{4}$/i.test(hex4)) return null;
  const chunk = hex4.toUpperCase();
  if (chunk === '0000') return null;
  const firstByte = parseInt(chunk.substring(0, 2), 16);
  const type = TYPE_CHAR[(firstByte >> 6) & 0b11];
  const d2 = (firstByte >> 4) & 0b11;
  const d3 = (firstByte & 0x0f).toString(16).toUpperCase();
  return `${type}${d2}${d3}${chunk.substring(2, 4)}`;
}

/**
 * Parse a Mode 02 PID 02 response: the DTC that caused the given freeze
 * frame to be stored.
 *
 * Request `02 02 00` -> response `42 02 00 AA BB`, where `00` is the echoed
 * frame number and AABB is the DTC. `0000` means no freeze frame is stored.
 * Returns the DTC ("P0133") or null when there is no frame / no response.
 */
export function parseFreezeFrameDTC(raw: string, frame = '00'): string | null {
  const clean = normalize(raw);
  const marker = `4202${frame.toUpperCase()}`;
  const idx = findMarker(clean, marker);
  if (idx === -1) return null;
  return decodeDTCHex(clean.substring(idx + marker.length, idx + marker.length + 4));
}

/**
 * Collect the payload bytes (as hex) of a Mode 09 reply for `marker`
 * ("4902", "4904", "490A").
 *  - CAN: one message `49 PP NN <data>` (NN = number of data items).
 *  - ISO 9141 / KWP: several 7-byte lines `49 PP SS <4 bytes>`, SS = 1, 2, 3...
 * With several ECUs answering on CAN, only the first reply is used.
 */
function mode09Payload(raw: string, marker: string): string | null {
  const m = marker.toUpperCase();
  const msgs = responseMessages(raw).filter((x) => x.startsWith(m));
  if (msgs.length === 0) return null;
  const legacy =
    msgs.length > 1 &&
    msgs.every((x, i) => x.length === 14 && parseInt(x.substring(4, 6), 16) === i + 1);
  if (legacy) return msgs.map((x) => x.substring(6)).join('');
  return msgs[0].substring(m.length + 2);
}

function hexToAscii(hex: string): string {
  let out = '';
  for (let i = 0; i + 2 <= hex.length; i += 2) {
    const code = parseInt(hex.substring(i, i + 2), 16);
    if (isNaN(code)) break;
    if (code >= 0x20 && code <= 0x7e) out += String.fromCharCode(code);
  }
  return out;
}

/**
 * Decode a Mode 09 PID 02 (VIN) response into a 17-character VIN string.
 * Returns whatever ASCII is in the payload if it's not 17 chars (some ECUs
 * pad differently); returns null only when the marker is missing.
 */
export function parseVIN(raw: string): string | null {
  const hex = mode09Payload(raw, '4902');
  if (hex === null) return null;
  const vin = hexToAscii(hex).trim();
  return vin.length === 17 ? vin : vin || null;
}

/**
 * Decode a Mode 09 ASCII payload (Calibration ID, ECU Name, etc.) given the
 * mode/PID marker like "4904" or "490A".
 */
export function parseMode09Ascii(raw: string, marker: string): string | null {
  const hex = mode09Payload(raw, marker);
  if (hex === null) return null;
  const out = hexToAscii(hex).trim();
  return out.length > 0 ? out : null;
}

/**
 * Decode a Mode 09 PID 06 (CVN) response as a hex string (typically 4 bytes).
 */
export function parseCVN(raw: string): string | null {
  const clean = normalize(raw);
  const idx = findMarker(clean, '4906');
  if (idx === -1) return null;
  // Skip "4906" + NODI byte.
  const hex = clean.substring(idx + 6);
  // CVN is 4 bytes per item.
  if (hex.length < 8) return null;
  return hex.substring(0, 8);
}

export type ReadinessMonitor = {
  name: string;
  supported: boolean;
  ready: boolean;
  continuous: boolean;
};

export type ReadinessReport = {
  milOn: boolean;
  dtcCount: number;
  monitors: ReadinessMonitor[];
};

/**
 * Parse Mode 01 PID 01: MIL status + DTC count + readiness monitors.
 *
 * Response: 41 01 AA BB CC DD
 *   AA bit 7 = MIL on/off; AA bits 0-6 = DTC count
 *   BB bits 0-2 = continuous monitor support; bits 4-6 = continuous status (1 = not ready)
 *   CC bits 0-7 = non-continuous monitor support
 *   DD bits 0-7 = non-continuous monitor status (1 = not ready)
 */
export function parseReadiness(raw: string): ReadinessReport | null {
  const clean = normalize(raw);
  const idx = findMarker(clean, '4101');
  if (idx === -1) return null;
  const hex = clean.substring(idx + 4);
  if (hex.length < 8) return null;
  const A = parseInt(hex.substring(0, 2), 16);
  const B = parseInt(hex.substring(2, 4), 16);
  const C = parseInt(hex.substring(4, 6), 16);
  const D = parseInt(hex.substring(6, 8), 16);
  if ([A, B, C, D].some((n) => isNaN(n))) return null;

  const continuous: ReadinessMonitor[] = [
    { name: 'Misfire',         supported: !!(B & 0x01), ready: !(B & 0x10), continuous: true },
    { name: 'Yakıt sistemi',   supported: !!(B & 0x02), ready: !(B & 0x20), continuous: true },
    { name: 'Bileşenler',      supported: !!(B & 0x04), ready: !(B & 0x40), continuous: true },
  ];
  const nonContinuous: ReadinessMonitor[] = [
    { name: 'Katalitik konv.',     supported: !!(C & 0x01), ready: !(D & 0x01), continuous: false },
    { name: 'Isınmış katalizör',   supported: !!(C & 0x02), ready: !(D & 0x02), continuous: false },
    { name: 'Buharlaşma sistemi',  supported: !!(C & 0x04), ready: !(D & 0x04), continuous: false },
    { name: 'İkincil hava',        supported: !!(C & 0x08), ready: !(D & 0x08), continuous: false },
    { name: 'A/C soğutucu',        supported: !!(C & 0x10), ready: !(D & 0x10), continuous: false },
    { name: 'O2 sensörü',          supported: !!(C & 0x20), ready: !(D & 0x20), continuous: false },
    { name: 'O2 sensör ısıtıcı',   supported: !!(C & 0x40), ready: !(D & 0x40), continuous: false },
    { name: 'EGR sistemi',         supported: !!(C & 0x80), ready: !(D & 0x80), continuous: false },
  ];

  return {
    milOn: !!(A & 0x80),
    dtcCount: A & 0x7f,
    monitors: [...continuous, ...nonContinuous],
  };
}

/**
 * Parse the ATRV battery voltage response, e.g. "13.8V" -> 13.8.
 * Returns null if no number is present.
 */
export function parseBatteryVoltage(raw: string): number | null {
  // "12.6V", "12.6", and clones that drop the decimals ("12V").
  const m = raw.match(/(\d+\.\d+)/) ?? raw.match(/(\d+)\s*V/i);
  if (!m) return null;
  const v = parseFloat(m[1]);
  return isNaN(v) ? null : v;
}

/**
 * Detect known ELM327 error strings in a response.
 */
export function detectOBDError(raw: string): string | null {
  const upper = raw.toUpperCase();
  if (upper.includes('UNABLE TO CONNECT')) return 'UNABLE_TO_CONNECT';
  // "BUS INIT: ...OK" is a success banner on ISO 9141 / KWP; only the ERROR
  // form (and the generic "BUS ERROR") is a failure.
  if (/BUS INIT[:.\s]*ERROR/.test(upper) || upper.includes('BUS ERROR')) return 'BUS_INIT_ERROR';
  if (upper.includes('CAN ERROR')) return 'CAN_ERROR';
  if (upper.includes('STOPPED')) return 'STOPPED';
  if (upper.includes('NO DATA')) return 'NO_DATA';
  if (upper.includes('BUFFER FULL')) return 'BUFFER_FULL';
  if (upper.includes('?')) return 'UNKNOWN_COMMAND';
  return null;
}

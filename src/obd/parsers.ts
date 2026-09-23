/**
 * Pure parsers for ELM327 responses. No I/O, no state.
 */

const TYPE_CHAR = ['P', 'C', 'B', 'U'] as const;

/**
 * Normalize a raw ELM327 response: strip line numbers, whitespace, prompt char.
 */
function normalize(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[\r\n]/g, ' ')
    .replace(/\d+:\s*/g, '')
    .replace(/\s+/g, '')
    .replace(/>/g, '');
}

/**
 * Parse a Mode 03 / 07 / 0A DTC response into canonical codes (e.g. "P0420").
 */
export function parseDTCs(raw: string): string[] {
  const clean = normalize(raw);

  // Mode 03 -> 43, Mode 07 -> 47, Mode 0A -> 4A
  let responseIdx = -1;
  for (const marker of ['43', '47', '4A']) {
    const i = clean.indexOf(marker);
    if (i !== -1 && (responseIdx === -1 || i < responseIdx)) responseIdx = i;
  }
  if (responseIdx === -1) return [];

  let data = clean.substring(responseIdx + 2);

  // ISO 15765 (CAN) and ISO 14229 typically prefix the DTC list with a
  // count byte. Older protocols (J1850, KWP) do not. We strip when:
  //   - the leading byte is a small number (1..15), AND
  //   - the remaining data is exactly count*4 hex chars (tight fit), OR
  //   - the remaining data is at least count*4 with trailing zeros only.
  if (data.length >= 4) {
    const possibleCount = parseInt(data.substring(0, 2), 16);
    if (!isNaN(possibleCount) && possibleCount > 0 && possibleCount <= 15) {
      const required = possibleCount * 4;
      const after = data.substring(2);
      let strip = false;
      if (possibleCount === 1) {
        // Single-DTC payloads are ambiguous when padded with zeros; only
        // strip when the response length is an exact match.
        if (after.length === required) strip = true;
      } else {
        // Multi-DTC: tolerate either trailing zeros or a missing final pad
        // byte (some ECUs drop the last 0x00 in multi-frame replies).
        if (after.length >= required - 4) {
          const tail = after.substring(required);
          if (/^0*$/.test(tail)) strip = true;
        }
      }
      if (strip) {
        data = after;
      }
    }
  }

  return decodeDTCList(data);
}

function decodeDTCList(data: string): string[] {
  const dtcs: string[] = [];
  for (let i = 0; i + 4 <= data.length; i += 4) {
    const chunk = data.substring(i, i + 4);
    if (chunk === '0000') break;
    const firstByte = parseInt(chunk.substring(0, 2), 16);
    if (isNaN(firstByte)) continue;
    const type = TYPE_CHAR[(firstByte >> 6) & 0b11];
    const d2 = (firstByte >> 4) & 0b11;
    const d3 = (firstByte & 0x0f).toString(16).toUpperCase();
    dtcs.push(`${type}${d2}${d3}${chunk.substring(2, 4)}`);
  }
  return dtcs;
}

/**
 * Decode a Mode 09 PID 02 (VIN) response into a 17-character VIN string.
 * Returns whatever ASCII is in the payload if it's not 17 chars (some ECUs
 * pad differently); returns null only when the marker is missing.
 */
export function parseVIN(raw: string): string | null {
  const clean = normalize(raw);
  const idx = clean.indexOf('4902');
  if (idx === -1) return null;
  // Skip "4902" (mode/PID) + 1-byte NODI (number of data items).
  const hex = clean.substring(idx + 6);
  let vin = '';
  for (let i = 0; i + 2 <= hex.length; i += 2) {
    const code = parseInt(hex.substring(i, i + 2), 16);
    if (isNaN(code)) break;
    if (code === 0) continue;
    if (code >= 0x20 && code <= 0x7e) vin += String.fromCharCode(code);
  }
  return vin.length === 17 ? vin : vin || null;
}

/**
 * Decode a Mode 09 ASCII payload (Calibration ID, ECU Name, etc.) given the
 * mode/PID marker like "4904" or "490A".
 */
export function parseMode09Ascii(raw: string, marker: string): string | null {
  const clean = normalize(raw);
  const idx = clean.indexOf(marker.toUpperCase());
  if (idx === -1) return null;
  // Skip marker + NODI byte.
  const hex = clean.substring(idx + marker.length + 2);
  let out = '';
  for (let i = 0; i + 2 <= hex.length; i += 2) {
    const code = parseInt(hex.substring(i, i + 2), 16);
    if (isNaN(code)) break;
    if (code === 0) continue;
    if (code >= 0x20 && code <= 0x7e) out += String.fromCharCode(code);
  }
  return out.length > 0 ? out.trim() : null;
}

/**
 * Decode a Mode 09 PID 06 (CVN) response as a hex string (typically 4 bytes).
 */
export function parseCVN(raw: string): string | null {
  const clean = normalize(raw);
  const idx = clean.indexOf('4906');
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
  const idx = clean.indexOf('4101');
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
  const m = raw.match(/(\d+\.\d+)\s*V?/i);
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
  if (upper.includes('BUS INIT')) return 'BUS_INIT_ERROR';
  if (upper.includes('CAN ERROR')) return 'CAN_ERROR';
  if (upper.includes('STOPPED')) return 'STOPPED';
  if (upper.includes('NO DATA')) return 'NO_DATA';
  if (upper.includes('BUFFER FULL')) return 'BUFFER_FULL';
  if (upper.includes('?')) return 'UNKNOWN_COMMAND';
  return null;
}

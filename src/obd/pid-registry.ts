import { findMarker, responseHex } from './response';

/**
 * Single source of truth for Mode 01 PID metadata.
 * UI never hardcodes PID strings; it reads from this registry.
 */

export type PIDGroup = 'engine' | 'fuel' | 'emissions' | 'electrical' | 'o2';

export type PIDDef = {
  /** Hex PID, no '01' prefix. e.g. '0C' for RPM. */
  pid: string;
  /** Stable short id (RPM, ECT, ...). */
  id: string;
  /** Turkish display label. */
  label: string;
  unit: string;
  group: PIDGroup;
  /** Expected data byte count after the 41XX response header. */
  bytes: number;
  parse: (bytes: number[]) => number | string;
  min?: number;
  max?: number;
};

export const PID_REGISTRY: PIDDef[] = [
  { pid: '04', id: 'LOAD',  label: 'Motor yükü',                unit: '%',     group: 'engine',     bytes: 1, parse: (b) => (b[0] * 100) / 255, min: 0, max: 100 },
  { pid: '05', id: 'ECT',   label: 'Soğutma sıvısı sıcaklığı',  unit: '°C',    group: 'engine',     bytes: 1, parse: (b) => b[0] - 40,           min: -40, max: 215 },
  { pid: '06', id: 'STFT1', label: 'Kısa vadeli yakıt trim B1', unit: '%',     group: 'fuel',       bytes: 1, parse: (b) => ((b[0] - 128) * 100) / 128, min: -100, max: 99.2 },
  { pid: '07', id: 'LTFT1', label: 'Uzun vadeli yakıt trim B1', unit: '%',     group: 'fuel',       bytes: 1, parse: (b) => ((b[0] - 128) * 100) / 128, min: -100, max: 99.2 },
  { pid: '08', id: 'STFT2', label: 'Kısa vadeli yakıt trim B2', unit: '%',     group: 'fuel',       bytes: 1, parse: (b) => ((b[0] - 128) * 100) / 128 },
  { pid: '09', id: 'LTFT2', label: 'Uzun vadeli yakıt trim B2', unit: '%',     group: 'fuel',       bytes: 1, parse: (b) => ((b[0] - 128) * 100) / 128 },
  { pid: '0A', id: 'FP',    label: 'Yakıt basıncı',             unit: 'kPa',   group: 'fuel',       bytes: 1, parse: (b) => b[0] * 3 },
  { pid: '0B', id: 'MAP',   label: 'Emme manifold basıncı',     unit: 'kPa',   group: 'engine',     bytes: 1, parse: (b) => b[0] },
  { pid: '0C', id: 'RPM',   label: 'Motor devri',               unit: 'rpm',   group: 'engine',     bytes: 2, parse: (b) => (b[0] * 256 + b[1]) / 4, min: 0, max: 8000 },
  { pid: '0D', id: 'SPD',   label: 'Araç hızı',                 unit: 'km/h',  group: 'engine',     bytes: 1, parse: (b) => b[0], min: 0, max: 255 },
  { pid: '0E', id: 'ADV',   label: 'Avans',                     unit: '°',     group: 'engine',     bytes: 1, parse: (b) => b[0] / 2 - 64 },
  { pid: '0F', id: 'IAT',   label: 'Emme havası sıcaklığı',     unit: '°C',    group: 'engine',     bytes: 1, parse: (b) => b[0] - 40 },
  { pid: '10', id: 'MAF',   label: 'MAF debisi',                unit: 'g/s',   group: 'engine',     bytes: 2, parse: (b) => (b[0] * 256 + b[1]) / 100 },
  { pid: '11', id: 'TPS',   label: 'Gaz kelebeği konumu',       unit: '%',     group: 'engine',     bytes: 1, parse: (b) => (b[0] * 100) / 255 },
  { pid: '1F', id: 'RUN',   label: 'Çalışma süresi',            unit: 's',     group: 'engine',     bytes: 2, parse: (b) => b[0] * 256 + b[1] },
  { pid: '21', id: 'DMIL',  label: 'MIL ile alınan mesafe',     unit: 'km',    group: 'emissions',  bytes: 2, parse: (b) => b[0] * 256 + b[1] },
  { pid: '2F', id: 'FUEL',  label: 'Yakıt seviyesi',            unit: '%',     group: 'fuel',       bytes: 1, parse: (b) => (b[0] * 100) / 255 },
  { pid: '30', id: 'WUPS',  label: 'Kod silindiğinden ısınma',  unit: 'count', group: 'emissions',  bytes: 1, parse: (b) => b[0] },
  { pid: '31', id: 'DCLR',  label: 'Kod silindiğinden mesafe',  unit: 'km',    group: 'emissions',  bytes: 2, parse: (b) => b[0] * 256 + b[1] },
  { pid: '33', id: 'BARO',  label: 'Barometrik basınç',         unit: 'kPa',   group: 'engine',     bytes: 1, parse: (b) => b[0] },
  { pid: '42', id: 'CMV',   label: 'Kontrol modülü voltajı',    unit: 'V',     group: 'electrical', bytes: 2, parse: (b) => (b[0] * 256 + b[1]) / 1000 },
  { pid: '43', id: 'ALOAD', label: 'Mutlak motor yükü',         unit: '%',     group: 'engine',     bytes: 2, parse: (b) => ((b[0] * 256 + b[1]) * 100) / 255 },
  { pid: '44', id: 'LAM',   label: 'Komut edilen lambda',       unit: 'ratio', group: 'fuel',       bytes: 2, parse: (b) => ((b[0] * 256 + b[1]) * 2) / 65536 },
  { pid: '46', id: 'AAT',   label: 'Ortam hava sıcaklığı',      unit: '°C',    group: 'engine',     bytes: 1, parse: (b) => b[0] - 40 },
  { pid: '5C', id: 'OILT',  label: 'Motor yağ sıcaklığı',       unit: '°C',    group: 'engine',     bytes: 1, parse: (b) => b[0] - 40 },
  { pid: '5E', id: 'FRATE', label: 'Yakıt tüketimi',            unit: 'L/h',   group: 'fuel',       bytes: 2, parse: (b) => (b[0] * 256 + b[1]) / 20 },
];

export const PID_BY_ID: Record<string, PIDDef> = Object.fromEntries(
  PID_REGISTRY.map((p) => [p.id, p])
);

export const PID_BY_HEX: Record<string, PIDDef> = Object.fromEntries(
  PID_REGISTRY.map((p) => [p.pid, p])
);

/** Default PIDs polled in the Live tab on first load. */
export const DEFAULT_LIVE_PIDS: string[] = [
  'RPM',
  'SPD',
  'ECT',
  'IAT',
  'MAP',
  'MAF',
  'STFT1',
  'LTFT1',
  'LOAD',
  'TPS',
];

/**
 * Extract data bytes following `marker` (e.g. '410C') from a raw response.
 * Normalization (echo, SEARCHING..., headers, multi-frame) is in response.ts.
 */
export function extractDataBytes(raw: string, marker: string): number[] | null {
  const clean = responseHex(raw);
  const idx = findMarker(clean, marker);
  if (idx === -1) return null;
  const data = clean.substring(idx + marker.length);
  const bytes: number[] = [];
  for (let i = 0; i + 2 <= data.length; i += 2) {
    const b = parseInt(data.substring(i, i + 2), 16);
    if (isNaN(b)) break;
    bytes.push(b);
  }
  return bytes;
}

export function parsePidResponse(def: PIDDef, raw: string): number | string | null {
  const bytes = extractDataBytes(raw, `41${def.pid}`);
  if (!bytes || bytes.length < def.bytes) return null;
  return def.parse(bytes.slice(0, def.bytes));
}

/**
 * Parse a Mode 02 (freeze frame) response for a registry PID.
 *
 * Request `02 <PID> <frame>` -> response `42 <PID> <frame> <data...>`.
 * The echoed frame byte sits between the PID and the data bytes, so the
 * marker we search for includes it; otherwise the frame byte would be
 * misread as the first data byte.
 */
export function parseFreezeFramePidResponse(
  def: PIDDef,
  raw: string,
  frame = '00'
): number | string | null {
  const bytes = extractDataBytes(raw, `42${def.pid}${frame.toUpperCase()}`);
  if (!bytes || bytes.length < def.bytes) return null;
  return def.parse(bytes.slice(0, def.bytes));
}

/**
 * PIDs probed for a freeze frame when the ECU does not answer the Mode 02
 * supported-PIDs bitmap (02 00 00). These are the values SAE J1979 ECUs
 * typically capture at the moment a DTC is set.
 */
export const FREEZE_FRAME_FALLBACK_IDS: string[] = [
  'LOAD', 'ECT', 'STFT1', 'LTFT1', 'STFT2', 'LTFT2', 'FP', 'MAP', 'RPM', 'SPD', 'ADV', 'IAT', 'MAF', 'TPS',
];

/**
 * Parse a "supported PIDs" bitmap response (Mode 01 PIDs 00, 20, 40, 60, 80, A0, C0, E0,
 * or the Mode 02 equivalent for freeze frame 00).
 * Each response covers 32 PIDs starting from baseHex+1.
 * Returns a list of supported hex PIDs (uppercase, two-digit).
 */
export function parseSupportedPids(raw: string, basePidHex: string, mode: '01' | '02' = '01'): string[] {
  // Mode 01 reply: 41 <base> AA BB CC DD.
  // Mode 02 reply: 42 <base> <frame> AA BB CC DD (frame byte echoed).
  const marker = mode === '01' ? `41${basePidHex.toUpperCase()}` : `42${basePidHex.toUpperCase()}00`;
  const bytes = extractDataBytes(raw, marker);
  if (!bytes || bytes.length < 4) return [];
  const baseNum = parseInt(basePidHex, 16);
  const supported: string[] = [];
  for (let i = 0; i < 4; i++) {
    const byte = bytes[i];
    for (let bit = 0; bit < 8; bit++) {
      if (byte & (1 << (7 - bit))) {
        const pidNum = baseNum + i * 8 + bit + 1;
        supported.push(pidNum.toString(16).toUpperCase().padStart(2, '0'));
      }
    }
  }
  return supported;
}

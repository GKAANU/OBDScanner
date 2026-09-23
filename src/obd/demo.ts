/**
 * Demo-mode ELM327 simulator: answers AT and OBD commands like a Wi-Fi
 * dongle plugged into a (fictional) running car, so the app can be used
 * without hardware (App Store review, first-run exploration).
 *
 * Output mimics a real adapter after the app's init sequence: echo off,
 * spaces off (ATS0), headers off, ISO 15765-4 CAN 11-bit, with ISO-TP
 * multi-frame replies for Mode 09 — so the real parsers are exercised.
 *
 * Deterministic: live values are smooth functions of elapsed time (no
 * randomness), which keeps tests stable. No I/O, no network.
 */
import { PID_REGISTRY, PID_BY_ID } from './pid-registry';

export const DEMO_VIN = 'DEMOVIN0000000001';
const DEMO_CALID = 'DEMO-CAL-0001';
const DEMO_CVN = '1A2B3C4D';
const DEMO_ECU_NAME = 'ECM-DEMO MOTOR';

/** PIDs the demo car does not support (inline 4-cylinder: no bank 2). */
const UNSUPPORTED_IDS = new Set(['STFT2', 'LTFT2']);

/** Snapshot stored with the freeze frame (at the moment P0133 was set). */
const FREEZE_FRAME_VALUES: Record<string, number> = {
  LOAD: 34.1,
  ECT: 88,
  STFT1: 3.1,
  LTFT1: 4.7,
  MAP: 41,
  RPM: 2120,
  SPD: 64,
  ADV: 18,
  IAT: 31,
  TPS: 16.5,
};

type DemoState = { dtcsCleared: boolean };

const hex2 = (n: number) => Math.round(n).toString(16).toUpperCase().padStart(2, '0');
const clampByte = (n: number) => Math.min(255, Math.max(0, Math.round(n)));
const u16 = (n: number): number[] => {
  const v = Math.min(0xffff, Math.max(0, Math.round(n)));
  return [v >> 8, v & 0xff];
};

/** Inverse of the registry formulas: physical value -> data bytes. */
const ENCODERS: Record<string, (v: number) => number[]> = {
  LOAD: (v) => [clampByte((v * 255) / 100)],
  ECT: (v) => [clampByte(v + 40)],
  STFT1: (v) => [clampByte((v * 128) / 100 + 128)],
  LTFT1: (v) => [clampByte((v * 128) / 100 + 128)],
  STFT2: (v) => [clampByte((v * 128) / 100 + 128)],
  LTFT2: (v) => [clampByte((v * 128) / 100 + 128)],
  FP: (v) => [clampByte(v / 3)],
  MAP: (v) => [clampByte(v)],
  RPM: (v) => u16(v * 4),
  SPD: (v) => [clampByte(v)],
  ADV: (v) => [clampByte((v + 64) * 2)],
  IAT: (v) => [clampByte(v + 40)],
  MAF: (v) => u16(v * 100),
  TPS: (v) => [clampByte((v * 255) / 100)],
  RUN: (v) => u16(v),
  DMIL: (v) => u16(v),
  FUEL: (v) => [clampByte((v * 255) / 100)],
  WUPS: (v) => [clampByte(v)],
  DCLR: (v) => u16(v),
  BARO: (v) => [clampByte(v)],
  CMV: (v) => u16(v * 1000),
  ALOAD: (v) => u16((v * 255) / 100),
  LAM: (v) => u16((v * 65536) / 2),
  AAT: (v) => [clampByte(v + 40)],
  OILT: (v) => [clampByte(v + 40)],
  FRATE: (v) => u16(v * 20),
};

/**
 * Live value of a registry PID `t` seconds after connecting: a car warming
 * up while driving a gentle stop-and-go loop.
 */
export function demoLiveValue(id: string, t: number, state: DemoState = { dtcsCleared: false }): number {
  const speed = Math.max(0, 38 + 34 * Math.sin(t / 9));
  const rpm = 780 + speed * 27 + 45 * Math.sin(t * 2.1);
  const load = 18 + speed * 0.45 + 4 * Math.sin(t * 0.7);
  const ect = 90 - 32 * Math.exp(-t / 45);
  switch (id) {
    case 'RPM': return rpm;
    case 'SPD': return speed;
    case 'LOAD': return load;
    case 'ALOAD': return load * 0.9;
    case 'ECT': return ect;
    case 'OILT': return ect - 6 + 4 * (1 - Math.exp(-t / 90));
    case 'IAT': return 29 + 2 * Math.sin(t / 20);
    case 'AAT': return 22;
    case 'MAP': return 32 + speed * 0.55 + 3 * Math.sin(t * 0.9);
    case 'MAF': return 2.6 + rpm * 0.0042 + speed * 0.05;
    case 'TPS': return 11 + speed * 0.28 + 2 * Math.sin(t * 1.3);
    case 'STFT1': return 2.4 * Math.sin(t * 1.7) + 0.8 * Math.sin(t * 5.3);
    case 'LTFT1': return 4.7;
    case 'STFT2': return 0;
    case 'LTFT2': return 0;
    case 'FP': return 381;
    case 'ADV': return 9 + speed * 0.18 + 2 * Math.sin(t * 1.1);
    case 'RUN': return 312 + t;
    case 'DMIL': return state.dtcsCleared ? 0 : 34;
    case 'FUEL': return 61.5 - t * 0.002;
    case 'WUPS': return state.dtcsCleared ? 0 : 12;
    case 'DCLR': return state.dtcsCleared ? 0 : 1840;
    case 'BARO': return 101;
    case 'CMV': return 14.1 + 0.08 * Math.sin(t / 3);
    case 'LAM': return 1 + 0.015 * Math.sin(t * 1.9);
    case 'FRATE': return 0.7 + speed * 0.075 + 0.1 * Math.sin(t);
    default: return 0;
  }
}

/** Mode 01 supported-PID bitmap for bank `base` (0x00, 0x20, ...). */
function supportedBitmap(supported: Set<number>, base: number): number[] {
  const bytes = [0, 0, 0, 0];
  for (let i = 1; i <= 32; i++) {
    if (supported.has(base + i)) bytes[(i - 1) >> 3] |= 0x80 >> ((i - 1) & 7);
  }
  return bytes;
}

const MODE01_SUPPORTED: Set<number> = (() => {
  const s = new Set<number>([0x01]);
  for (const p of PID_REGISTRY) if (!UNSUPPORTED_IDS.has(p.id)) s.add(parseInt(p.pid, 16));
  // Continuation bits so the scanner walks every bank that has PIDs.
  const max = Math.max(...s);
  for (let b = 0x20; b <= max; b += 0x20) s.add(b);
  return s;
})();

const FREEZE_SUPPORTED: Set<number> = new Set([
  0x02,
  ...Object.keys(FREEZE_FRAME_VALUES).map((id) => parseInt(PID_BY_ID[id].pid, 16)),
]);

/** Format bytes as a headers-off ISO-TP reply (length line + 0:/1: frames). */
function isoTp(bytes: number[]): string {
  const h = bytes.map(hex2);
  if (h.length <= 7) return h.join('');
  const lines = [h.length.toString(16).toUpperCase().padStart(3, '0'), `0:${h.slice(0, 6).join('')}`];
  for (let i = 6, n = 1; i < h.length; i += 7, n++) {
    lines.push(`${(n & 0xf).toString(16).toUpperCase()}:${h.slice(i, i + 7).join('').padEnd(14, '0')}`);
  }
  return lines.join('\r');
}

const ascii = (s: string, len?: number) => {
  const b = [...s].map((c) => c.charCodeAt(0));
  while (len !== undefined && b.length < len) b.push(0);
  return b;
};

/** Stateful simulator for one demo session. */
export class DemoSimulator {
  private state: DemoState = { dtcsCleared: false };

  /**
   * Response to `command` at `t` seconds, as the adapter would send it:
   * text followed by `\r\r>`.
   */
  respond(command: string, t: number): string {
    return `${this.body(command.toUpperCase().replace(/\s+/g, ''), t)}\r\r>`;
  }

  private body(cmd: string, t: number): string {
    if (cmd.startsWith('AT')) return this.at(cmd, t);
    if (!/^[0-9A-F]+$/.test(cmd) || cmd.length % 2 !== 0) return '?';
    const mode = cmd.substring(0, 2);
    const pid = cmd.substring(2, 4);
    switch (mode) {
      case '01': return cmd.length === 4 ? this.mode01(pid, t) : 'NO DATA';
      case '02': return cmd.length === 6 ? this.mode02(pid, cmd.substring(4, 6)) : 'NO DATA';
      case '03': return this.state.dtcsCleared ? '4300' : '430201330420';
      case '07': return this.state.dtcsCleared ? '4700' : '47010171';
      // Permanent codes survive Mode 04 until the monitor passes again.
      case '0A': return '4A010420';
      case '04':
        this.state.dtcsCleared = true;
        return '44';
      case '09': return cmd.length === 4 ? this.mode09(pid) : 'NO DATA';
      default: return 'NO DATA';
    }
  }

  private at(cmd: string, t: number): string {
    if (cmd === 'ATZ' || cmd === 'ATWS') return '\r\rELM327 v1.5';
    if (cmd === 'ATI') return 'ELM327 v1.5';
    if (cmd === 'AT@1') return 'OBDII to RS232 Interpreter (Demo)';
    if (cmd === 'ATRV') return `${(13.9 + 0.2 * Math.sin(t / 7)).toFixed(1)}V`;
    if (cmd === 'ATDP') return 'AUTO, ISO 15765-4 (CAN 11/500)';
    if (cmd === 'ATDPN') return 'A6';
    return 'OK';
  }

  private mode01(pid: string, t: number): string {
    const n = parseInt(pid, 16);
    if (n % 0x20 === 0) {
      if (n > 0 && !MODE01_SUPPORTED.has(n)) return 'NO DATA';
      return `41${pid}${supportedBitmap(MODE01_SUPPORTED, n).map(hex2).join('')}`;
    }
    if (n === 0x01) {
      // MIL + DTC count, then continuous / non-continuous monitor bytes.
      return this.state.dtcsCleared ? '4101000765E5' : '410182076504';
    }
    if (!MODE01_SUPPORTED.has(n)) return 'NO DATA';
    const def = PID_REGISTRY.find((p) => p.pid === pid);
    const enc = def && ENCODERS[def.id];
    if (!def || !enc) return 'NO DATA';
    return `41${pid}${enc(demoLiveValue(def.id, t, this.state)).map(hex2).join('')}`;
  }

  private mode02(pid: string, frame: string): string {
    if (frame !== '00' || this.state.dtcsCleared) {
      return pid === '02' && frame === '00' ? '4202000000' : 'NO DATA';
    }
    const n = parseInt(pid, 16);
    if (n === 0x00) return `420000${supportedBitmap(FREEZE_SUPPORTED, 0).map(hex2).join('')}`;
    if (n === 0x02) return '4202000133';
    const def = PID_REGISTRY.find((p) => p.pid === pid);
    const value = def ? FREEZE_FRAME_VALUES[def.id] : undefined;
    const enc = def && ENCODERS[def.id];
    if (!def || value === undefined || !enc) return 'NO DATA';
    return `42${pid}00${enc(value).map(hex2).join('')}`;
  }

  private mode09(pid: string): string {
    switch (pid) {
      case '00': return '4900' + '55400000';
      case '02': return isoTp([0x49, 0x02, 0x01, ...ascii(DEMO_VIN)]);
      case '04': return isoTp([0x49, 0x04, 0x01, ...ascii(DEMO_CALID, 16)]);
      case '06': return isoTp([0x49, 0x06, 0x01, ...DEMO_CVN.match(/../g)!.map((b) => parseInt(b, 16))]);
      case '0A': return isoTp([0x49, 0x0a, 0x01, ...ascii(DEMO_ECU_NAME, 20)]);
      default: return 'NO DATA';
    }
  }
}

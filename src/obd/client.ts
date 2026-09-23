import TcpSocket from 'react-native-tcp-socket';
import {
  detectOBDError,
  parseBatteryVoltage,
  parseCVN,
  parseDTCs,
  parseFreezeFrameDTC,
  parseMode09Ascii,
  parseReadiness,
  parseVIN,
  type ReadinessReport,
} from './parsers';
import {
  FREEZE_FRAME_FALLBACK_IDS,
  parsePidResponse,
  PID_BY_HEX,
  PID_BY_ID,
  parseFreezeFramePidResponse,
  parseSupportedPids,
  type PIDDef,
} from './pid-registry';

export type OBDConfig = { host: string; port: number; timeoutMs?: number };

export type FreezeFrameValue = { def: PIDDef; value: number | string };

export type FreezeFrame = {
  /** Frame number as two hex chars ("00" is the only frame most ECUs keep). */
  frame: string;
  /** The DTC that caused this frame to be stored, or null if no frame exists. */
  dtc: string | null;
  values: FreezeFrameValue[];
};

export type DTCKind = 'stored' | 'pending' | 'permanent';

export type VehicleInfo = {
  vin: string | null;
  calId: string | null;
  cvn: string | null;
  ecuName: string | null;
};

export type PidReading =
  | { status: 'ok'; value: number | string; raw: string }
  | { status: 'unsupported'; raw: string }
  | { status: 'invalid'; raw: string };

/** Mode 01 / 09 supported-PID bitmap banks, in query order. */
const SUPPORTED_PID_BANKS = ['00', '20', '40', '60', '80', 'A0', 'C0', 'E0'] as const;

const DTC_MODE: Record<DTCKind, string> = { stored: '03', pending: '07', permanent: '0A' };

export const DEFAULT_OBD_CONFIG: OBDConfig = {
  host: '192.168.0.10',
  port: 35000,
  timeoutMs: 5000,
};

/**
 * Single-flight TCP client for ELM327-class Wi-Fi OBD-II dongles.
 *
 * Notes:
 *  - The ELM327 terminates every response with the prompt char `>`. We resolve
 *    the in-flight command only when we see that.
 *  - We never overlap commands; clone dongles freeze when sent a second
 *    command before `>` arrives.
 *  - This client never makes any network calls except to the configured host.
 */
export class OBDClient {
  // The TcpSocket types are loose; we treat the socket as unknown-shaped.
  private socket: any = null;
  private buffer = '';
  private resolveCurrent: ((data: string) => void) | null = null;
  private rejectCurrent: ((err: Error) => void) | null = null;
  private currentTimer: ReturnType<typeof setTimeout> | null = null;

  async connect(config: OBDConfig = DEFAULT_OBD_CONFIG): Promise<void> {
    if (this.socket) {
      throw new Error('Already connected');
    }
    return new Promise((resolve, reject) => {
      try {
        const sock = TcpSocket.createConnection(
          { host: config.host, port: config.port },
          () => resolve()
        );
        this.socket = sock;
        sock.on('data', (data: Buffer | string) => {
          const chunk = typeof data === 'string' ? data : data.toString('utf8');
          this.buffer += chunk;
          if (this.buffer.includes('>')) {
            const response = this.buffer.replace('>', '').trim();
            this.buffer = '';
            if (this.resolveCurrent) {
              const r = this.resolveCurrent;
              this.clearCurrent();
              r(response);
            }
          }
        });
        sock.on('error', (err: Error) => {
          if (this.rejectCurrent) {
            const rj = this.rejectCurrent;
            this.clearCurrent();
            rj(err);
          } else {
            reject(err);
          }
        });
        sock.on('close', () => {
          this.socket = null;
        });
      } catch (e) {
        reject(e as Error);
      }
    });
  }

  private clearCurrent(): void {
    this.resolveCurrent = null;
    this.rejectCurrent = null;
    if (this.currentTimer) {
      clearTimeout(this.currentTimer);
      this.currentTimer = null;
    }
  }

  /**
   * Send a single AT or OBD command. Resolves with the raw text response
   * (sans trailing `>`). Rejects on timeout, socket error, or if another
   * command is in flight.
   */
  async send(command: string, timeoutMs = 5000): Promise<string> {
    if (!this.socket) throw new Error('Not connected');
    if (this.resolveCurrent) throw new Error('Another command in flight');
    return new Promise<string>((resolve, reject) => {
      this.resolveCurrent = resolve;
      this.rejectCurrent = reject;
      this.currentTimer = setTimeout(() => {
        if (this.resolveCurrent) {
          this.clearCurrent();
          reject(new Error(`Timeout waiting for response to: ${command}`));
        }
      }, timeoutMs);
      try {
        this.socket.write(command + '\r');
      } catch (e) {
        this.clearCurrent();
        reject(e as Error);
      }
    });
  }

  async init(): Promise<void> {
    await this.send('ATZ', 3000);
    await this.send('ATE0');
    await this.send('ATL0');
    await this.send('ATS0');
    await this.send('ATH0');
    await this.send('ATSP0');
    await this.send('0100', 8000);
  }

  // ---------------------------------------------------------------------
  // High-level API. UI code uses these; only the Terminal tab calls send().
  // ---------------------------------------------------------------------

  /** Read Mode 03 / 07 / 0A and return parsed DTCs. NO DATA means zero codes. */
  async readDTCs(kind: DTCKind): Promise<string[]> {
    return parseDTCs(await this.send(DTC_MODE[kind]));
  }

  /** Mode 04. Clears stored/pending DTCs and freeze frames (not permanent ones). */
  clearDTCs(): Promise<string> {
    return this.send('04');
  }

  /** Read a Mode 01 PID by registry id (e.g. 'RPM'). */
  async readPid(id: string): Promise<PidReading> {
    const def = PID_BY_ID[id];
    if (!def) throw new Error(`Unknown PID id: ${id}`);
    const raw = (await this.send(`01${def.pid}`)).trim();
    const err = detectOBDError(raw);
    if (err === 'NO_DATA' || err === 'UNKNOWN_COMMAND') return { status: 'unsupported', raw };
    const value = parsePidResponse(def, raw);
    return value === null ? { status: 'invalid', raw } : { status: 'ok', value, raw };
  }

  /** Mode 01 PID 01: MIL, DTC count, readiness monitors. */
  async readReadiness(): Promise<ReadinessReport | null> {
    return parseReadiness(await this.send('0101'));
  }

  /**
   * Probe Mode 01 supported-PID bitmaps (00, 20, 40 ...). Each bank covers
   * 32 PIDs; the last bit of a bank says whether the next bank exists.
   */
  async readSupportedPids(): Promise<string[]> {
    const all: string[] = [];
    for (const bank of SUPPORTED_PID_BANKS) {
      let list: string[];
      try {
        list = parseSupportedPids(await this.send(`01${bank}`), bank);
      } catch {
        break;
      }
      if (list.length === 0) break;
      all.push(...list);
      const nextBank = (parseInt(bank, 16) + 0x20).toString(16).toUpperCase().padStart(2, '0');
      if (!list.includes(nextBank)) break;
    }
    return all;
  }

  /** Mode 09: VIN (02), calibration ID (04), CVN (06), ECU name (0A). */
  async readVehicleInfo(): Promise<VehicleInfo> {
    const info: VehicleInfo = { vin: null, calId: null, cvn: null, ecuName: null };
    try {
      info.vin = parseVIN(await this.mode09('02'));
    } catch {}
    try {
      info.calId = parseMode09Ascii(await this.mode09('04'), '4904');
    } catch {}
    try {
      info.cvn = parseCVN(await this.mode09('06'));
    } catch {}
    try {
      info.ecuName = parseMode09Ascii(await this.mode09('0A'), '490A');
    } catch {}
    return info;
  }

  /** ATRV: adapter-measured battery voltage in volts, or null. */
  async readBatteryVoltage(): Promise<number | null> {
    return parseBatteryVoltage(await this.send('ATRV'));
  }

  /** ATDP: human-readable protocol name, or null if the adapter reports an error. */
  async readProtocolName(): Promise<string | null> {
    const raw = (await this.send('ATDP')).trim();
    return raw && !detectOBDError(raw) ? raw : null;
  }

  /** ATI: adapter chip version banner (e.g. "ELM327 v1.5"). */
  async readAdapterVersion(): Promise<string | null> {
    const raw = (await this.send('ATI')).trim();
    return raw || null;
  }

  private mode09(pid: string): Promise<string> {
    return this.send(`09${pid}`, 6000);
  }

  /** Raw Mode 02 request: `02 <PID> <frame>`. Frame 00 is the standard frame. */
  private freezeFrame(pid: string, frame = '00'): Promise<string> {
    return this.send(`02${pid}${frame}`);
  }

  /**
   * Read a complete freeze frame: which DTC triggered it (02 02 <frame>) and
   * the values of every registry PID the ECU stored in that frame.
   */
  async readFreezeFrame(frame = '00'): Promise<FreezeFrame> {
    const dtc = parseFreezeFrameDTC(await this.freezeFrame('02', frame), frame);
    if (!dtc) return { frame, dtc: null, values: [] };

    // Prefer the Mode 02 supported-PIDs bitmap; fall back to a fixed list.
    let defs: PIDDef[] = [];
    try {
      const supported = parseSupportedPids(await this.freezeFrame('00', frame), '00', '02');
      defs = supported.map((hex) => PID_BY_HEX[hex]).filter((d): d is PIDDef => !!d);
    } catch {
      // ignore — use fallback
    }
    if (defs.length === 0) {
      defs = FREEZE_FRAME_FALLBACK_IDS.map((id) => PID_BY_ID[id]).filter((d): d is PIDDef => !!d);
    }

    const values: FreezeFrameValue[] = [];
    for (const def of defs) {
      try {
        const raw = await this.freezeFrame(def.pid, frame);
        if (detectOBDError(raw)) continue;
        const value = parseFreezeFramePidResponse(def, raw, frame);
        if (value !== null) values.push({ def, value });
      } catch {
        // skip this PID
      }
    }
    return { frame, dtc, values };
  }

  disconnect(): void {
    try {
      this.socket?.destroy();
    } catch {
      // ignore
    }
    this.socket = null;
    this.buffer = '';
    this.clearCurrent();
  }

  isConnected(): boolean {
    return !!this.socket;
  }
}

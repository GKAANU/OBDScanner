import type { Transport } from './transport';
import { atstCommand, initProbeError, OBDError, recoveryAction, takeResponse } from './protocol';
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

export type OBDConfig = {
  host: string;
  port: number;
  /** Default per-command timeout in ms (individual commands may override). */
  timeoutMs?: number;
  /** Slow ECU mode: send ATST96 on init and use longer command timeouts. */
  slowEcu?: boolean;
  /** Demo mode: talk to the built-in simulator instead of a real dongle. */
  demo?: boolean;
};

export type SendOptions = {
  /** Override the default timeout for this command. */
  timeoutMs?: number;
  /** Apply STOPPED / BUS INIT recovery (default true). The Terminal disables it. */
  recover?: boolean;
};

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
  slowEcu: false,
  demo: false,
};

/** Host-side timeout floor used while slow ECU mode is on. */
const SLOW_ECU_TIMEOUT_MS = 10000;

/** After a timeout: how long to wait for the late reply / the probe reply. */
const RESYNC_GRACE_MS = 1500;
/** After a timeout: silence required after the last prompt before resuming. */
const RESYNC_QUIET_MS = 100;
/** Harmless command used to flush the adapter when it stays silent. */
const RESYNC_PROBE = 'ATI';

/**
 * Single-flight client for ELM327-class OBD-II adapters.
 *
 * Notes:
 *  - The ELM327 terminates every response with the prompt char `>`. A command
 *    resolves only when that prompt arrives. Bytes left over when the next
 *    command is written are stale and dropped.
 *  - After a timeout the next command first resyncs (see resync()) so a late
 *    reply is never mistaken for the answer to a later command.
 *  - Commands are queued and never overlap; clone dongles freeze when sent a
 *    second command before `>` arrives.
 *  - Transport-agnostic: TCP for real dongles, an in-memory simulator for
 *    demo mode. The client itself does no I/O besides the transport.
 */
export class OBDClient {
  private transport: Transport | null = null;
  private buffer = '';
  private pending: {
    resolve: (data: string) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  /**
   * Set when a command timed out: the adapter may still send that command's
   * reply (and its `>`) later. The next command resyncs first so the late
   * reply is never taken as its answer.
   */
  private stale = false;
  private defaultTimeoutMs = DEFAULT_OBD_CONFIG.timeoutMs ?? 5000;
  private slowEcu = false;
  private disconnectListener: ((err: Error) => void) | null = null;

  /**
   * Called when the link drops without disconnect() being called
   * (dongle powered off, Wi-Fi lost, socket error).
   */
  setDisconnectListener(listener: ((err: Error) => void) | null): void {
    this.disconnectListener = listener;
  }

  async connect(transport: Transport, config: Pick<OBDConfig, 'timeoutMs' | 'slowEcu'> = {}): Promise<void> {
    if (this.transport) throw new Error('Already connected');
    this.slowEcu = !!config.slowEcu;
    const base = config.timeoutMs ?? DEFAULT_OBD_CONFIG.timeoutMs ?? 5000;
    this.defaultTimeoutMs = this.slowEcu ? Math.max(base, SLOW_ECU_TIMEOUT_MS) : base;
    this.buffer = '';
    this.stale = false;

    await transport.open({
      onData: (chunk) => {
        if (this.transport !== transport) return;
        this.onData(chunk);
      },
      onClose: (error) => {
        // Ignore closes of a transport we already dropped via disconnect().
        if (this.transport !== transport) return;
        this.transport = null;
        this.buffer = '';
        this.stale = false;
        const err = new OBDError('CONNECTION_CLOSED', error?.message ?? 'Connection closed');
        this.failPending(err);
        this.disconnectListener?.(err);
      },
    });
    this.transport = transport;
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    for (;;) {
      const { response, rest } = takeResponse(this.buffer);
      if (response === null) return;
      this.buffer = rest;
      const p = this.pending;
      if (p) {
        this.pending = null;
        clearTimeout(p.timer);
        p.resolve(response);
      }
      // A prompt with nothing in flight is discarded (late replies are
      // normally absorbed by resync()).
    }
  }

  private failPending(err: Error): void {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    clearTimeout(p.timer);
    p.reject(err);
  }

  /**
   * Send one AT or OBD command and resolve with the raw response text (sans
   * trailing `>`). Commands are queued; this never overlaps two commands on
   * the wire. Applies STOPPED / BUS INIT recovery unless `recover: false`.
   */
  send(command: string, options: SendOptions | number = {}): Promise<string> {
    const opts: SendOptions = typeof options === 'number' ? { timeoutMs: options } : options;
    const requested = opts.timeoutMs ?? this.defaultTimeoutMs;
    const timeoutMs = this.slowEcu ? Math.max(requested, this.defaultTimeoutMs) : requested;
    const run = this.queue.then(() => this.sendWithRecovery(command, timeoutMs, opts.recover !== false));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async sendWithRecovery(command: string, timeoutMs: number, recover: boolean): Promise<string> {
    const raw = await this.sendOnce(command, timeoutMs);
    if (!recover) return raw;
    switch (recoveryAction(raw, 0)) {
      case 'retry':
        return this.sendOnce(command, timeoutMs);
      case 'reprotocol':
        await this.sendOnce('ATSP0', timeoutMs);
        // Auto-detect runs again on the next OBD request: allow extra time.
        return this.sendOnce(command, Math.max(timeoutMs, 8000));
      default:
        return raw;
    }
  }

  private async sendOnce(command: string, timeoutMs: number): Promise<string> {
    if (this.stale) await this.resync(timeoutMs);
    const transport = this.transport;
    if (!transport) throw new OBDError('NOT_CONNECTED', 'Not connected');
    // The adapter is silent between a prompt and the next command, so any
    // bytes still buffered belong to an earlier exchange: drop them.
    this.buffer = '';
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending?.timer === timer) {
          this.pending = null;
          this.stale = true;
          reject(new OBDError('TIMEOUT', `Timeout waiting for response to: ${command}`));
        }
      }, timeoutMs);
      this.pending = { resolve, reject, timer };
      try {
        transport.write(command + '\r');
      } catch (e) {
        this.failPending(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  /**
   * Wait for the next `>` without sending anything. Resolves with the
   * response text, or null if no prompt arrives within `ms`.
   */
  private waitForPrompt(ms: number): Promise<string | null> {
    if (!this.transport) return Promise.reject(new OBDError('NOT_CONNECTED', 'Not connected'));
    return new Promise<string | null>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending?.timer === timer) {
          this.pending = null;
          resolve(null);
        }
      }, ms);
      this.pending = { resolve, reject, timer };
    });
  }

  /**
   * Re-align request/response framing after a timeout.
   *
   * 1. Give the timed-out command a short grace period to finish; its late
   *    reply is discarded.
   * 2. If the adapter stays silent, send a harmless probe (ATI). Any byte
   *    also interrupts an adapter that is still busy (it answers STOPPED).
   * 3. Drain trailing prompts until the line is quiet, so an interrupted
   *    probe that yields two prompts cannot leak into the next command.
   *
   * If the adapter never answers, `stale` stays set and the next command
   * tries again.
   */
  private async resync(timeoutMs: number): Promise<void> {
    const grace = Math.min(timeoutMs, RESYNC_GRACE_MS);
    let got = await this.waitForPrompt(grace);
    if (got === null) {
      const transport = this.transport;
      if (!transport) throw new OBDError('NOT_CONNECTED', 'Not connected');
      this.buffer = '';
      transport.write(RESYNC_PROBE + '\r');
      got = await this.waitForPrompt(grace);
      if (got === null) return;
    }
    while ((await this.waitForPrompt(RESYNC_QUIET_MS)) !== null) {
      // discard
    }
    this.stale = false;
    this.buffer = '';
  }

  /**
   * ELM327 init sequence. Throws an OBDError if the vehicle does not answer
   * the 0100 probe (ignition off, wrong protocol, no ECU).
   */
  async init(): Promise<void> {
    await this.send('ATZ', 3000);
    await this.send('ATE0');
    await this.send('ATL0');
    await this.send('ATS0');
    await this.send('ATH0');
    if (this.slowEcu) await this.setAdapterTimeout(600);
    await this.send('ATSP0');
    const probe = await this.send('0100', 8000);
    const err = initProbeError(probe);
    if (err) {
      throw new OBDError(err as 'UNABLE_TO_CONNECT' | 'BUS_INIT_ERROR' | 'CAN_ERROR' | 'NO_DATA', `0100 -> ${probe}`);
    }
  }

  /** Set the adapter's ECU response timeout (ATST) for slow ECUs. */
  setAdapterTimeout(ms: number): Promise<string> {
    return this.send(atstCommand(ms));
  }

  /** Label of the current transport endpoint, or null when disconnected. */
  endpointLabel(): string | null {
    return this.transport?.label ?? null;
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

  /** User-initiated disconnect. Does not fire the disconnect listener. */
  disconnect(): void {
    const t = this.transport;
    this.transport = null;
    this.buffer = '';
    this.stale = false;
    this.failPending(new OBDError('CONNECTION_CLOSED', 'Disconnected'));
    t?.close();
  }

  isConnected(): boolean {
    return !!this.transport;
  }
}

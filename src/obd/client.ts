import type { Transport } from './transport';
import {
  atstCommand,
  classifyConnectError,
  initProbeError,
  OBDError,
  probeSucceeded,
  recoveryAction,
  takeResponse,
  type ConnectErrorKind,
  type ConnectStep,
} from './protocol';
import { NOOP_LOGGER, type DiagLogger } from './diag-log';
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
  /** Log TX/RX even after init (the Terminal sets this). */
  trace?: boolean;
  /**
   * Internal (init): after an earlier timeout, skip the grace + ATI resync
   * and just drop buffered bytes. Keeps a silent adapter from cascading
   * extra waits during the reset steps.
   */
  resync?: boolean;
  /** Internal (init): use timeoutMs as-is, without the slow-ECU floor (AT commands). */
  exactTimeout?: boolean;
};

/** Result of init(): values read on the way so the caller need not re-query. */
export type InitResult = {
  adapterVersion: string | null;
  battery: number | null;
};

export type OBDClientOptions = {
  /** Connection log sink ("Bağlantı günlüğü"). */
  log?: DiagLogger;
};

export type ConnectHooks = {
  /** Called right before the single automatic TCP retry is scheduled. */
  onRetry?: () => void;
};

/** TCP failures worth one automatic retry (Wi-Fi may still be associating). */
const RETRYABLE_TCP: ReadonlySet<ConnectErrorKind> = new Set(['no_route', 'net_unreachable', 'timeout']);
/** Delay before the automatic TCP retry. */
export const TCP_RETRY_DELAY_MS = 2500;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Normalize anything a transport's open() threw into a tcp-step OBDError. */
function toTcpError(e: unknown): OBDError {
  if (e instanceof OBDError) return e.step ? e : e.withStep('tcp');
  const raw = e instanceof Error ? e.message : String(e);
  return new OBDError('CONNECT_FAILED', raw, { step: 'tcp', raw });
}

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

/** PID whose bit says the next supported-PID bank exists ('00' -> '20'). */
function nextBank(bank: string): string {
  return (parseInt(bank, 16) + 0x20).toString(16).toUpperCase().padStart(2, '0');
}

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

// init() timings (ms). A silent adapter fails the reset step after
// 300 + 1000 + 5000 + 3000 + 300 + 3000 = 12.6 s.
const FLUSH_SETTLE_MS = 300;
const FLUSH_WAIT_MS = 1000;
const ATZ_TIMEOUT_MS = 5000;
const ATWS_TIMEOUT_MS = 3000;
const RESET_QUIET_MS = 300;
const ATE0_TIMEOUT_MS = 3000;
const SETUP_TIMEOUT_MS = 3000;
const ADAPTER_INFO_TIMEOUT_MS = 2000;
const PROBE_TIMEOUT_MS = 15000;

/** True for a Mode 04 (clear DTCs) request, however it is spaced. */
function isMode04(command: string): boolean {
  const c = command.replace(/\s+/g, '').toUpperCase();
  return c === '04' || c === '4';
}

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
  /** Transport whose open() is still in progress; disconnect() aborts it. */
  private opening: Transport | null = null;
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
  private readonly log: DiagLogger;
  /**
   * Log every TX/RX. True while connecting/initializing; after init only
   * errors, timeouts and recovery actions are logged so live polling does
   * not evict the connect lines from the ring buffer.
   */
  private verbose = true;

  constructor(options: OBDClientOptions = {}) {
    this.log = options.log ?? NOOP_LOGGER;
  }

  /**
   * Called when the link drops without disconnect() being called
   * (dongle powered off, Wi-Fi lost, socket error).
   */
  setDisconnectListener(listener: ((err: Error) => void) | null): void {
    this.disconnectListener = listener;
  }

  /**
   * Open the transport. A TCP failure of kind no_route / net_unreachable /
   * timeout is retried exactly once after 2.5 s (refused is not: the host
   * answered, the port is wrong). disconnect() aborts, also during the wait.
   */
  async connect(
    transport: Transport,
    config: Pick<OBDConfig, 'timeoutMs' | 'slowEcu'> = {},
    hooks: ConnectHooks = {}
  ): Promise<void> {
    if (this.transport || this.opening) throw new Error('Already connected');
    this.slowEcu = !!config.slowEcu;
    const base = config.timeoutMs ?? DEFAULT_OBD_CONFIG.timeoutMs ?? 5000;
    this.defaultTimeoutMs = this.slowEcu ? Math.max(base, SLOW_ECU_TIMEOUT_MS) : base;
    this.buffer = '';
    this.stale = false;
    this.verbose = true;

    this.opening = transport;
    const aborted = () => this.opening !== transport;
    for (let attempt = 1; ; attempt++) {
      try {
        await this.openTransport(transport);
        break;
      } catch (e) {
        if (aborted()) throw new OBDError('CONNECTION_CLOSED', 'Disconnected while connecting');
        const err = toTcpError(e);
        const kind = classifyConnectError(err.raw ?? err.message);
        this.log.log(`tcp attempt ${attempt} failed: kind=${kind} raw=${err.raw ?? err.message}`);
        if (attempt === 1 && RETRYABLE_TCP.has(kind)) {
          this.log.log(`tcp retry in ${TCP_RETRY_DELAY_MS}ms`);
          hooks.onRetry?.();
          await sleep(TCP_RETRY_DELAY_MS);
          if (aborted()) throw new OBDError('CONNECTION_CLOSED', 'Disconnected while connecting');
          continue;
        }
        this.opening = null;
        throw err;
      }
    }
    if (aborted()) {
      // disconnect() was called while the link was opening.
      transport.close();
      throw new OBDError('CONNECTION_CLOSED', 'Disconnected while connecting');
    }
    this.opening = null;
    this.transport = transport;
  }

  private openTransport(transport: Transport): Promise<void> {
    return transport.open({
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
      } else {
        // A prompt with nothing in flight is discarded (late replies are
        // normally absorbed by resync()).
        this.log.log(`drop unsolicited reply: ${response}`);
      }
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
    const timeoutMs =
      this.slowEcu && !opts.exactTimeout ? Math.max(requested, this.defaultTimeoutMs) : requested;
    const run = this.queue.then(() => this.sendWithRecovery(command, timeoutMs, opts));
    let next: Promise<unknown> = run.catch(() => undefined);
    if (isMode04(command)) {
      // A bare CR makes an ELM327 repeat its last command, and init/scan
      // send one. Make sure that last command is never Mode 04.
      next = next.then(() => this.sendOnce('ATI', 2000, { resync: true }).catch(() => undefined));
    }
    this.queue = next;
    return run;
  }

  private async sendWithRecovery(command: string, timeoutMs: number, opts: SendOptions): Promise<string> {
    const raw = await this.sendOnce(command, timeoutMs, opts);
    if (opts.recover === false) return raw;
    switch (recoveryAction(raw, 0)) {
      case 'retry':
        this.log.log(`recovery: STOPPED -> retry ${command}`);
        return this.sendOnce(command, timeoutMs, opts);
      case 'reprotocol':
        this.log.log(`recovery: BUS INIT ERROR -> ATSP0, retry ${command}`);
        await this.sendOnce('ATSP0', timeoutMs, opts);
        // Auto-detect runs again on the next OBD request: allow extra time.
        return this.sendOnce(command, Math.max(timeoutMs, 8000), opts);
      default:
        return raw;
    }
  }

  private async sendOnce(command: string, timeoutMs: number, opts: SendOptions = {}): Promise<string> {
    if (this.stale) {
      if (opts.resync === false) {
        this.stale = false;
      } else {
        await this.resync(timeoutMs);
      }
    }
    const transport = this.transport;
    if (!transport) throw new OBDError('NOT_CONNECTED', 'Not connected');
    // The adapter is silent between a prompt and the next command, so any
    // bytes still buffered belong to an earlier exchange: drop them.
    this.dropBuffer();
    const trace = this.verbose || !!opts.trace;
    if (trace) this.log.log(`TX ${command}\r`);
    const sentAt = Date.now();
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending?.timer === timer) {
          this.pending = null;
          this.stale = true;
          this.log.log(`timeout ${timeoutMs}ms waiting for ${command}${trace ? '' : ' (quiet mode)'}`);
          reject(new OBDError('TIMEOUT', `Timeout waiting for response to: ${command}`));
        }
      }, timeoutMs);
      this.pending = {
        resolve: (data) => {
          if (trace) this.log.log(`RX ${Date.now() - sentAt}ms ${data}`);
          resolve(data);
        },
        reject,
        timer,
      };
      try {
        transport.write(command + '\r');
      } catch (e) {
        this.failPending(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  /** Discard buffered bytes that belong to no command (logged). */
  private dropBuffer(): void {
    if (this.buffer.length > 0) this.log.log(`drop ${this.buffer.length} stray bytes: ${this.buffer}`);
    this.buffer = '';
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
      this.dropBuffer();
      this.log.log(`resync: silent for ${grace}ms, TX ${RESYNC_PROBE}\r`);
      transport.write(RESYNC_PROBE + '\r');
      got = await this.waitForPrompt(grace);
      if (got === null) {
        this.log.log('resync: no answer, still out of sync');
        return;
      }
    }
    this.log.log(`resync: discarded late reply: ${got}`);
    let extra: string | null;
    while ((extra = await this.waitForPrompt(RESYNC_QUIET_MS)) !== null) {
      this.log.log(`resync: discarded: ${extra}`);
    }
    this.stale = false;
    this.dropBuffer();
  }

  /**
   * Wait up to `firstMs` for a prompt, then keep draining prompts until the
   * line has been quiet for `quietMs`. Everything received is logged and
   * discarded (banners, echoes of an interrupted command).
   */
  private async drain(firstMs: number, quietMs: number, what: string): Promise<void> {
    let got = await this.waitForPrompt(firstMs);
    while (got !== null) {
      this.log.log(`${what}: discarded reply: ${got}`);
      got = await this.waitForPrompt(quietMs);
    }
    this.dropBuffer();
  }

  /**
   * ELM327 init sequence:
   *
   *   reset:        300 ms settle, bare CR flush (wait <= 1 s for `>`),
   *                 ATZ (5 s; on timeout ATWS 3 s), 300 ms quiet + drain,
   *                 ATE0 (3 s, fatal)
   *   setup:        ATL0, ATS0, ATH0, [ATST92 in slow ECU mode]
   *   adapter-info: ATI, ATRV (2 s each, non-fatal)
   *   probe:        ATSP0, 0100 (15 s). Only a reply with the 4100 marker
   *                 counts; anything else is a vehicle/probe failure.
   *
   * The reset steps never run the timeout resync, so a silent adapter
   * fails within ~12.6 s after the TCP open. AT setters answering `?`
   * are not fatal. Throws an OBDError tagged with the failing step.
   */
  async init(): Promise<InitResult> {
    this.verbose = true;
    let step: ConnectStep = 'reset';
    const enter = (s: ConnectStep) => {
      step = s;
      this.log.log(`step ${s}`);
    };
    const quick = (cmd: string, timeoutMs: number, resync = true) =>
      this.send(cmd, { timeoutMs, exactTimeout: true, recover: false, resync });
    /** Non-fatal command: resolves null on timeout. */
    const optional = async (cmd: string, timeoutMs: number, resync = true): Promise<string | null> => {
      try {
        return await quick(cmd, timeoutMs, resync);
      } catch (e) {
        if (e instanceof OBDError && e.code === 'TIMEOUT') return null;
        throw e;
      }
    };

    const result: InitResult = { adapterVersion: null, battery: null };
    try {
      enter('reset');
      await this.flushLine();
      const atz = await optional('ATZ', ATZ_TIMEOUT_MS, false);
      if (atz === null) {
        this.log.log('ATZ silent: trying ATWS (warm start)');
        await optional('ATWS', ATWS_TIMEOUT_MS, false);
      }
      await this.enqueue(() => this.drain(RESET_QUIET_MS, RESYNC_QUIET_MS, 'after reset'));
      await quick('ATE0', ATE0_TIMEOUT_MS, false);

      enter('setup');
      await quick('ATL0', SETUP_TIMEOUT_MS);
      await quick('ATS0', SETUP_TIMEOUT_MS);
      await quick('ATH0', SETUP_TIMEOUT_MS);
      if (this.slowEcu) await quick(atstCommand(600), SETUP_TIMEOUT_MS);

      enter('adapter-info');
      const ati = await optional('ATI', ADAPTER_INFO_TIMEOUT_MS);
      result.adapterVersion = ati && !detectOBDError(ati) ? ati.trim() || null : null;
      const atrv = await optional('ATRV', ADAPTER_INFO_TIMEOUT_MS);
      result.battery = atrv ? parseBatteryVoltage(atrv) : null;

      enter('probe');
      await quick('ATSP0', SETUP_TIMEOUT_MS);
      // Recovery stays on: STOPPED is retried, BUS INIT ERROR re-runs ATSP0.
      const probe = await this.send('0100', { timeoutMs: PROBE_TIMEOUT_MS, exactTimeout: true });
      if (!probeSucceeded(probe)) {
        const code = (initProbeError(probe) ?? 'PROBE_FAILED') as
          | 'UNABLE_TO_CONNECT'
          | 'BUS_INIT_ERROR'
          | 'CAN_ERROR'
          | 'NO_DATA'
          | 'PROBE_FAILED';
        throw new OBDError(code, `0100 -> ${probe}`, { step: 'probe', raw: probe });
      }
    } catch (e) {
      const err =
        e instanceof OBDError
          ? e.step
            ? e
            : e.withStep(step)
          : new OBDError('CONNECTION_CLOSED', e instanceof Error ? e.message : String(e), { step });
      this.log.log(`init failed at ${err.step}: ${err.code} ${err.raw ?? err.message}`);
      throw err;
    }
    this.log.log('init ok; logging only errors, timeouts and recovery from now on');
    this.verbose = false;
    return result;
  }

  /** Run `fn` in the command queue (no other command overlaps it). */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /**
   * Reset step 1: wait for the link to settle, send a bare CR, wait up to
   * 1 s for a prompt and discard whatever arrived (banners some Wi-Fi
   * clones send on connect, a half-typed command from an earlier session).
   */
  private flushLine(): Promise<void> {
    return this.enqueue(async () => {
      await sleep(FLUSH_SETTLE_MS);
      const transport = this.transport;
      if (!transport) throw new OBDError('NOT_CONNECTED', 'Not connected');
      this.dropBuffer();
      this.log.log('TX \\r (flush)');
      transport.write('\r');
      const got = await this.waitForPrompt(FLUSH_WAIT_MS);
      if (got === null) {
        this.log.log(`flush: no prompt within ${FLUSH_WAIT_MS}ms (ignored)`);
        this.dropBuffer();
        return;
      }
      this.log.log(`flush: discarded reply: ${got}`);
      await this.drain(RESYNC_QUIET_MS, RESYNC_QUIET_MS, 'flush');
    });
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
      if (!list.includes(nextBank(bank))) break;
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

    // Prefer the Mode 02 supported-PIDs bitmaps (banks 00, 20, 40 ... chained
    // like Mode 01); fall back to a fixed list.
    const supported: string[] = [];
    for (const bank of SUPPORTED_PID_BANKS) {
      let list: string[];
      try {
        list = parseSupportedPids(await this.freezeFrame(bank, frame), bank, '02', frame);
      } catch {
        break;
      }
      supported.push(...list);
      if (!list.includes(nextBank(bank))) break;
    }
    let defs = supported.map((hex) => PID_BY_HEX[hex]).filter((d): d is PIDDef => !!d);
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
    const opening = this.opening;
    this.opening = null;
    opening?.close();
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

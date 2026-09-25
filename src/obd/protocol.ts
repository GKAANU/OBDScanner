/**
 * Pure ELM327 session logic: response framing, error classification,
 * recovery decisions, and user-facing (Turkish) error messages.
 *
 * No I/O and no state. OBDClient composes these; tests cover them directly.
 */
import { detectOBDError } from './parsers';
import { findMarker, responseMessages } from './response';

/**
 * Split an accumulated receive buffer at the FIRST `>` prompt.
 *
 * Returns the response text before the prompt (trimmed) and whatever arrived
 * after it, which must be kept for the next command. `response` is null while
 * no prompt has arrived yet.
 */
export function takeResponse(buffer: string): { response: string | null; rest: string } {
  const idx = buffer.indexOf('>');
  if (idx === -1) return { response: null, rest: buffer };
  return { response: buffer.substring(0, idx).trim(), rest: buffer.substring(idx + 1) };
}

/** What the client should do after receiving a response. */
export type RecoveryAction =
  /** Response is final; hand it to the caller. */
  | 'none'
  /** `STOPPED`: the adapter was interrupted mid-command. Send it again once. */
  | 'retry'
  /** `BUS INIT...ERROR`: re-run protocol auto-detect (ATSP0), then retry once. */
  | 'reprotocol';

/**
 * Decide how to recover from a response. `attempt` is 0 for the first
 * response to a command; recovery happens at most once per command.
 */
export function recoveryAction(raw: string, attempt: number): RecoveryAction {
  if (attempt > 0) return 'none';
  const err = detectOBDError(raw);
  if (err === 'STOPPED') return 'retry';
  if (err === 'BUS_INIT_ERROR') return 'reprotocol';
  return 'none';
}

/**
 * Errors in the response to the init probe (`0100`) that mean the vehicle
 * is not reachable, so the connection should not be reported as ready.
 */
export function initProbeError(raw: string): string | null {
  const err = detectOBDError(raw);
  if (err === 'UNABLE_TO_CONNECT' || err === 'BUS_INIT_ERROR' || err === 'CAN_ERROR' || err === 'NO_DATA') {
    return err;
  }
  return null;
}

/**
 * True only if the init probe (`0100`) reply carries a `41 00` message.
 * ERROR, ERR94, LV RESET, `?`, NO DATA, UNABLE TO CONNECT, BUS INIT ERROR,
 * CAN ERROR and empty replies all count as failures.
 */
export function probeSucceeded(raw: string): boolean {
  return responseMessages(raw).some((m) => findMarker(m, '4100') === 0);
}

/**
 * Build an `ATST xx` command. The ELM327 unit is 4.096 ms; `xx` is hex,
 * clamped to 01..FF (4 ms .. ~1 s). `ATST96` (~600 ms) suits slow ECUs.
 */
export function atstCommand(ms: number): string {
  const units = Math.min(0xff, Math.max(1, Math.round(ms / 4.096)));
  return `ATST${units.toString(16).toUpperCase().padStart(2, '0')}`;
}

/** What the Terminal may do with a free-form command. */
export type TerminalPolicy =
  /** Send as-is. */
  | 'allow'
  /** Mode 04 (clear DTCs): send only after the user confirms the warning. */
  | 'confirm-clear'
  /** Monitor commands (ATMA, STMA ...) stream forever and never return `>`. */
  | 'block-monitor'
  /** OBD services that write to or actuate the vehicle. Otova is read-only. */
  | 'block-write';

/** Read-only SAE J1979 services (Mode 08 actuates on-board tests, so it is excluded). */
const READ_ONLY_SERVICES = new Set(['01', '02', '03', '05', '06', '07', '09', '0A']);

/**
 * Classify a Terminal command. AT/ST commands only configure the adapter and
 * are allowed except the monitor family. Hex requests are allowed only for
 * read-only OBD services; Mode 04 needs confirmation; everything else (UDS
 * writes, routines, actuator tests ...) is blocked.
 */
export function terminalPolicy(command: string): TerminalPolicy {
  const cmd = command.replace(/\s+/g, '').toUpperCase();
  if (cmd.startsWith('AT') || cmd.startsWith('ST')) {
    return /^(AT|ST)M[ARTP]/.test(cmd) ? 'block-monitor' : 'allow';
  }
  if (!/^[0-9A-F]+$/.test(cmd)) return 'allow'; // adapter answers "?"
  const service = cmd.length === 1 ? `0${cmd}` : cmd.substring(0, 2);
  if (service === '04') return 'confirm-clear';
  return READ_ONLY_SERVICES.has(service) ? 'allow' : 'block-write';
}

/** Connect/init phase an error happened in (for messages and the log). */
export type ConnectStep = 'tcp' | 'reset' | 'setup' | 'adapter-info' | 'probe';

/** Coarse class of a TCP connect failure, from the native error text. */
export type ConnectErrorKind = 'refused' | 'no_route' | 'net_unreachable' | 'timeout' | 'other';

export type OBDErrorCode =
  | 'TIMEOUT'
  | 'NOT_CONNECTED'
  | 'CONNECTION_CLOSED'
  | 'CONNECT_FAILED'
  | 'UNABLE_TO_CONNECT'
  | 'BUS_INIT_ERROR'
  | 'CAN_ERROR'
  | 'NO_DATA'
  | 'PROBE_FAILED'
  | 'ADAPTER_NOT_FOUND';

/** Thrown by OBDClient; `code` is stable, `message` is for logs only. */
export class OBDError extends Error {
  /** Connect/init phase, when the error happened while connecting. */
  public readonly step?: ConnectStep;
  /** Unmodified native / adapter text that caused the error. */
  public readonly raw?: string;

  constructor(
    public readonly code: OBDErrorCode,
    message: string,
    extra: { step?: ConnectStep; raw?: string } = {}
  ) {
    super(message);
    this.name = 'OBDError';
    this.step = extra.step;
    this.raw = extra.raw;
  }

  /** Same error tagged with a connect step (keeps code, message and raw). */
  withStep(step: ConnectStep): OBDError {
    return new OBDError(this.code, this.message, { step, raw: this.raw ?? this.message });
  }
}

/**
 * Classify a TCP connect failure from its raw text. On iOS the native
 * 'error' event carries NSError.localizedDescription (e.g. "Connection
 * refused", "No route to host"); errno names cover other platforms; our own
 * JS backstop timer reports "timed out".
 */
export function classifyConnectError(raw: string): ConnectErrorKind {
  if (/refused|ECONNREFUSED/i.test(raw)) return 'refused';
  if (/no route|EHOSTUNREACH/i.test(raw)) return 'no_route';
  if (/network is unreachable|ENETUNREACH/i.test(raw)) return 'net_unreachable';
  if (/timed out|timeout|ETIMEDOUT/i.test(raw)) return 'timeout';
  return 'other';
}

/** Second line shown under Wi-Fi / routing failures. */
export const LOCAL_NETWORK_HINT =
  'iOS yerel ağ izni gerekli: Ayarlar > Gizlilik ve Güvenlik > Yerel Ağ > Otova açık olmalı.';

const TCP_MESSAGES: Record<ConnectErrorKind, string> = {
  refused:
    "Adaptör bağlantıyı reddetti. Port numarası yanlış olabilir. Portu kontrol et ya da Otomatik bul'u dene.",
  no_route:
    "Adaptöre ulaşılamıyor. Telefonun adaptörün Wi-Fi ağına bağlı olduğundan ve Otova'ya yerel ağ izni verdiğinden emin ol.\n" +
    LOCAL_NETWORK_HINT,
  net_unreachable:
    'Wi-Fi bağlantısı yok. Telefonu adaptörün Wi-Fi ağına bağla (ör. WiFi_OBDII, V-LINK).\n' + LOCAL_NETWORK_HINT,
  timeout:
    "Adaptör bağlantıya cevap vermedi. IP adresi yanlış olabilir. Otomatik bul'u dene ya da adaptörün kılavuzundaki IP'yi gir.",
  other: 'Adaptöre bağlanılamadı. Wi-Fi ağını, IP adresini ve portu kontrol et.',
};

export const RESET_MESSAGE =
  'Wi-Fi bağlantısı kuruldu ama adaptör komutlara cevap vermiyor. Adaptörü söküp tak, 10 saniye bekle ve tekrar dene.';
export const PROBE_MESSAGE =
  'Adaptör çalışıyor ama araç cevap vermedi. Kontağı açık konuma getir (motoru çalıştırmak şart değil) ve tekrar dene.';
export const NOT_FOUND_MESSAGE =
  'Adaptör bulunamadı. Telefonun adaptörün Wi-Fi ağına bağlı olduğundan emin ol.';

/** Raw text of an error (native text when known, else the message). */
function rawText(err: unknown): string {
  if (err instanceof OBDError) return err.raw ?? err.message;
  return err instanceof Error ? err.message : String(err);
}

/** Connect-error kind, or null when the error is not a TCP connect failure. */
export function connectErrorKind(err: unknown): ConnectErrorKind | null {
  if (err instanceof OBDError) {
    return err.step === 'tcp' ? classifyConnectError(rawText(err)) : null;
  }
  const msg = rawText(err);
  return /ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|ETIMEDOUT/i.test(msg) ? classifyConnectError(msg) : null;
}

/**
 * One-line technical detail for the UI and the log:
 * `<step> · <code>/<kind> · <raw>` (kind only for TCP failures).
 */
export function errorDetail(err: unknown): string {
  const step = err instanceof OBDError ? err.step ?? '-' : '-';
  const code = err instanceof OBDError ? err.code : err instanceof Error ? err.name : 'unknown';
  const kind = connectErrorKind(err);
  const raw = rawText(err)
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
  return `${step} · ${code}${kind ? `/${kind}` : ''} · ${raw}`;
}

/**
 * Map any thrown value to an actionable Turkish message for the UI.
 */
export function userMessage(err: unknown): string {
  const code = err instanceof OBDError ? err.code : null;
  const step = err instanceof OBDError ? err.step : undefined;
  const msg = err instanceof Error ? err.message : String(err);

  const kind = connectErrorKind(err);
  if (kind) return TCP_MESSAGES[kind];
  if (step === 'reset' || step === 'setup') return RESET_MESSAGE;
  if (step === 'probe') return PROBE_MESSAGE;
  if (code === 'ADAPTER_NOT_FOUND') return NOT_FOUND_MESSAGE;

  if (code === 'TIMEOUT' || (!code && /timeout|timed out/i.test(msg))) {
    return 'Adaptör cevap vermedi. Wi-Fi bağlantısını ve adaptörü kontrol et.';
  }
  if (code === 'CONNECTION_CLOSED') {
    return 'Adaptörle bağlantı koptu. Wi-Fi’ı kontrol edip tekrar bağlan.';
  }
  if (code === 'NOT_CONNECTED') {
    return 'Adaptöre bağlı değilsin. Önce bağlan.';
  }
  if (code === 'UNABLE_TO_CONNECT' || /UNABLE TO CONNECT/i.test(msg)) {
    return 'Araç cevap vermedi. Kontağı açıp tekrar dene.';
  }
  if (code === 'BUS_INIT_ERROR') {
    return 'ECU protokol başlatmaya cevap vermedi. Kontağı açıp tekrar dene.';
  }
  if (code === 'CAN_ERROR') {
    return 'CAN hattında hata. Adaptörün tam oturduğundan emin ol, kontağı açıp tekrar dene.';
  }
  if (code === 'NO_DATA') {
    return 'Araç cevap vermedi. Kontağı açıp tekrar dene.';
  }
  if (code === 'CONNECT_FAILED' || /connect/i.test(msg)) {
    return TCP_MESSAGES.other;
  }
  return 'Beklenmeyen hata. Bağlantıyı kapatıp tekrar dene.';
}

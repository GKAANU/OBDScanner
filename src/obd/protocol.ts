/**
 * Pure ELM327 session logic: response framing, error classification,
 * recovery decisions, and user-facing (Turkish) error messages.
 *
 * No I/O and no state. OBDClient composes these; tests cover them directly.
 */
import { detectOBDError } from './parsers';

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
 * Build an `ATST xx` command. The ELM327 unit is 4.096 ms; `xx` is hex,
 * clamped to 01..FF (4 ms .. ~1 s). `ATST96` (~600 ms) suits slow ECUs.
 */
export function atstCommand(ms: number): string {
  const units = Math.min(0xff, Math.max(1, Math.round(ms / 4.096)));
  return `ATST${units.toString(16).toUpperCase().padStart(2, '0')}`;
}

/** Thrown by OBDClient; `code` is stable, `message` is for logs only. */
export class OBDError extends Error {
  constructor(
    public readonly code:
      | 'TIMEOUT'
      | 'NOT_CONNECTED'
      | 'CONNECTION_CLOSED'
      | 'CONNECT_FAILED'
      | 'UNABLE_TO_CONNECT'
      | 'BUS_INIT_ERROR'
      | 'CAN_ERROR'
      | 'NO_DATA',
    message: string
  ) {
    super(message);
    this.name = 'OBDError';
  }
}

/**
 * Map any thrown value to an actionable Turkish message for the UI.
 */
export function userMessage(err: unknown): string {
  const code = err instanceof OBDError ? err.code : null;
  const msg = err instanceof Error ? err.message : String(err);

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
  if (code === 'CONNECT_FAILED' || /ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|connect/i.test(msg)) {
    return (
      'Adaptöre bağlanılamadı. Telefon adaptörün Wi-Fi ağına bağlı mı, IP ve port doğru mu? ' +
      'İlk bağlantıda iOS yerel ağ izni sorar: izin verip tekrar dene. ' +
      'İzni Ayarlar > Otova > Yerel Ağ bölümünden açabilirsin.'
    );
  }
  return 'Beklenmeyen hata. Bağlantıyı kapatıp tekrar dene.';
}

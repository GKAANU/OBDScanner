/**
 * "Bağlantı günlüğü": an in-memory ring buffer of connection events (TCP
 * open/close, native errors, every TX/RX while connecting, timeouts,
 * recovery actions). It is never persisted and never leaves the device
 * unless the user copies it.
 *
 * After the connection is ready the client only logs errors, timeouts and
 * recovery actions, so live polling cannot evict the connect/init lines.
 *
 * Pure module (no React Native imports) so Jest can drive it.
 */

export type DiagEntry = {
  /** Wall-clock time (epoch ms). */
  at: number;
  /** Ms since the current connect attempt started. */
  rel: number;
  /** Escaped, truncated ASCII text. */
  text: string;
};

/** What the client and transports need: a sink for one line of text. */
export interface DiagLogger {
  log(text: string): void;
}

export const NOOP_LOGGER: DiagLogger = { log() {} };

export const DIAG_LOG_CAPACITY = 300;
export const DIAG_LINE_MAX = 200;

/**
 * Make text safe for a single plain-text line: CR/LF become the two-char
 * sequences \r and \n, other non-printable or non-ASCII chars become \xNN
 * (or \uNNNN above 0xFF).
 */
export function escapeLogText(s: string): string {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (ch === '\r') out += '\\r';
    else if (ch === '\n') out += '\\n';
    else if (c >= 0x20 && c <= 0x7e) out += ch;
    else if (c <= 0xff) out += `\\x${c.toString(16).toUpperCase().padStart(2, '0')}`;
    else out += `\\u${c.toString(16).toUpperCase().padStart(4, '0')}`;
  }
  return out;
}

function truncate(s: string, max = DIAG_LINE_MAX): string {
  return s.length <= max ? s : s.substring(0, max - 3) + '...';
}

export class DiagLog implements DiagLogger {
  private buf: DiagEntry[] = [];
  private origin: number;
  private listeners = new Set<() => void>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly capacity = DIAG_LOG_CAPACITY
  ) {
    this.origin = now();
  }

  /** Reset the relative clock for a new connect attempt and log `text`. */
  startAttempt(text: string): void {
    this.origin = this.now();
    this.log(text);
  }

  log(text: string): void {
    const at = this.now();
    this.buf.push({ at, rel: at - this.origin, text: truncate(escapeLogText(text)) });
    if (this.buf.length > this.capacity) this.buf.splice(0, this.buf.length - this.capacity);
    for (const l of this.listeners) l();
  }

  entries(): DiagEntry[] {
    return this.buf.slice();
  }

  clear(): void {
    this.buf = [];
    for (const l of this.listeners) l();
  }

  /** Called after every change; returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

/** The app-wide log instance. */
export const diagLog = new DiagLog();

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** Local wall-clock time as HH:MM:SS.mmm. */
export function formatClock(epochMs: number): string {
  const d = new Date(epochMs);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

/** One entry as `HH:MM:SS.mmm +<rel>ms <text>`, at most 200 chars. */
export function formatDiagLine(e: DiagEntry): string {
  return truncate(`${formatClock(e.at)} +${e.rel}ms ${e.text}`);
}

/**
 * Plain-text log for the clipboard: header lines, a blank line, then one
 * line per entry. No emoji, box drawing or ANSI codes; every line is at
 * most 200 chars.
 */
export function formatDiagLog(entries: DiagEntry[], header: string[]): string {
  // Header lines are ours (Turkish is fine); only strip control characters.
  const head = header.map((h) => truncate(h.replace(/[\u0000-\u001f\u007f]/g, ' ')));
  const body = entries.length > 0 ? entries.map(formatDiagLine) : ['Henüz kayıt yok.'];
  return [...head, '', ...body].join('\n');
}

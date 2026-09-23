import type { Transport, TransportHandlers } from './transport';
import { DemoSimulator } from './demo';

/**
 * In-memory transport backed by DemoSimulator. Adds adapter-like latency
 * (and a slow first protocol search) so the UI behaves as with a dongle.
 * Makes no network or socket calls.
 */
export class DemoTransport implements Transport {
  readonly label = 'Demo';
  private handlers: TransportHandlers | null = null;
  private sim = new DemoSimulator();
  private startedAt = 0;
  private searched = false;
  private timers = new Set<ReturnType<typeof setTimeout>>();

  constructor(private readonly latencyMs = 35) {}

  async open(handlers: TransportHandlers): Promise<void> {
    this.handlers = handlers;
    this.startedAt = Date.now();
    this.sim = new DemoSimulator();
    this.searched = false;
  }

  write(data: string): void {
    if (!this.handlers) throw new Error('Demo transport is closed');
    const cmd = data.replace(/[\r\n]/g, '').trim();
    let response = this.sim.respond(cmd, (Date.now() - this.startedAt) / 1000);
    let delay = this.latencyMs;
    const upper = cmd.toUpperCase();
    if (upper === 'ATZ') delay = Math.max(delay, 300);
    if (upper.startsWith('01') && !this.searched) {
      // First OBD request after ATSP0 runs the protocol search.
      this.searched = true;
      response = `SEARCHING...\r${response}`;
      delay = Math.max(delay, 600);
    }
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      this.handlers?.onData(response);
    }, delay);
    this.timers.add(timer);
  }

  close(): void {
    this.handlers = null;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }
}

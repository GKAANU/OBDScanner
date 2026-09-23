import TcpSocket from 'react-native-tcp-socket';

export type OBDConfig = { host: string; port: number; timeoutMs?: number };

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

  // High-level helpers — UI layer should use these, never raw send().
  storedDTCs(): Promise<string> {
    return this.send('03');
  }
  pendingDTCs(): Promise<string> {
    return this.send('07');
  }
  permanentDTCs(): Promise<string> {
    return this.send('0A');
  }
  freezeFrame(pid: string): Promise<string> {
    // Frame index 01 — first frozen snapshot.
    return this.send(`02${pid}01`);
  }
  clearDTCs(): Promise<string> {
    return this.send('04');
  }
  livePid(pid: string): Promise<string> {
    return this.send(`01${pid}`);
  }
  mode09(pid: string): Promise<string> {
    return this.send(`09${pid}`, 6000);
  }
  batteryVoltage(): Promise<string> {
    return this.send('ATRV');
  }
  protocolName(): Promise<string> {
    return this.send('ATDP');
  }
  protocolNumber(): Promise<string> {
    return this.send('ATDPN');
  }
  adapterVersion(): Promise<string> {
    return this.send('ATI');
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

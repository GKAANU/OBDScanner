import TcpSocket from 'react-native-tcp-socket';
import type { Transport, TransportHandlers } from './transport';
import { OBDError } from './protocol';

type Socket = ReturnType<typeof TcpSocket.createConnection>;

/**
 * Raw TCP link to a Wi-Fi ELM327 dongle. This is the only network code in
 * the app, and it only ever talks to the user-configured local host/port.
 */
export class TcpTransport implements Transport {
  readonly label: string;
  private socket: Socket | null = null;

  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly connectTimeoutMs = 5000
  ) {
    this.label = `${host}:${port}`;
  }

  open(handlers: TransportHandlers): Promise<void> {
    return new Promise((resolve, reject) => {
      let opened = false;
      let settled = false;
      let closeNotified = false;

      const notifyClose = (err?: Error) => {
        if (!opened || closeNotified) return;
        closeNotified = true;
        handlers.onClose(err);
      };
      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.close();
        reject(err);
      };

      const timer = setTimeout(() => {
        fail(new OBDError('CONNECT_FAILED', `Timed out connecting to ${this.label}`));
      }, this.connectTimeoutMs);

      try {
        const sock = TcpSocket.createConnection({ host: this.host, port: this.port }, () => {
          if (settled) return;
          settled = true;
          opened = true;
          clearTimeout(timer);
          resolve();
        });
        this.socket = sock;
        sock.on('data', (data: Buffer | string) => {
          handlers.onData(typeof data === 'string' ? data : data.toString('utf8'));
        });
        sock.on('error', (err: Error) => {
          if (!opened) fail(new OBDError('CONNECT_FAILED', err.message));
          else notifyClose(err);
        });
        sock.on('close', () => {
          this.socket = null;
          if (!opened) fail(new OBDError('CONNECT_FAILED', `Connection to ${this.label} closed`));
          else notifyClose();
        });
      } catch (e) {
        fail(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  write(data: string): void {
    if (!this.socket) throw new OBDError('NOT_CONNECTED', 'Socket is not open');
    this.socket.write(data);
  }

  close(): void {
    const s = this.socket;
    this.socket = null;
    try {
      s?.destroy();
    } catch {
      // ignore
    }
  }
}

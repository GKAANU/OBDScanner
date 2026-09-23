/**
 * Byte-stream transport between OBDClient and an ELM327 adapter.
 *
 * Implementations: TcpTransport (Wi-Fi dongle, native) and DemoTransport
 * (in-memory simulator for demo mode). Keeping this interface free of native
 * imports lets OBDClient run under Jest.
 */
export type TransportHandlers = {
  /** A chunk of text arrived from the adapter. */
  onData: (chunk: string) => void;
  /** The link closed after a successful open (not called for failed opens). */
  onClose: (error?: Error) => void;
};

export interface Transport {
  /** Human-readable endpoint for the status bar, e.g. "192.168.0.10:35000". */
  readonly label: string;
  /** Open the link. Rejects if the adapter cannot be reached. */
  open(handlers: TransportHandlers): Promise<void>;
  /** Write raw text (the client appends the `\r` terminator). */
  write(data: string): void;
  /** Close the link. Must be safe to call more than once. */
  close(): void;
}

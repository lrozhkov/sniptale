import { browserRuntime } from '@sniptale/platform/browser/runtime';
import {
  PAGE_RECOVERY_CONTENT_PORT,
  parsePageRecoveryReply,
  type PageRecoveryRequest,
  type PageRecoveryReply,
} from '../../../contracts/page-recovery';

type Pending = { resolve(reply: PageRecoveryReply): void; reject(error: Error): void };

/** Reopens only for a new admission request; disconnected mutations are never replayed. */
export class PageRecoveryClient {
  private port: chrome.runtime.Port | null = null;
  private readonly pending = new Map<string, Pending>();
  private disposed = false;

  constructor(
    private readonly unavailable: () => void = () => {},
    private readonly connect = () => browserRuntime.connect({ name: PAGE_RECOVERY_CONTENT_PORT })
  ) {}

  private readonly onMessage = (value: unknown) => {
    const reply = parsePageRecoveryReply(value);
    if (!reply) {
      this.close();
      return;
    }
    const request = this.pending.get(reply.requestId);
    if (!request) return;
    this.pending.delete(reply.requestId);
    request.resolve(reply);
  };
  private readonly onDisconnect = () => {
    void browserRuntime.getLastError();
    this.close();
  };
  private close(): void {
    const port = this.port;
    this.port = null;
    if (port) {
      port.onMessage.removeListener(this.onMessage);
      port.onDisconnect.removeListener(this.onDisconnect);
      try {
        port.disconnect();
      } catch {
        /* Native disconnect can already have completed. */
      }
    }
    for (const pending of this.pending.values())
      pending.reject(new Error('Page recovery connection is unavailable'));
    this.pending.clear();
    if (!this.disposed) this.unavailable();
  }
  request(message: PageRecoveryRequest): Promise<PageRecoveryReply> {
    if (this.disposed) return Promise.reject(new Error('Page recovery is disposed'));
    if (!this.port) {
      if (message.kind !== 'peek')
        return Promise.reject(new Error('Page recovery requires admission'));
      this.port = this.connect();
      this.port.onMessage.addListener(this.onMessage);
      this.port.onDisconnect.addListener(this.onDisconnect);
    }
    return new Promise((resolve, reject) => {
      this.pending.set(message.requestId, { resolve, reject });
      try {
        this.port!.postMessage(message);
      } catch {
        this.close();
      }
    });
  }
  dispose(): void {
    this.disposed = true;
    this.close();
  }
}

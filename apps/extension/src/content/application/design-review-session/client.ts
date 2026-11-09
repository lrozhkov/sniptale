import { browserRuntime } from '@sniptale/platform/browser/runtime';
import {
  DESIGN_REVIEW_SESSION_PORT,
  parseDesignReviewSessionReply,
  type DesignReviewSessionRequest,
  type DesignReviewSessionReply,
} from '../../../contracts/design-review-session';

/** One native document connection. Failed mutations are never replayed implicitly. */
export class DesignReviewSessionClient {
  private port: chrome.runtime.Port | null = null;
  private readonly pending = new Map<
    string,
    { resolve(value: DesignReviewSessionReply): void; reject(error: Error): void }
  >();
  constructor(
    private readonly connect = () => browserRuntime.connect({ name: DESIGN_REVIEW_SESSION_PORT })
  ) {}
  private readonly message = (value: unknown) => {
    const reply = parseDesignReviewSessionReply(value);
    if (!reply) {
      this.dispose();
      return;
    }
    const pending = this.pending.get(reply.requestId);
    if (!pending) return;
    this.pending.delete(reply.requestId);
    pending.resolve(reply);
  };
  private readonly disconnected = () => {
    void browserRuntime.getLastError();
    this.dispose();
  };
  isConnected = () => this.port !== null;
  request(message: DesignReviewSessionRequest): Promise<DesignReviewSessionReply> {
    if (!this.port) {
      if (message.kind !== 'open')
        return Promise.reject(new Error('Review session requires admission'));
      this.port = this.connect();
      this.port.onMessage.addListener(this.message);
      this.port.onDisconnect.addListener(this.disconnected);
    }
    return new Promise((resolve, reject) => {
      this.pending.set(message.requestId, { resolve, reject });
      try {
        this.port!.postMessage(message);
      } catch {
        this.dispose();
      }
    });
  }
  dispose(): void {
    const port = this.port;
    this.port = null;
    if (port) {
      port.onMessage.removeListener(this.message);
      port.onDisconnect.removeListener(this.disconnected);
      try {
        port.disconnect();
      } catch {
        /* Native disconnect may already have completed. */
      }
    }
    for (const pending of this.pending.values())
      pending.reject(new Error('Review session connection is unavailable'));
    this.pending.clear();
  }
}

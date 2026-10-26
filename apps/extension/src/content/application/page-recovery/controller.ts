import type { PageRecoveryReply, PageRecoveryRequest } from '../../../contracts/page-recovery';
import { isPageRecoveryPayload } from '../../../contracts/page-recovery';

interface RecoveryPorts {
  request(message: PageRecoveryRequest): Promise<PageRecoveryReply>;
  capture(): unknown | null;
  apply(value: unknown): boolean;
}
export interface PageRecoveryState {
  available: boolean;
  error: boolean;
  pending: boolean;
}

/** Disposable content producer; native admission and durable data remain background-owned. */
export class PageRecoveryController {
  private state: PageRecoveryState = { available: false, error: false, pending: false };
  private readonly listeners = new Set<() => void>();
  private queue: Promise<boolean> = Promise.resolve(true);
  private lease: string | null = null;
  private revision = 0;
  private dirty: string | null | undefined;
  private changedAt = 0;
  private captureFailed = false;
  private fenced = false;
  private applying = false;
  private disposed = false;

  constructor(private readonly ports: RecoveryPorts) {}

  getSnapshot = (): PageRecoveryState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private publish(change: Partial<PageRecoveryState>): void {
    if (this.disposed) return;
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) listener();
  }
  private enqueue(operation: () => Promise<boolean>): Promise<boolean> {
    const result = this.queue.then(async () => {
      if (this.disposed) return false;
      this.publish({ pending: true });
      try {
        return await operation();
      } catch {
        this.publish({ error: true });
        return false;
      } finally {
        this.publish({ pending: false });
      }
    });
    this.queue = result;
    return result;
  }
  private accept(reply: PageRecoveryReply): boolean {
    if (this.disposed || reply.status !== 'ready' || !reply.lease) {
      this.publish({ error: true });
      return false;
    }
    this.lease = reply.lease;
    this.publish({ error: this.captureFailed });
    return true;
  }
  private async admit(): Promise<boolean> {
    if (this.lease) return true;
    const reply = await this.ports.request({ kind: 'peek', requestId: crypto.randomUUID() });
    if (!this.accept(reply)) return false;
    this.publish({ available: reply.available && this.dirty === undefined });
    return true;
  }
  open(): Promise<boolean> {
    return this.enqueue(async () => {
      if (!(await this.admit())) return false;
      return this.dirty === undefined ? true : this.writeDirty();
    });
  }
  /** Called only after a user history change or explicit finalization of a pending edit. */
  changed(): Promise<boolean> {
    if (this.disposed || this.applying) return Promise.resolve(false);
    this.revision++;
    this.changedAt = Date.now();
    if (!this.captureCurrent()) return Promise.resolve(false);
    return this.enqueue(() => this.writeDirty());
  }
  private captureCurrent(): boolean {
    try {
      const captured = this.ports.capture();
      const payload = captured === null ? null : JSON.stringify(captured);
      if (payload !== null && !isPageRecoveryPayload(payload))
        throw new Error('Recovery is too large');
      this.dirty = payload;
      this.captureFailed = false;
      this.publish({ available: false });
      return true;
    } catch {
      this.dirty = undefined;
      this.captureFailed = true;
      this.publish({ error: true });
      return false;
    }
  }
  private async writeDirty(terminal = false): Promise<boolean> {
    if (this.fenced || this.dirty === undefined) return false;
    if (!this.lease && !(await this.admit())) return false;
    if (!this.lease) return false;
    const revision = this.revision;
    const requestId = crypto.randomUUID();
    const reply = await this.ports.request(
      this.dirty === null
        ? { kind: 'discard', requestId, lease: this.lease }
        : {
            kind: terminal ? 'save-final' : 'save',
            requestId,
            lease: this.lease,
            payload: this.dirty,
            changedAt: this.changedAt,
          }
    );
    if (!this.accept(reply)) return false;
    if (revision === this.revision) this.dirty = undefined;
    this.publish({ available: false });
    return true;
  }
  /** Posts the latest admitted version during pagehide without waiting for an older write reply. */
  flushBeforeNavigation(): Promise<boolean> {
    if (this.disposed || this.fenced || !this.lease || this.dirty === undefined)
      return Promise.resolve(false);
    return this.writeDirty(true).catch(() => {
      this.publish({ error: true });
      return false;
    });
  }
  retry(): Promise<boolean> {
    if (this.captureFailed) {
      this.revision++;
      if (!this.captureCurrent()) return Promise.resolve(false);
    }
    return this.lease ? this.enqueue(() => this.writeDirty()) : this.open();
  }
  restore(): Promise<boolean> {
    const revision = this.revision;
    return this.enqueue(async () => {
      if (!this.lease || this.fenced || this.dirty !== undefined || this.ports.capture() !== null)
        return false;
      const reply = await this.ports.request({
        kind: 'load',
        requestId: crypto.randomUUID(),
        lease: this.lease,
      });
      if (!this.accept(reply) || revision !== this.revision || !reply.payload) return false;
      this.applying = true;
      try {
        const applied = this.ports.apply(JSON.parse(reply.payload) as unknown);
        if (applied) this.captureFailed = false;
        this.publish({ available: !applied, error: !applied });
        return applied;
      } finally {
        this.applying = false;
      }
    });
  }
  /** Fences old producers synchronously; local Reset/Close runs only after acknowledged deletion. */
  discard(action: () => void): Promise<boolean> {
    if (this.disposed || this.fenced) return Promise.resolve(false);
    this.fenced = true;
    this.revision++;
    this.dirty = undefined;
    return this.enqueue(async () => {
      try {
        if (!(await this.admit()) || !this.lease) return false;
        const reply = await this.ports.request({
          kind: 'discard',
          requestId: crypto.randomUUID(),
          lease: this.lease,
        });
        if (!this.accept(reply)) return false;
        this.applying = true;
        try {
          action();
        } finally {
          this.applying = false;
        }
        this.dirty = undefined;
        this.captureFailed = false;
        this.publish({ available: false, error: false });
        return true;
      } finally {
        this.fenced = false;
      }
    });
  }
  unavailable(): void {
    this.lease = null;
    this.dirty = undefined;
    this.revision++;
    this.publish({ available: false, error: true });
  }
  dispose(): void {
    this.disposed = true;
    this.revision++;
    this.dirty = undefined;
    this.listeners.clear();
  }
}

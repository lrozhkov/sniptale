import type {
  DesignReviewSessionReply,
  DesignReviewSessionRequest,
} from '../../../contracts/design-review-session';

type Admission = 'open' | 'resume' | 'reconnect';
interface PersistencePorts {
  request(message: DesignReviewSessionRequest): Promise<DesignReviewSessionReply>;
  connected(): boolean | undefined;
  serialize(): string;
  hasAuthoredEntries(): boolean;
  restorePayload(payload: string, rememberPreviews: boolean): boolean;
  applyAdmission(kind: Admission, adopted: boolean): void;
  publish(update: { pending?: boolean; error?: boolean; available?: boolean }): void;
  disposed(): boolean;
}

/** Owns acknowledged session identity, admission fencing, and the complete serial write lifetime. */
export class ReviewSessionPersistence {
  private lease: string | null = null;
  private revision = 0;
  private sessionId: string | null | undefined;
  private opened = false;
  private queue: Promise<void> = Promise.resolve();
  private dirty = false;
  private admissionFenced = false;
  private savedPayload: string | undefined;
  constructor(private readonly ports: PersistencePorts) {}
  get isOpened(): boolean {
    return this.opened;
  }
  private accept(reply: DesignReviewSessionReply) {
    if (reply.status !== 'ready' || !reply.lease)
      throw new Error('Review session command was refused');
    this.lease = reply.lease;
    this.revision = reply.revision;
    if (reply.sessionId !== undefined) this.sessionId = reply.sessionId;
    return reply;
  }
  private enqueue(operation: () => Promise<void>, quiet = false) {
    const result = this.queue.then(async () => {
      if (this.ports.disposed()) return;
      if (!quiet) this.ports.publish({ pending: true });
      try {
        await operation();
        this.ports.publish({ error: false });
      } catch (error) {
        this.ports.publish({ error: true });
        throw error;
      } finally {
        if (!quiet) this.ports.publish({ pending: false });
      }
    });
    this.queue = result.catch(() => undefined);
    return result;
  }
  private restore(payload: string, rememberPreviews: boolean) {
    if (!this.ports.restorePayload(payload, rememberPreviews)) {
      this.admissionFenced = true;
      throw new Error('Saved review session is invalid');
    }
    this.savedPayload = payload;
  }
  private async reconcileConnection() {
    const reply = await this.ports.request({ kind: 'open', requestId: crypto.randomUUID() });
    if (reply.status !== 'ready' || !reply.lease)
      throw new Error('Review session admission was refused');
    const local = this.ports.serialize();
    let adopted = false;
    const identityChanged =
      this.sessionId !== undefined &&
      reply.sessionId !== undefined &&
      this.sessionId !== reply.sessionId;
    if (
      (this.savedPayload !== undefined && reply.payload === undefined) ||
      (this.dirty &&
        (identityChanged || (reply.payload !== this.savedPayload && reply.payload !== local)))
    ) {
      this.admissionFenced = true;
      this.ports.publish({ available: reply.available });
      throw new Error('Review session changed in another document');
    }
    if (reply.payload === local) {
      this.savedPayload = local;
      this.dirty = false;
    } else if (!this.dirty && reply.payload !== undefined) {
      this.restore(reply.payload, false);
      adopted = true;
    }
    this.accept(reply);
    this.admissionFenced = false;
    this.opened = true;
    this.ports.applyAdmission('reconnect', adopted);
    this.ports.publish({ available: reply.available });
  }
  persist(kind: 'save' | 'clear' = 'save', quiet = false): Promise<void> {
    this.dirty = true;
    if (!this.opened) return Promise.resolve();
    return this.enqueue(async () => {
      if (this.admissionFenced) throw new Error('Review session requires fresh admission');
      if (this.ports.connected() === false) await this.reconcileConnection();
      if (!this.lease) throw new Error('Review session connection is unavailable');
      const payload = this.ports.serialize();
      if (payload === this.savedPayload && kind === 'save') {
        this.dirty = false;
        return;
      }
      this.accept(
        await this.ports.request({
          kind,
          payload,
          lease: this.lease,
          expectedRevision: this.revision,
          requestId: crypto.randomUUID(),
        })
      );
      this.savedPayload = payload;
      this.dirty = this.ports.serialize() !== payload;
    }, quiet);
  }
  open = async () =>
    this.enqueue(async () => {
      const reply = this.accept(
        await this.ports.request({ kind: 'open', requestId: crypto.randomUUID() })
      );
      const localAuthored = this.dirty && this.ports.hasAuthoredEntries();
      if (
        localAuthored &&
        reply.payload !== this.savedPayload &&
        reply.payload !== this.ports.serialize()
      ) {
        this.admissionFenced = true;
        throw new Error('Review session changed before admission');
      }
      const adopted = !localAuthored && reply.payload !== undefined;
      if (adopted && reply.payload !== undefined) this.restore(reply.payload, true);
      this.opened = true;
      this.ports.publish({ available: reply.available });
      this.ports.applyAdmission('open', adopted);
      if (this.dirty) void this.persist().catch(() => undefined);
    });
  retry = async () => {
    await this.enqueue(() => this.reconcileConnection());
    if (this.dirty) await this.persist();
  };
  resume = async () => {
    await this.enqueue(async () => {
      this.admissionFenced = true;
      this.accept(await this.ports.request({ kind: 'open', requestId: crypto.randomUUID() }));
      if (!this.lease) throw new Error('Review session requires admission');
      const reply = this.accept(
        await this.ports.request({
          kind: 'resume',
          lease: this.lease,
          expectedRevision: this.revision,
          requestId: crypto.randomUUID(),
        })
      );
      if (reply.payload === undefined) throw new Error('Saved review session is invalid');
      this.restore(reply.payload, true);
      this.admissionFenced = false;
      this.ports.applyAdmission('resume', true);
      this.ports.publish({ available: false });
    });
    await this.persist();
  };
  flush = async () => {
    await this.queue;
    if (this.dirty && this.opened) await this.persist();
  };
}

import type { ErasureParticipantResult } from '@sniptale/runtime-contracts/privacy-erasure/types';
import type { PageRecoveryReply, PageRecoveryRequest } from '../../contracts/page-recovery';
import { PageRecoveryStorage, type PageRecoveryClaim } from '../storage/page-recovery';

export interface PageRecoverySource {
  tabId: number;
  documentId: string;
  pageUrl: string;
}
interface Connection {
  source: PageRecoverySource;
  claim: PageRecoveryClaim | null;
  closed: boolean;
  revoke(): void;
}

/** Native document leases and erasure exclusion surround every private recovery operation. */
export class PageRecoveryService {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly connections = new Set<Connection>();
  private readonly documents = new Map<number, string>();
  private exclusions = 0;

  constructor(private readonly storage = new PageRecoveryStorage()) {}

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation);
    this.queue = next.catch(() => undefined);
    return next;
  }
  private live(connection: Connection): boolean {
    const current = this.documents.get(connection.source.tabId);
    return (
      !connection.closed &&
      this.exclusions === 0 &&
      (current === undefined || current === connection.source.documentId)
    );
  }
  private close(connection: Connection): void {
    if (connection.closed) return;
    connection.closed = true;
    this.connections.delete(connection);
    connection.revoke();
  }
  connect(source: PageRecoverySource, revoke = () => {}) {
    for (const prior of this.connections)
      if (prior.source.tabId === source.tabId) this.close(prior);
    const connection: Connection = { source, revoke, claim: null, closed: false };
    this.connections.add(connection);
    return {
      request: (message: PageRecoveryRequest) => {
        const terminal =
          message.kind === 'save-final' &&
          this.live(connection) &&
          connection.claim?.lease === message.lease;
        return this.enqueue(() => this.receive(connection, message, terminal));
      },
      disconnect: () => this.close(connection),
    };
  }
  private async receive(
    connection: Connection,
    message: PageRecoveryRequest,
    terminal = false
  ): Promise<PageRecoveryReply> {
    const base = {
      kind: 'result' as const,
      requestId: message.requestId,
      lease: null,
      available: false,
    };
    if (!terminal && !this.live(connection)) return { ...base, status: 'refused' };
    try {
      if (message.kind === 'peek' && !connection.claim)
        connection.claim = await this.storage.bindTab(
          connection.source.tabId,
          connection.source.documentId
        );
      const claim = connection.claim;
      if (!claim || (!terminal && !this.live(connection))) return { ...base, status: 'refused' };
      const current = await this.storage.getClaim(claim.tabId);
      if (
        !current ||
        current.lease !== claim.lease ||
        current.documentId !== claim.documentId ||
        (message.kind !== 'peek' && message.lease !== claim.lease) ||
        (!terminal && !this.live(connection))
      )
        return { ...base, status: 'refused' };
      return await this.execute(connection, claim, message);
    } catch {
      return { ...base, status: 'failed' };
    }
  }
  private async execute(
    connection: Connection,
    claim: PageRecoveryClaim,
    message: PageRecoveryRequest
  ): Promise<PageRecoveryReply> {
    const base = {
      kind: 'result' as const,
      requestId: message.requestId,
      status: 'ready' as const,
    };
    const source = connection.source;
    if (message.kind === 'save' || message.kind === 'save-final') {
      await this.storage.save(claim.nonce, source.pageUrl, message.payload, message.changedAt);
      return { ...base, lease: claim.lease, available: false };
    }
    if (message.kind === 'discard') {
      await this.storage.discard(claim.nonce);
      const fresh = await this.storage.rotateLease(claim.tabId, claim.documentId, claim.lease);
      connection.claim = fresh;
      return { ...base, lease: fresh.lease, available: false };
    }
    const saved = await this.storage.read(claim.nonce, source.pageUrl);
    if (!this.live(connection))
      return { ...base, status: 'refused', lease: null, available: false };
    return {
      ...base,
      lease: claim.lease,
      available: !!saved,
      ...(message.kind === 'load' && saved?.payload ? { payload: saved.payload } : {}),
    };
  }
  navigate(tabId: number, documentId: string): void {
    this.documents.set(tabId, documentId);
    for (const connection of this.connections)
      if (connection.source.tabId === tabId && connection.source.documentId !== documentId)
        this.close(connection);
  }
  forgetTab(tabId: number): Promise<void> {
    for (const connection of this.connections)
      if (connection.source.tabId === tabId) this.close(connection);
    this.documents.delete(tabId);
    return this.enqueue(() => this.storage.forgetTab(tabId));
  }
  maintenance(): Promise<number | null> {
    return this.enqueue(async () => {
      if (this.exclusions) return null;
      await this.storage.sweep();
      return this.storage.nextExpiry();
    });
  }
  reserveErasureExclusion() {
    this.exclusions++;
    let released = false;
    return {
      waitForActiveMutations: async () => {
        await this.queue;
      },
      release: () => {
        if (!released) {
          released = true;
          this.exclusions--;
        }
      },
    };
  }
  async cleanup(): Promise<readonly ErasureParticipantResult[]> {
    await this.queue;
    for (const connection of this.connections) this.close(connection);
    this.documents.clear();
    return [
      {
        id: 'page-recovery-runtime-state',
        remainingCount: this.connections.size,
        severity: 'required',
        status: 'verified-empty',
      },
    ];
  }
}

export const pageRecoveryService = new PageRecoveryService();

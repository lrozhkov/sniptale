import { z } from 'zod';
import type { ErasureParticipantResult } from '@sniptale/runtime-contracts/privacy-erasure/types';
import {
  tryRunWithPersistenceMutationPermit,
  type PersistenceMutationPermit,
} from '../../composition/persistence/infrastructure/mutation-barrier';
import type {
  DesignReviewSessionReply,
  DesignReviewSessionRequest,
} from '../../contracts/design-review-session';
import {
  DESIGN_REVIEW_SESSION_CAP,
  type DesignReviewSessionStorage,
  type DesignReviewSessionState,
} from '../storage/design-review-session';

export interface DesignReviewSessionSource {
  tabId: number;
  documentId: string;
}
interface Connection {
  source: DesignReviewSessionSource;
  lease: string | null;
  closed: boolean;
  revoke(): void;
}
const restoreProjection = z.object({ enabled: z.literal(true) });
const sessionEntriesProjection = z.object({ entries: z.array(z.unknown()) });
function sessionEntryCount(payload: string): number | null {
  try {
    const value: unknown = JSON.parse(payload);
    const result = sessionEntriesProjection.safeParse(value);
    return result.success ? result.data.entries.length : null;
  } catch {
    return null;
  }
}

interface Dependencies {
  storage: DesignReviewSessionStorage;
  isCurrentDocument(source: DesignReviewSessionSource): Promise<boolean>;
}

/** One serial owner fences native documents, revisions, and erasure for complete operations. */
export class DesignReviewSessionService {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly connections = new Set<Connection>();
  private readonly documents = new Map<number, string>();
  private exclusions = 0;
  constructor(private readonly dependencies: Dependencies) {}

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation);
    this.queue = next.catch(() => undefined);
    return next;
  }
  private live(connection: Connection): boolean {
    const document = this.documents.get(connection.source.tabId);
    return (
      !connection.closed &&
      !this.exclusions &&
      (document === undefined || document === connection.source.documentId)
    );
  }
  private close(connection: Connection): void {
    if (connection.closed) return;
    connection.closed = true;
    connection.lease = null;
    this.connections.delete(connection);
    connection.revoke();
  }
  connect(source: DesignReviewSessionSource, revoke = () => {}) {
    // Only a native-current open can replace the previous producer lease.
    const connection: Connection = { source, revoke, lease: null, closed: false };
    this.connections.add(connection);
    return {
      request: (request: DesignReviewSessionRequest) =>
        this.enqueue(() => this.receive(connection, request)),
      disconnect: () => this.close(connection),
    };
  }
  private refused(request: DesignReviewSessionRequest): DesignReviewSessionReply {
    return {
      requestId: request.requestId,
      status: 'refused',
      lease: null,
      revision: 0,
      available: false,
    };
  }
  private boundEntry(state: DesignReviewSessionState, tabId: number) {
    const binding = state.tabs.find((item) => item.tabId === tabId);
    return state.entries.find((item) => item.id === binding?.id);
  }
  private lastDetachedEntry(state: DesignReviewSessionState) {
    return [...state.entries]
      .reverse()
      .find(
        (item) =>
          !state.tabs.some((tab) => tab.id === item.id) &&
          (sessionEntryCount(item.payload) ?? 0) > 0
      );
  }
  private sessionReply(
    connection: Connection,
    request: DesignReviewSessionRequest,
    state: DesignReviewSessionState
  ): DesignReviewSessionReply {
    const current = this.boundEntry(state, connection.source.tabId);
    return {
      requestId: request.requestId,
      status: 'ready',
      lease: connection.lease,
      revision: current?.revision ?? 0,
      sessionId: current?.id ?? null,
      available: !!this.lastDetachedEntry(state),
    };
  }
  private async readAdmittedState(
    connection: Connection
  ): Promise<DesignReviewSessionState | null> {
    if (!this.live(connection) || !(await this.dependencies.isCurrentDocument(connection.source)))
      return null;
    const state = await this.dependencies.storage.read();
    if (
      !this.live(connection) ||
      !(await this.dependencies.isCurrentDocument(connection.source)) ||
      !this.live(connection)
    )
      return null;
    return state;
  }
  private async receive(
    connection: Connection,
    request: DesignReviewSessionRequest
  ): Promise<DesignReviewSessionReply> {
    if (!this.live(connection)) return this.refused(request);
    try {
      if (request.kind === 'open') return await this.openSession(connection, request);
      const result = await tryRunWithPersistenceMutationPermit((permit) =>
        this.mutateSession(connection, request, permit)
      );
      return result ?? this.refused(request);
    } catch {
      return { ...this.refused(request), status: 'failed' };
    }
  }
  private async openSession(
    connection: Connection,
    request: Extract<DesignReviewSessionRequest, { kind: 'open' }>
  ): Promise<DesignReviewSessionReply> {
    const state = await this.readAdmittedState(connection);
    if (!state) return this.refused(request);
    if (!connection.lease) {
      for (const prior of this.connections)
        if (prior !== connection && prior.source.tabId === connection.source.tabId)
          this.close(prior);
      connection.lease = crypto.randomUUID();
    }
    const current = this.boundEntry(state, connection.source.tabId);
    return {
      ...this.sessionReply(connection, request, state),
      ...(current ? { payload: current.payload } : {}),
    };
  }
  private async mutateSession(
    connection: Connection,
    request: Exclude<DesignReviewSessionRequest, { kind: 'open' }>,
    permit: PersistenceMutationPermit
  ): Promise<DesignReviewSessionReply> {
    const state = await this.readAdmittedState(connection);
    if (!state || !connection.lease || request.lease !== connection.lease)
      return this.refused(request);
    const reply = this.sessionReply(connection, request, state);
    if (request.expectedRevision !== reply.revision) return { ...reply, status: 'stale' };
    if (!(await this.dependencies.isCurrentDocument(connection.source)) || !this.live(connection))
      return this.refused(request);
    return request.kind === 'resume'
      ? this.resumeSession(connection, request, state, permit)
      : this.commitSession(connection, request, state, permit);
  }
  private async resumeSession(
    connection: Connection,
    request: Extract<DesignReviewSessionRequest, { kind: 'resume' }>,
    state: DesignReviewSessionState,
    permit: PersistenceMutationPermit
  ): Promise<DesignReviewSessionReply> {
    const current = this.boundEntry(state, connection.source.tabId);
    const detached = this.lastDetachedEntry(state);
    if (!detached || (current && sessionEntryCount(current.payload) !== 0))
      return this.refused(request);
    await this.bind(state, connection.source.tabId, detached.id, permit);
    connection.lease = crypto.randomUUID();
    return {
      ...this.sessionReply(connection, request, state),
      revision: detached.revision,
      sessionId: detached.id,
      payload: detached.payload,
      available: false,
    };
  }
  private async commitSession(
    connection: Connection,
    request: Extract<DesignReviewSessionRequest, { kind: 'save' | 'clear' }>,
    state: DesignReviewSessionState,
    permit: PersistenceMutationPermit
  ): Promise<DesignReviewSessionReply> {
    const current = this.boundEntry(state, connection.source.tabId);
    const reply = this.sessionReply(connection, request, state);
    if (!current && state.entries.length >= DESIGN_REVIEW_SESSION_CAP) return this.refused(request);
    if (reply.revision === Number.MAX_SAFE_INTEGER) return this.refused(request);
    const binding = state.tabs.find((item) => item.tabId === connection.source.tabId);
    const id = binding?.id ?? crypto.randomUUID();
    if (!binding) await this.bind(state, connection.source.tabId, id, permit);
    if (!this.live(connection)) return this.refused(request);
    const next = { id, revision: reply.revision + 1, payload: request.payload };
    // Bind first: failed local creation leaves only an empty binding, never unowned accepted data.
    await this.dependencies.storage.writeEntries(
      [...state.entries.filter((item) => item.id !== id), next],
      permit
    );
    if (request.kind === 'clear') connection.lease = crypto.randomUUID();
    return { ...reply, lease: connection.lease, revision: next.revision, sessionId: next.id };
  }
  private async bind(
    state: DesignReviewSessionState,
    tabId: number,
    id: string,
    permit: PersistenceMutationPermit
  ): Promise<void> {
    await this.dependencies.storage.writeBindings(
      [...state.tabs.filter((item) => item.tabId !== tabId), { tabId, id }],
      permit
    );
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
    return this.enqueue(async () => {
      await tryRunWithPersistenceMutationPermit(async (permit) => {
        if (this.exclusions) return;
        const state = await this.dependencies.storage.read();
        await this.dependencies.storage.writeBindings(
          state.tabs.filter((item) => item.tabId !== tabId),
          permit
        );
        const id = state.tabs.find((item) => item.tabId === tabId)?.id;
        const detached = state.entries.find((item) => item.id === id);
        if (detached)
          await this.dependencies.storage.writeEntries(
            [...state.entries.filter((item) => item.id !== id), detached],
            permit
          );
      });
    });
  }
  /** Reads only a bound session's active flag; it never creates or resumes a session. */
  shouldRestore(tabId: number): Promise<boolean> {
    return this.enqueue(async () => {
      if (this.exclusions) return false;
      const state = await this.dependencies.storage.read();
      const id = state.tabs.find((item) => item.tabId === tabId)?.id;
      const entry = state.entries.find((item) => item.id === id);
      if (!entry || this.exclusions) return false;
      try {
        const payload: unknown = JSON.parse(entry.payload);
        return restoreProjection.safeParse(payload).success;
      } catch {
        return false;
      }
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
        id: 'design-review-session-runtime-state',
        remainingCount: 0,
        severity: 'required',
        status: 'verified-empty',
      },
    ];
  }
}

import { createLogger } from '@sniptale/platform/observability/logger';
import { discoverPublishedOutgoingRetirement } from '../../composition/persistence/sync-capture/outgoing-results';
import type {
  SyncConnectionIdentity,
  SyncConnectionScope,
} from '../../composition/persistence/remote-connection/model';
import { releasePublishedOutgoing } from './outgoing';
import { SyncRemoteError, type SyncRemoteStore } from './remote-store';

const logger = createLogger({ namespace: 'SyncRetirement' });
interface RetirementInput {
  scope: SyncConnectionScope;
  authorization: SyncConnectionIdentity;
  remote: SyncRemoteStore;
  signal: AbortSignal;
}
function deferred(stage: 'discovery' | 'release', error: unknown): void {
  try {
    let reason = 'unexpected';
    if (error === 'protected') reason = 'protected';
    else if (error instanceof SyncRemoteError) {
      const code = error.code;
      switch (code) {
        case 'secrets-locked':
        case 'authentication':
        case 'access-denied':
        case 'missing':
        case 'temporary':
        case 'transport':
        case 'cancelled':
        case 'invalid-response':
        case 'invalid-key':
        case 'storage-full':
        case 'invalid-configuration':
        case 'unsupported-cursor':
        case 'metadata-limit':
        case 'collision':
          reason = code;
      }
    }
    logger.warn(`sync.retirement.deferred stage=${stage} reason=${reason}`);
  } catch {
    /* Advisory diagnostics cannot change retained bytes or maintenance progress. */
  }
}

/** Retry bounded published transport retirement through existing current native release authority. */
export function createPublishedOutgoingRetirement() {
  let binding: string | null = null;
  let afterKey: IDBValidKey | null = null;
  let pending: Promise<{ attempted: number; retiredPins: number; deferred: number }> | null = null;
  async function pass(input: RetirementInput) {
    const selection = structuredClone({ scope: input.scope, authorization: input.authorization });
    const currentBinding = JSON.stringify(selection);
    if (binding !== currentBinding) {
      binding = currentBinding;
      afterKey = null;
    }
    const result = { attempted: 0, retiredPins: 0, deferred: 0 };
    input.signal.throwIfAborted();
    let page;
    try {
      page = await discoverPublishedOutgoingRetirement({
        ...selection,
        afterKey,
        signal: input.signal,
      });
    } catch (error) {
      input.signal.throwIfAborted();
      deferred('discovery', error);
      return { ...result, deferred: 1 };
    }
    for (const operationId of page.operationIds) {
      input.signal.throwIfAborted();
      result.attempted++;
      try {
        const released = await releasePublishedOutgoing(
          selection.scope.spaceId,
          operationId,
          selection.authorization,
          input.remote,
          input.signal
        );
        result.retiredPins += released.released.length;
        if (released.released.length === 0) {
          result.deferred++;
          deferred('release', 'protected');
        }
      } catch (error) {
        input.signal.throwIfAborted();
        result.deferred++;
        deferred('release', error);
      }
    }
    input.signal.throwIfAborted();
    afterKey = page.afterKey;
    return result;
  }
  return {
    /** Overlapping passes share existing work. A later wakeup admits a replacement binding. */
    run(input: RetirementInput) {
      if (pending) return pending;
      pending = pass(input).finally(() => {
        pending = null;
      });
      return pending;
    },
  };
}

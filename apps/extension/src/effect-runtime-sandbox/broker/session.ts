import { closeEffectRuntimeBitmaps } from '../../contracts/effect-runtime/bitmap-lifetime';
import {
  createEffectRuntimeFailure,
  getEffectRuntimeIdentity,
} from '../../contracts/effect-runtime/identity';
import type {
  EffectRuntimeFrameResult,
  EffectRuntimeRenderRequest,
  EffectRuntimeWorkerMessage,
} from '../../contracts/effect-runtime/types';
import { EFFECT_RUNTIME_RESOURCE_LIMITS } from '../../features/video/composition/effect-runtime';
import { EffectRuntimePreparationError, prepareEffectRuntimeWorkerRequest } from './prepare-frame';
import { createEffectRuntimeDocumentCache } from './cache/documents';
import { createEffectRuntimeAssetSelectionCache } from './cache/asset-selections';
import { parseEffectRuntimeRenderRequest } from './request-boundary';
import { createEffectRuntimeWorkerSession, type EffectRuntimeWorkerLike } from './worker-request';

export interface EffectRuntimeBrokerSession {
  execute(value: unknown): Promise<EffectRuntimeFrameResult>;
  snapshot(): { activeRequests: number; consecutiveFailures: number; circuitOpen: boolean };
}

interface SessionDependencies {
  prepare?(request: EffectRuntimeRenderRequest): Promise<EffectRuntimeWorkerMessage>;
  workerFactory(): EffectRuntimeWorkerLike;
}

interface SessionState {
  activeRequests: number;
  consecutiveFailures: number;
}

export function createEffectRuntimeBrokerSession(
  dependencies: SessionDependencies
): EffectRuntimeBrokerSession {
  const state: SessionState = { activeRequests: 0, consecutiveFailures: 0 };
  const documentCache = createEffectRuntimeDocumentCache();
  const assetSelectionCache = createEffectRuntimeAssetSelectionCache();
  const workerSession = createEffectRuntimeWorkerSession({
    onReset: () => {
      documentCache.clear();
      assetSelectionCache.clear();
    },
    workerFactory: dependencies.workerFactory,
  });
  return {
    execute: (value) =>
      executeSessionRequest(
        value,
        dependencies,
        state,
        workerSession.execute,
        documentCache,
        assetSelectionCache
      ),
    snapshot: () => ({
      activeRequests: state.activeRequests,
      circuitOpen:
        state.consecutiveFailures >= EFFECT_RUNTIME_RESOURCE_LIMITS.maxConsecutiveFailures,
      consecutiveFailures: state.consecutiveFailures,
    }),
  };
}

async function executeSessionRequest(
  value: unknown,
  dependencies: SessionDependencies,
  state: SessionState,
  executeWorker: (request: EffectRuntimeWorkerMessage) => Promise<EffectRuntimeFrameResult>,
  documentCache: ReturnType<typeof createEffectRuntimeDocumentCache>,
  assetSelectionCache: ReturnType<typeof createEffectRuntimeAssetSelectionCache>
): Promise<EffectRuntimeFrameResult> {
  const unavailable = rejectUnavailableRequest(value, state);
  if (unavailable) return unavailable;
  state.activeRequests += 1;
  let request: EffectRuntimeRenderRequest | null = null;
  try {
    const parsed = await parseEffectRuntimeRenderRequest(value, documentCache, assetSelectionCache);
    if (!parsed.ok) {
      closeEffectRuntimeBitmaps(value);
      if (parsed.failure.code !== 'cacheMiss') recordFailure(state);
      return parsed.failure;
    }
    request = parsed.request;
    const workerRequest = await prepareSessionWorkerRequest(request, dependencies, state);
    if ('kind' in workerRequest) return workerRequest;
    const result = await executeWorker(workerRequest);
    if (result.kind === 'frame') state.consecutiveFailures = 0;
    else if (result.code !== 'cacheMiss') recordFailure(state);
    return result;
  } catch {
    if (request) closeEffectRuntimeBitmaps(request.inputFrames);
    else closeEffectRuntimeBitmaps(value);
    recordFailure(state);
    return createEffectRuntimeFailure(request ?? getEffectRuntimeIdentity(value), 'crashed');
  } finally {
    state.activeRequests -= 1;
  }
}

function rejectUnavailableRequest(
  value: unknown,
  state: SessionState
): EffectRuntimeFrameResult | null {
  if (state.consecutiveFailures >= EFFECT_RUNTIME_RESOURCE_LIMITS.maxConsecutiveFailures) {
    closeEffectRuntimeBitmaps(value);
    return createEffectRuntimeFailure(value, 'circuitOpen');
  }
  if (state.activeRequests < EFFECT_RUNTIME_RESOURCE_LIMITS.maxQueueDepth) return null;
  closeEffectRuntimeBitmaps(value);
  recordFailure(state);
  return createEffectRuntimeFailure(value, 'queueDepthExceeded');
}

async function prepareSessionWorkerRequest(
  request: EffectRuntimeRenderRequest,
  dependencies: SessionDependencies,
  state: SessionState
): Promise<EffectRuntimeWorkerMessage | EffectRuntimeFrameResult> {
  try {
    return await (dependencies.prepare ?? prepareEffectRuntimeWorkerRequest)(request);
  } catch (error) {
    closeEffectRuntimeBitmaps(request.inputFrames);
    recordFailure(state);
    return createEffectRuntimeFailure(
      request,
      error instanceof EffectRuntimePreparationError ? error.code : 'inputRejected'
    );
  }
}

function recordFailure(state: SessionState): void {
  state.consecutiveFailures = Math.min(
    EFFECT_RUNTIME_RESOURCE_LIMITS.maxConsecutiveFailures,
    state.consecutiveFailures + 1
  );
}

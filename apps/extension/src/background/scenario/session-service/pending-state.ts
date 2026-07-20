import { createLogger } from '@sniptale/platform/observability/logger';
import type { ScenarioSessionState } from '@sniptale/runtime-contracts/scenario/types/session';
import {
  clearPendingScenarioCaptureAsset,
  resolvePendingScenarioCapture,
  stagePendingScenarioCapture,
} from './pending-assets';
import type {
  PendingScenarioCapture,
  PendingScenarioCaptureInput,
  ResolvedPendingScenarioCapture,
} from './types';

const logger = createLogger({ namespace: 'BackgroundScenarioSession' });

function isSamePendingCapture(
  current: PendingScenarioCapture | null,
  expected: PendingScenarioCapture
): boolean {
  return current?.pendingAssetId === expected.pendingAssetId && current.id === expected.id;
}

export type ScenarioSessionPendingCaptureContext = {
  ensureHydrated: () => Promise<void>;
  getMutableSession: (tabId: number) => ScenarioSessionState;
  pendingCaptures: Map<number, PendingScenarioCapture>;
  persistSessions: () => Promise<void>;
  runPersistedWrite: <TResult>(task: () => Promise<TResult>) => Promise<TResult>;
};

/**
 * Stages a pending capture blob and keeps only the metadata/reference in session state.
 */
export async function bufferPendingCaptureState(
  context: ScenarioSessionPendingCaptureContext,
  tabId: number,
  capture: PendingScenarioCaptureInput
): Promise<ScenarioSessionState> {
  await context.ensureHydrated();

  const { previousCaptureForCleanup, session } = await context.runPersistedWrite(async () => {
    const stagedCapture = await stagePendingScenarioCapture(tabId, capture);
    const previousCapture = context.pendingCaptures.get(tabId) ?? null;
    const session = context.getMutableSession(tabId);
    const previousPendingProjectSelection = session.pendingProjectSelection;

    context.pendingCaptures.set(tabId, stagedCapture);
    session.pendingProjectSelection = true;

    try {
      await context.persistSessions();
    } catch (error) {
      if (previousCapture) {
        context.pendingCaptures.set(tabId, previousCapture);
      } else {
        context.pendingCaptures.delete(tabId);
      }
      session.pendingProjectSelection = previousPendingProjectSelection;
      await clearPendingScenarioCaptureAsset(stagedCapture);
      throw error;
    }

    return { previousCaptureForCleanup: previousCapture, session };
  });

  if (previousCaptureForCleanup) {
    try {
      await clearPendingScenarioCaptureAsset(previousCaptureForCleanup);
    } catch (error) {
      logger.warn('Failed to clear replaced pending scenario capture asset', {
        error,
        pendingAssetId: previousCaptureForCleanup.pendingAssetId,
        tabId,
      });
    }
  }

  return session;
}

/**
 * Clears a pending capture reference and removes its staged blob.
 */
export async function clearPendingCaptureState(
  context: ScenarioSessionPendingCaptureContext,
  tabId: number,
  expectedCapture?: PendingScenarioCapture
): Promise<ScenarioSessionState> {
  const { session } = await clearPendingCaptureStateWithResult(context, tabId, expectedCapture);
  return session;
}

async function clearPendingCaptureStateWithResult(
  context: ScenarioSessionPendingCaptureContext,
  tabId: number,
  expectedCapture?: PendingScenarioCapture
): Promise<{ cleared: boolean; session: ScenarioSessionState }> {
  await context.ensureHydrated();

  const { captureForCleanup, cleared, session } = await context.runPersistedWrite(async () => {
    const capture = context.pendingCaptures.get(tabId) ?? null;
    const hadCapture = context.pendingCaptures.has(tabId);
    const session = context.getMutableSession(tabId);
    const previousPendingProjectSelection = session.pendingProjectSelection;

    if (expectedCapture && !isSamePendingCapture(capture, expectedCapture)) {
      return { captureForCleanup: null, cleared: false, session };
    }

    context.pendingCaptures.delete(tabId);
    session.pendingProjectSelection = false;

    try {
      await context.persistSessions();
    } catch (error) {
      if (capture && hadCapture) {
        context.pendingCaptures.set(tabId, capture);
      }
      session.pendingProjectSelection = previousPendingProjectSelection;
      throw error;
    }

    return { captureForCleanup: capture, cleared: true, session };
  });

  await clearPendingScenarioCaptureAsset(captureForCleanup);
  return { cleared, session };
}

/**
 * Resolves a pending capture reference back into a flush-ready payload.
 */
export async function resolvePendingCaptureState(
  context: ScenarioSessionPendingCaptureContext,
  tabId: number
): Promise<ResolvedPendingScenarioCapture | null> {
  await context.ensureHydrated();
  const capture = context.pendingCaptures.get(tabId) ?? null;
  if (!capture) {
    return null;
  }

  const resolvedCapture = await resolvePendingScenarioCapture(capture);
  if (resolvedCapture) {
    return resolvedCapture;
  }

  logger.warn('Pending scenario capture asset is missing; clearing buffered capture', {
    pendingAssetId: capture.pendingAssetId,
    tabId,
  });
  await clearPendingCaptureStateWithResult(context, tabId, capture);
  return null;
}

/**
 * Resolves and clears a pending capture in one step for flush/consume paths.
 */
export async function consumePendingCaptureState(
  context: ScenarioSessionPendingCaptureContext,
  tabId: number
): Promise<ResolvedPendingScenarioCapture | null> {
  await context.ensureHydrated();
  const capture = await resolvePendingCaptureState(context, tabId);
  if (!capture) {
    return null;
  }

  const clearResult = await clearPendingCaptureStateWithResult(context, tabId, capture);
  if (!clearResult.cleared) {
    return null;
  }

  return capture;
}

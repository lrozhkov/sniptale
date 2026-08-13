// policyStateId: video-capture-surface-sessions
// Navigation recovery restores page-owned effects without interrupting the media recorder.
import { createLogger } from '@sniptale/platform/observability/logger';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { getVideoSurfaceSession } from '../../../capture-surface';
import { getVideoRecordingRuntimeState } from '../../session-state';
import {
  isCurrentNavigationBinding,
  resolveNavigationBinding,
  type NavigationBinding,
} from './binding';
import {
  abandonTabNavigationPageEffects,
  beginTabNavigationPageEffects,
  resolveTabNavigationPageEffects,
  restoreTabNavigationPageEffects,
  restoreViewportCursorProjectionBeforeThaw,
  suspendTabNavigationPageEffects,
  type TabNavigationPageEffects,
  type TabNavigationPageAccessVerifier,
} from './page-effects';
import {
  createExactOutputTransitionId,
  freezeExactOutput,
  resetExactOutputTransitionForTests,
  serializeExactOutputWork,
  stopAfterCriticalOutputFailure as stopBoundRecordingAfterCriticalOutputFailure,
  thawExactOutput,
} from './output-transition';
import { reassertViewportSurface, revalidateTabSource } from './source-validation';

const logger = createLogger({ namespace: 'BackgroundVideoTabNavigationTransaction' });

type TabNavigationTransaction = {
  binding: NavigationBinding;
  completion: Promise<void> | null;
  documentId: string | null;
  effects: TabNavigationPageEffects;
  failureHandling: Promise<void> | null;
  navigationEpoch: number | null;
  outputFrozen: boolean;
  outputTransitionId: string | null;
  outputSuspension: Promise<OperationResult>;
  preparation: Promise<boolean>;
  pageAccessVerifier: TabNavigationPageAccessVerifier | null;
  reassertViewport: boolean;
  requiresExactOutputRecovery: boolean;
  revalidateSource: boolean;
  shouldResume: boolean;
  viewportReassertion: Promise<OperationResult> | null;
};

type OperationResult = { ok: true } | { error: unknown; ok: false };

let activeTransaction: TabNavigationTransaction | null = null;
const navigationIdleWaiters = new Set<() => void>();

function observeOperation(work: Promise<void>): Promise<OperationResult> {
  return work.then(
    () => ({ ok: true }),
    (error: unknown) => ({ error, ok: false })
  );
}

function isCurrentTransaction(transaction: TabNavigationTransaction): boolean {
  return activeTransaction === transaction && isCurrentNavigationBinding(transaction.binding);
}

function createEffectBinding(transaction: TabNavigationTransaction) {
  return {
    generation: transaction.binding.generation,
    isCurrent: () => isCurrentTransaction(transaction),
    navigationEpoch: transaction.navigationEpoch,
    recordingId: transaction.binding.recordingId,
    shouldResume: transaction.shouldResume,
    tabId: transaction.binding.tabId,
  };
}

function abandonCurrentTransaction(transaction: TabNavigationTransaction, error: unknown): void {
  if (!isCurrentTransaction(transaction)) return;
  logger.warn('Tab recording page recovery was skipped; media recording continues', error);
  abandonTabNavigationPageEffects(transaction.effects, createEffectBinding(transaction));
  clearActiveTransaction(transaction);
}

function resolveNavigationIdleWaiters(): void {
  for (const resolve of navigationIdleWaiters) resolve();
  navigationIdleWaiters.clear();
}

function clearActiveTransaction(transaction: TabNavigationTransaction): void {
  if (activeTransaction !== transaction) return;
  activeTransaction = null;
  resolveNavigationIdleWaiters();
}

async function stopAfterCriticalOutputFailure(
  transaction: TabNavigationTransaction,
  error: unknown
): Promise<void> {
  if (!isCurrentTransaction(transaction)) return;
  if (transaction.failureHandling) return transaction.failureHandling;
  let handling: Promise<void>;
  handling = performCriticalOutputFailureStop(transaction, error).finally(() => {
    if (transaction.failureHandling === handling) transaction.failureHandling = null;
  });
  transaction.failureHandling = handling;
  return handling;
}

async function performCriticalOutputFailureStop(
  transaction: TabNavigationTransaction,
  error: unknown
): Promise<void> {
  if (!isCurrentTransaction(transaction)) return;
  const result = await stopBoundRecordingAfterCriticalOutputFailure({
    beforeStop: () =>
      abandonTabNavigationPageEffects(transaction.effects, createEffectBinding(transaction)),
    ...(transaction.outputTransitionId ? { compensate: () => resumeExactOutput(transaction) } : {}),
    error,
    isCurrent: () => isCurrentTransaction(transaction),
  });
  if (result === 'stopped' || (result === 'compensated' && !transaction.outputFrozen)) {
    clearActiveTransaction(transaction);
  }
}

function enqueueOutputFreeze(
  transaction: TabNavigationTransaction,
  work: () => Promise<OperationResult>
): Promise<OperationResult> {
  const runIfCurrent = (): Promise<OperationResult> | OperationResult =>
    isCurrentTransaction(transaction) ? work() : { ok: true };
  return serializeExactOutputWork(runIfCurrent);
}

async function createOutputSuspension(
  transaction: TabNavigationTransaction,
  enabled: boolean
): Promise<OperationResult> {
  if (!enabled) return { ok: true };
  return enqueueOutputFreeze(transaction, async () => {
    const transitionId = transaction.outputTransitionId;
    if (!transitionId) {
      return { error: new Error('Tab output transition identity is unavailable'), ok: false };
    }
    const result = await observeOperation(
      freezeExactOutput({
        binding: transaction.binding,
        isCurrent: () => isCurrentTransaction(transaction),
        onApplied: (frozen) => {
          if (activeTransaction === transaction) transaction.outputFrozen = frozen;
        },
        transitionId,
      })
    );
    if (!result.ok && isCurrentTransaction(transaction)) {
      await stopAfterCriticalOutputFailure(transaction, result.error);
    }
    return result;
  });
}

async function prepareTransaction(transaction: TabNavigationTransaction): Promise<boolean> {
  try {
    await suspendTabNavigationPageEffects(transaction.effects, createEffectBinding(transaction));
  } catch (error) {
    logger.warn('Recording page effects could not be suspended before navigation', error);
  }
  return isCurrentNavigationBinding(transaction.binding);
}

function createTransaction(
  binding: NavigationBinding,
  previous: TabNavigationTransaction | null
): TabNavigationTransaction | null {
  const reassertViewport =
    getVideoSurfaceSession(binding.recordingId)?.applied?.target === 'viewport';
  const requiresExactOutputRecovery = true;
  const effects = resolveTabNavigationPageEffects(reassertViewport);
  const transaction: TabNavigationTransaction = {
    binding,
    completion: null,
    documentId: null,
    effects,
    failureHandling: null,
    navigationEpoch: previous?.navigationEpoch ?? null,
    outputFrozen: false,
    outputTransitionId: null,
    outputSuspension: Promise.resolve<OperationResult>({ ok: true }),
    preparation: Promise.resolve(false),
    pageAccessVerifier: null,
    reassertViewport,
    requiresExactOutputRecovery,
    revalidateSource: true,
    shouldResume:
      previous?.shouldResume ??
      getVideoRecordingRuntimeState().status === VideoRecordingStatus.RECORDING,
    viewportReassertion: null,
  };
  activeTransaction = transaction;
  if (requiresExactOutputRecovery) {
    try {
      transaction.outputTransitionId = createExactOutputTransitionId(
        'Secure navigation transition generation is unavailable'
      );
    } catch (error) {
      transaction.outputSuspension = Promise.resolve({ error, ok: false });
      void stopAfterCriticalOutputFailure(transaction, error);
      return transaction;
    }
  }
  transaction.navigationEpoch = previous?.navigationEpoch ?? beginTabNavigationPageEffects(effects);
  transaction.outputSuspension = createOutputSuspension(transaction, requiresExactOutputRecovery);
  transaction.preparation = previous?.preparation ?? prepareTransaction(transaction);
  return transaction;
}

function startViewportReassertion(transaction: TabNavigationTransaction): void {
  if (!transaction.reassertViewport || transaction.viewportReassertion) return;
  transaction.viewportReassertion = transaction.outputSuspension.then((suspension) =>
    suspension.ok && isCurrentTransaction(transaction)
      ? observeOperation(reassertViewportSurface(transaction.binding))
      : suspension
  );
}

async function resumeExactOutput(transaction: TabNavigationTransaction): Promise<void> {
  const transitionId = transaction.outputTransitionId;
  if (!transitionId) throw new Error('Tab output transition identity is unavailable');
  await thawExactOutput({
    binding: transaction.binding,
    isCurrent: () => isCurrentTransaction(transaction),
    onApplied: (frozen) => {
      if (activeTransaction === transaction) transaction.outputFrozen = frozen;
    },
    transitionId,
  });
}

async function restoreOptionalPageEffects(
  transaction: TabNavigationTransaction,
  pageAccessVerifier: TabNavigationPageAccessVerifier
): Promise<void> {
  try {
    const result = await restoreTabNavigationPageEffects(
      transaction.effects,
      createEffectBinding(transaction),
      pageAccessVerifier
    );
    if (
      isCurrentTransaction(transaction) &&
      transaction.effects.controlledCursor &&
      !result.controlledCursorRestored
    ) {
      logger.warn('Controlled cursor could not be restored after navigation');
      abandonTabNavigationPageEffects(transaction.effects, createEffectBinding(transaction));
    }
  } catch (error) {
    if (!isCurrentTransaction(transaction)) return;
    logger.warn('Recording page effects could not be restored after navigation', error);
    abandonTabNavigationPageEffects(transaction.effects, createEffectBinding(transaction));
  }
}

export function beginTabNavigationTransaction(
  tabId: number,
  supersede: boolean
): TabNavigationTransaction | null {
  const binding = resolveNavigationBinding(tabId);
  if (!binding) return null;
  const current = activeTransaction;
  if (current && isCurrentTransaction(current) && !supersede) return current;
  return createTransaction(binding, current && isCurrentTransaction(current) ? current : null);
}

async function restoreTransaction(transaction: TabNavigationTransaction): Promise<void> {
  try {
    if (!(await transaction.preparation) || !isCurrentTransaction(transaction)) return;
    const pageAccessVerifier = transaction.pageAccessVerifier;
    if (!pageAccessVerifier) throw new Error('Recording page access verifier is unavailable');
    const outputSuspension = await transaction.outputSuspension;
    if (!outputSuspension.ok) throw outputSuspension.error;
    startViewportReassertion(transaction);
    const viewportReassertion = await transaction.viewportReassertion;
    if (viewportReassertion && !viewportReassertion.ok) throw viewportReassertion.error;
    if (!isCurrentTransaction(transaction)) return;
    if (transaction.requiresExactOutputRecovery) {
      await pageAccessVerifier(
        transaction.binding.tabId,
        'Recording page access is required to restore exact tab output.'
      );
    }
    if (!isCurrentTransaction(transaction)) return;
    await restoreViewportCursorProjectionBeforeThaw(
      transaction.effects,
      createEffectBinding(transaction),
      pageAccessVerifier
    );
    if (!isCurrentTransaction(transaction)) return;
    if (transaction.revalidateSource) {
      try {
        await revalidateTabSource(
          transaction.binding,
          null,
          transaction.outputTransitionId ?? undefined,
          transaction.documentId
        );
      } catch (error) {
        if (transaction.requiresExactOutputRecovery) throw error;
        logger.warn(
          'Tab source mapping could not be revalidated; media recording continues',
          error
        );
      }
    }
    if (!isCurrentTransaction(transaction)) return;
    if (transaction.requiresExactOutputRecovery) {
      await resumeExactOutput(transaction);
    }
    if (!isCurrentTransaction(transaction)) return;
    await restoreOptionalPageEffects(transaction, pageAccessVerifier);
    if (!isCurrentTransaction(transaction)) return;
    clearActiveTransaction(transaction);
  } catch (error) {
    if (transaction.requiresExactOutputRecovery) {
      await stopAfterCriticalOutputFailure(transaction, error);
    } else {
      abandonCurrentTransaction(transaction, error);
    }
  }
}

function startCompletion(transaction: TabNavigationTransaction): void {
  if (transaction.completion) return;
  transaction.completion = restoreTransaction(transaction).catch((error) => {
    logger.error('Unexpected tab recording navigation recovery failure', error);
  });
}

export function bindTabNavigationDocument(tabId: number, documentId: string): boolean {
  let transaction = activeTransaction;
  if (!transaction || transaction.binding.tabId !== tabId || !isCurrentTransaction(transaction)) {
    transaction = beginTabNavigationTransaction(tabId, false);
  } else if (transaction.documentId && transaction.documentId !== documentId) {
    transaction = beginTabNavigationTransaction(tabId, true);
  }
  if (!transaction) return false;
  transaction.documentId = documentId;
  startViewportReassertion(transaction);
  return true;
}

export function completeTabNavigationDocument(
  tabId: number,
  documentId: string,
  pageAccessVerifier: TabNavigationPageAccessVerifier
): boolean {
  const transaction = activeTransaction;
  if (!transaction || transaction.binding.tabId !== tabId || !isCurrentTransaction(transaction)) {
    return false;
  }
  if (transaction.documentId && transaction.documentId !== documentId) return false;
  transaction.documentId = documentId;
  transaction.pageAccessVerifier = pageAccessVerifier;
  startCompletion(transaction);
  return true;
}

export function recoverDetachedViewport(
  tabId: number,
  pageAccessVerifier: TabNavigationPageAccessVerifier
): boolean {
  const binding = resolveNavigationBinding(tabId);
  if (getVideoSurfaceSession(binding?.recordingId ?? '')?.applied?.target !== 'viewport') {
    return false;
  }
  const pending = activeTransaction;
  if (pending && pending.binding.tabId === tabId && isCurrentTransaction(pending)) return true;
  const transaction = beginTabNavigationTransaction(tabId, true);
  if (!transaction) return false;
  transaction.pageAccessVerifier = pageAccessVerifier;
  startCompletion(transaction);
  return true;
}

export function failActiveTabNavigation(error: unknown): void {
  const transaction = activeTransaction;
  if (!transaction) return;
  if (transaction.requiresExactOutputRecovery) {
    void stopAfterCriticalOutputFailure(transaction, error);
    return;
  }
  abandonCurrentTransaction(transaction, error);
}

export function isTabNavigationTransactionPending(): boolean {
  return activeTransaction !== null && isCurrentTransaction(activeTransaction);
}

export function waitForTabNavigationTransactionIdle(): Promise<void> {
  if (!isTabNavigationTransactionPending()) return Promise.resolve();
  return new Promise((resolve) => navigationIdleWaiters.add(resolve));
}

export function markTabNavigationManuallyPaused(): void {
  const transaction = activeTransaction;
  if (transaction && isCurrentTransaction(transaction)) transaction.shouldResume = false;
}

export function resetTabNavigationTransactionForTests(): void {
  activeTransaction = null;
  resolveNavigationIdleWaiters();
  resetExactOutputTransitionForTests();
}

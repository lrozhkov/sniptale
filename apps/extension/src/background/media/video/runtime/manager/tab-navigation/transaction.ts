// policyStateId: video-capture-surface-sessions
// Navigation recovery restores page-owned effects without interrupting the media recorder.
import { createLogger } from '@sniptale/platform/observability/logger';
import { createSecureRandomUuid } from '@sniptale/platform/security/secure-random-id';
import { CaptureMode, VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { getVideoSurfaceSession } from '../../../capture-surface';
import {
  setViewportOutputFrozen,
  type ViewportOutputStateResult,
} from '../../../capture-surface/output-state';
import { getVideoRecordingRuntimeState, setVideoRecordingRuntimeState } from '../../session-state';
import { stopRecording } from '../controls.stop';
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
let exactOutputFreezeQueue: Promise<void> | null = null;

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
  activeTransaction = null;
}

function resolveErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
  const message = resolveErrorMessage(error);
  logger.error('Exact tab output recovery failed; stopping bound recording', error);
  abandonTabNavigationPageEffects(transaction.effects, createEffectBinding(transaction));
  setVideoRecordingRuntimeState({ error: message });
  let stopFailure: unknown = null;
  try {
    const result = await stopRecording(false);
    if (result.result !== 'failed') {
      if (activeTransaction === transaction) activeTransaction = null;
      return;
    }
    stopFailure = result.error;
    logger.error('Bound recording stop failed after tab output recovery failure', result.error);
  } catch (stopError) {
    stopFailure = stopError;
    logger.error('Bound recording stop threw after tab output recovery failure', stopError);
  }

  if (activeTransaction !== transaction || !isCurrentNavigationBinding(transaction.binding)) {
    return;
  }
  if (!transaction.outputTransitionId) {
    logger.error('Tab output transition authority retained after rejected bound stop', stopFailure);
    return;
  }
  try {
    await resumeExactOutput(transaction);
    if (activeTransaction === transaction && !transaction.outputFrozen) {
      activeTransaction = null;
    }
  } catch (resumeError) {
    logger.error(
      'Tab output transition authority retained after rejected stop and thaw',
      resumeError
    );
  }
}

async function requireAppliedOutputState(
  transaction: TabNavigationTransaction,
  frozen: boolean
): Promise<void> {
  const transitionId = transaction.outputTransitionId;
  if (!transitionId) throw new Error('Tab output transition identity is unavailable');
  const result: ViewportOutputStateResult = await setViewportOutputFrozen(
    transaction.binding,
    frozen,
    transitionId
  );
  if (result !== 'applied') {
    throw new Error(
      `Tab output ${frozen ? 'freeze' : 'resume'} was superseded by another navigation`
    );
  }
  if (activeTransaction === transaction) transaction.outputFrozen = frozen;
}

function enqueueOutputFreeze(
  transaction: TabNavigationTransaction,
  work: () => Promise<OperationResult>
): Promise<OperationResult> {
  const runIfCurrent = (): Promise<OperationResult> | OperationResult =>
    isCurrentTransaction(transaction) ? work() : { ok: true };
  let queued: Promise<OperationResult>;
  if (exactOutputFreezeQueue) {
    queued = exactOutputFreezeQueue.then(runIfCurrent, runIfCurrent);
  } else {
    try {
      queued = Promise.resolve(runIfCurrent());
    } catch (error) {
      queued = Promise.reject(error);
    }
  }
  const tail = queued.then(
    () => undefined,
    () => undefined
  );
  exactOutputFreezeQueue = tail;
  void tail.then(() => {
    if (exactOutputFreezeQueue === tail) exactOutputFreezeQueue = null;
  });
  return queued;
}

async function createOutputSuspension(
  transaction: TabNavigationTransaction,
  enabled: boolean
): Promise<OperationResult> {
  if (!enabled) return { ok: true };
  return enqueueOutputFreeze(transaction, async () => {
    const initial = await observeOperation(requireAppliedOutputState(transaction, true));
    if (initial.ok || !isCurrentTransaction(transaction)) return initial;
    logger.warn('Initial tab output freeze was not acknowledged; retrying', initial.error);
    const retry = await observeOperation(requireAppliedOutputState(transaction, true));
    if (retry.ok || !isCurrentTransaction(transaction)) return retry;
    await stopAfterCriticalOutputFailure(
      transaction,
      new AggregateError([initial.error, retry.error], 'Tab output freeze could not be confirmed')
    );
    return retry;
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
  const requiresExactOutputRecovery =
    binding.captureMode === CaptureMode.TAB_CROP || reassertViewport;
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
      transaction.outputTransitionId = createSecureRandomUuid(
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
  const initial = await observeOperation(requireAppliedOutputState(transaction, false));
  if (initial.ok || !isCurrentTransaction(transaction)) return;
  logger.warn('Initial tab output resume was not acknowledged; retrying', initial.error);
  const retry = await observeOperation(requireAppliedOutputState(transaction, false));
  if (!retry.ok) throw retry.error;
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
          transaction.outputTransitionId ?? undefined
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
    if (activeTransaction === transaction) activeTransaction = null;
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

export function markTabNavigationManuallyPaused(): void {
  const transaction = activeTransaction;
  if (transaction && isCurrentTransaction(transaction)) transaction.shouldResume = false;
}

export function resetTabNavigationTransactionForTests(): void {
  activeTransaction = null;
  exactOutputFreezeQueue = null;
}

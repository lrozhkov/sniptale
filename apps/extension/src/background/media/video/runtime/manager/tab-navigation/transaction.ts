// policyStateId: video-capture-surface-sessions
// Navigation recovery restores page-owned effects without interrupting the media recorder.
import { createLogger } from '@sniptale/platform/observability/logger';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { getVideoSurfaceSession } from '../../../capture-surface';
import { getVideoRecordingRuntimeState } from '../../session-state';
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
  suspendTabNavigationPageEffects,
  type TabNavigationPageEffects,
  type TabNavigationPageAccessVerifier,
} from './page-effects';
import {
  reassertViewportSurface,
  revalidateTabSource,
  setViewportOutputFrozen,
} from './source-validation';

const logger = createLogger({ namespace: 'BackgroundVideoTabNavigationTransaction' });

type TabNavigationTransaction = {
  binding: NavigationBinding;
  completion: Promise<void> | null;
  documentId: string | null;
  effects: TabNavigationPageEffects;
  navigationEpoch: number | null;
  outputSuspension: Promise<OperationResult>;
  preparation: Promise<boolean>;
  pageAccessVerifier: TabNavigationPageAccessVerifier | null;
  reassertViewport: boolean;
  revalidateSource: boolean;
  shouldResume: boolean;
  viewportReassertion: Promise<OperationResult> | null;
};

type OperationResult = { ok: true } | { error: unknown; ok: false };

let activeTransaction: TabNavigationTransaction | null = null;

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

async function stopAfterUnconfirmedViewportFreeze(
  transaction: TabNavigationTransaction,
  initialError: unknown,
  retryError: unknown
): Promise<void> {
  if (!isCurrentTransaction(transaction)) return;
  logger.error('Viewport output freeze could not be confirmed; stopping bound recording', {
    initialError,
    retryError,
  });
  abandonTabNavigationPageEffects(transaction.effects, createEffectBinding(transaction));
  activeTransaction = null;
  try {
    const result = await stopRecording(false);
    if (result.result === 'failed') {
      logger.error('Bound recording stop failed after viewport freeze rejection', result.error);
    }
  } catch (error) {
    logger.error('Bound recording stop threw after viewport freeze rejection', error);
  }
}

async function createOutputSuspension(
  transaction: TabNavigationTransaction,
  enabled: boolean
): Promise<OperationResult> {
  if (!enabled) return { ok: true };
  const initial = await observeOperation(setViewportOutputFrozen(transaction.binding, true));
  if (initial.ok || !isCurrentTransaction(transaction)) return initial;
  logger.warn('Initial viewport output freeze was not acknowledged; retrying', initial.error);
  const retry = await observeOperation(setViewportOutputFrozen(transaction.binding, true));
  if (retry.ok || !isCurrentTransaction(transaction)) return retry;
  await stopAfterUnconfirmedViewportFreeze(transaction, initial.error, retry.error);
  return retry;
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
  const effects = resolveTabNavigationPageEffects();
  const reassertViewport =
    getVideoSurfaceSession(binding.recordingId)?.applied?.target === 'viewport';
  const transaction: TabNavigationTransaction = {
    binding,
    completion: null,
    documentId: null,
    effects,
    navigationEpoch: previous?.navigationEpoch ?? beginTabNavigationPageEffects(effects),
    outputSuspension: Promise.resolve<OperationResult>({ ok: true }),
    preparation: Promise.resolve(false),
    pageAccessVerifier: null,
    reassertViewport,
    revalidateSource: true,
    shouldResume:
      previous?.shouldResume ??
      getVideoRecordingRuntimeState().status === VideoRecordingStatus.RECORDING,
    viewportReassertion: null,
  };
  activeTransaction = transaction;
  transaction.outputSuspension = createOutputSuspension(transaction, reassertViewport);
  transaction.preparation = previous?.preparation ?? prepareTransaction(transaction);
  return transaction;
}

function startViewportReassertion(transaction: TabNavigationTransaction): void {
  if (!transaction.reassertViewport || transaction.viewportReassertion) return;
  transaction.viewportReassertion = transaction.outputSuspension.then((suspension) =>
    suspension.ok ? observeOperation(reassertViewportSurface(transaction.binding)) : suspension
  );
}

async function resumeViewportOutput(transaction: TabNavigationTransaction): Promise<void> {
  try {
    await setViewportOutputFrozen(transaction.binding, false);
  } catch (error) {
    if (isCurrentTransaction(transaction)) {
      const refreeze = await observeOperation(setViewportOutputFrozen(transaction.binding, true));
      if (!refreeze.ok) {
        logger.warn(
          'Viewport output could not be re-frozen after a missing resume acknowledgement',
          {
            refreezeError: refreeze.error,
            resumeError: error,
          }
        );
      }
    }
    throw error;
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

    const pageEffects = await restoreTabNavigationPageEffects(
      transaction.effects,
      createEffectBinding(transaction),
      pageAccessVerifier
    );
    if (!isCurrentTransaction(transaction)) return;
    if (transaction.effects.controlledCursor && !pageEffects.controlledCursorRestored) {
      throw new Error('Controlled cursor could not be restored after navigation');
    }
    if (transaction.revalidateSource) {
      await revalidateTabSource(transaction.binding, pageEffects.liveViewport, pageAccessVerifier);
    }
    if (!isCurrentTransaction(transaction)) return;
    if (transaction.reassertViewport) {
      await resumeViewportOutput(transaction);
    }
    if (!isCurrentTransaction(transaction)) return;
    if (activeTransaction === transaction) activeTransaction = null;
  } catch (error) {
    abandonCurrentTransaction(transaction, error);
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
  if (transaction) abandonCurrentTransaction(transaction, error);
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
}

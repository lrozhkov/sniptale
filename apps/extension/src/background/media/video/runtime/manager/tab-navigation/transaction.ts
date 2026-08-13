// policyStateId: video-capture-surface-sessions
// Navigation restores page-owned effects; the native tab stream remains uninterrupted.
import { createLogger } from '@sniptale/platform/observability/logger';
import { CaptureMode, VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
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
  type TabNavigationPageAccessVerifier,
  type TabNavigationPageEffects,
} from './page-effects';

const logger = createLogger({ namespace: 'BackgroundVideoTabNavigationTransaction' });
const REQUIRED_CROP_STOP_RETRY_DELAYS_MS = [0, 250, 1000, 2000] as const;

type TabNavigationTransaction = {
  binding: NavigationBinding;
  completion: Promise<void> | null;
  documentId: string | null;
  effects: TabNavigationPageEffects;
  navigationEpoch: number | null;
  preparation: Promise<boolean>;
  pageAccessVerifier: TabNavigationPageAccessVerifier | null;
  shouldResume: boolean;
  stopAfterRequiredFailure: Promise<void> | null;
};

let activeTransaction: TabNavigationTransaction | null = null;

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

function clearActiveTransaction(transaction: TabNavigationTransaction): void {
  if (activeTransaction !== transaction) return;
  activeTransaction = null;
}

function abandonTransaction(transaction: TabNavigationTransaction, error: unknown): void {
  if (!isCurrentTransaction(transaction)) return;
  logger.warn('Tab page effects could not be restored; media recording continues', error);
  abandonTabNavigationPageEffects(transaction.effects, createEffectBinding(transaction));
  clearActiveTransaction(transaction);
}

async function stopAfterRequiredCropFailure(
  transaction: TabNavigationTransaction,
  error: unknown
): Promise<void> {
  if (!isCurrentTransaction(transaction)) return;
  if (transaction.stopAfterRequiredFailure) return transaction.stopAfterRequiredFailure;
  let stop: Promise<void>;
  stop = performRequiredCropStop(transaction, error).finally(() => {
    if (transaction.stopAfterRequiredFailure === stop) {
      transaction.stopAfterRequiredFailure = null;
    }
  });
  transaction.stopAfterRequiredFailure = stop;
  return stop;
}

async function performRequiredCropStop(
  transaction: TabNavigationTransaction,
  error: unknown
): Promise<void> {
  logger.error('Required recording-region restoration failed; stopping bound recording', error);
  abandonTabNavigationPageEffects(transaction.effects, createEffectBinding(transaction));
  let attempt = 0;
  while (isCurrentTransaction(transaction)) {
    let failure: unknown = null;
    try {
      const result = await stopRecording(false);
      if (result.result !== 'failed' && result.result !== 'already-stopping') {
        clearActiveTransaction(transaction);
        return;
      }
      failure = result.result === 'failed' ? result.error : result.result;
    } catch (error) {
      failure = error;
    }
    logger.error('Bound recording stop failed after recording-region restoration failure', {
      attempt,
      error: failure,
      recordingId: transaction.binding.recordingId,
    });
    const delayMs =
      REQUIRED_CROP_STOP_RETRY_DELAYS_MS[
        Math.min(attempt, REQUIRED_CROP_STOP_RETRY_DELAYS_MS.length - 1)
      ]!;
    attempt += 1;
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
  }
  clearActiveTransaction(transaction);
}

async function prepareTransaction(transaction: TabNavigationTransaction): Promise<boolean> {
  try {
    await suspendTabNavigationPageEffects(transaction.effects, createEffectBinding(transaction));
  } catch (error) {
    logger.warn('Recording page effects could not be suspended before navigation', error);
  }
  return isCurrentTransaction(transaction);
}

function createTransaction(
  binding: NavigationBinding,
  previous: TabNavigationTransaction | null
): TabNavigationTransaction {
  const effects = resolveTabNavigationPageEffects();
  const transaction: TabNavigationTransaction = {
    binding,
    completion: null,
    documentId: null,
    effects,
    navigationEpoch: previous?.navigationEpoch ?? beginTabNavigationPageEffects(effects),
    preparation: Promise.resolve(false),
    pageAccessVerifier: null,
    shouldResume:
      previous?.shouldResume ??
      getVideoRecordingRuntimeState().status === VideoRecordingStatus.RECORDING,
    stopAfterRequiredFailure: null,
  };
  activeTransaction = transaction;
  transaction.preparation = previous
    ? previous.preparation.then((prepared) => {
        if (!isCurrentTransaction(transaction)) return false;
        return prepared ? true : prepareTransaction(transaction);
      })
    : prepareTransaction(transaction);
  return transaction;
}

export function beginTabNavigationTransaction(
  tabId: number,
  supersede: boolean
): TabNavigationTransaction | null {
  const binding = resolveNavigationBinding(tabId);
  if (!binding) return null;
  const current = activeTransaction;
  if (current && isCurrentTransaction(current) && current.stopAfterRequiredFailure) return current;
  if (current && isCurrentTransaction(current) && !supersede) return current;
  return createTransaction(binding, current && isCurrentTransaction(current) ? current : null);
}

async function restoreTransaction(transaction: TabNavigationTransaction): Promise<void> {
  try {
    if (!(await transaction.preparation) || !isCurrentTransaction(transaction)) return;
    const pageAccessVerifier = transaction.pageAccessVerifier;
    if (!pageAccessVerifier) throw new Error('Recording page access verifier is unavailable');
    await restoreTabNavigationPageEffects(
      transaction.effects,
      createEffectBinding(transaction),
      pageAccessVerifier
    );
    if (isCurrentTransaction(transaction)) clearActiveTransaction(transaction);
  } catch (error) {
    if (transaction.binding.captureMode === CaptureMode.TAB_CROP) {
      await stopAfterRequiredCropFailure(transaction, error);
    } else {
      abandonTransaction(transaction, error);
    }
  }
}

function startCompletion(transaction: TabNavigationTransaction): void {
  transaction.completion ??= restoreTransaction(transaction).catch((error) => {
    logger.error('Unexpected tab page-effect restoration failure', error);
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
  if (transaction.stopAfterRequiredFailure) return true;
  transaction.documentId = documentId;
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
  if (transaction.stopAfterRequiredFailure) return true;
  if (transaction.documentId && transaction.documentId !== documentId) return false;
  transaction.documentId = documentId;
  transaction.pageAccessVerifier = pageAccessVerifier;
  startCompletion(transaction);
  return true;
}

export function failActiveTabNavigation(error: unknown): void {
  const transaction = activeTransaction;
  if (!transaction) return;
  if (transaction.binding.captureMode === CaptureMode.TAB_CROP) {
    void stopAfterRequiredCropFailure(transaction, error);
  } else {
    abandonTransaction(transaction, error);
  }
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

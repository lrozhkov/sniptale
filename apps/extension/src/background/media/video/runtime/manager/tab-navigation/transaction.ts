// policyStateId: video-capture-surface-sessions - this transaction suspends and restores the active recording surface.
import { createLogger } from '@sniptale/platform/observability/logger';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { getVideoSurfaceSession } from '../../../capture-surface';
import { getVideoRecordingRuntimeState } from '../../session-state';
import { stopRecording } from '../controls.stop';
import {
  isCurrentNavigationBinding,
  resolveNavigationBinding,
  sendNavigationRecorderCommand,
  type NavigationBinding,
} from './binding';
import {
  resolveTabNavigationPageEffects,
  restoreTabNavigationPageEffects,
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
  pauseRecorder: boolean;
  pauseResult: Promise<boolean>;
  pageAccessVerifier: TabNavigationPageAccessVerifier | null;
  reassertViewport: boolean;
  revalidateSource: boolean;
  shouldResume: boolean;
};

let activeTransaction: TabNavigationTransaction | null = null;

function isCurrentTransaction(transaction: TabNavigationTransaction): boolean {
  return activeTransaction === transaction && isCurrentNavigationBinding(transaction.binding);
}

function createEffectBinding(transaction: TabNavigationTransaction) {
  return {
    isCurrent: () => isCurrentTransaction(transaction),
    recordingId: transaction.binding.recordingId,
    shouldResume: transaction.shouldResume,
    tabId: transaction.binding.tabId,
  };
}

async function stopCurrentTransaction(
  transaction: TabNavigationTransaction,
  error: unknown
): Promise<void> {
  if (!isCurrentTransaction(transaction)) return;
  logger.error('Tab recording could not be restored after navigation', error);
  activeTransaction = null;
  const result = await stopRecording(false);
  if (result.result !== 'accepted') {
    throw new Error(
      result.result === 'failed'
        ? result.error
        : `Recording stop was not accepted: ${result.result}`
    );
  }
}

async function pauseTransaction(transaction: TabNavigationTransaction): Promise<boolean> {
  try {
    const work: Promise<unknown>[] = [
      suspendTabNavigationPageEffects(transaction.effects, createEffectBinding(transaction)),
    ];
    if (transaction.shouldResume) {
      work.push(
        sendNavigationRecorderCommand(
          VideoMessageType.OFFSCREEN_PAUSE_RECORDING,
          transaction.binding
        )
      );
    }
    await Promise.all(work);
    return isCurrentNavigationBinding(transaction.binding);
  } catch (error) {
    const current = activeTransaction;
    if (current && current.binding.recordingId === transaction.binding.recordingId) {
      await stopCurrentTransaction(current, error);
    }
    return false;
  }
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
    pauseRecorder: true,
    pauseResult: Promise.resolve(false),
    pageAccessVerifier: null,
    reassertViewport,
    revalidateSource: true,
    shouldResume:
      previous?.shouldResume ??
      getVideoRecordingRuntimeState().status === VideoRecordingStatus.RECORDING,
  };
  activeTransaction = transaction;
  transaction.pauseResult = previous?.pauseResult ?? pauseTransaction(transaction);
  return transaction;
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
    if (!(await transaction.pauseResult) || !isCurrentTransaction(transaction)) return;
    const pageAccessVerifier = transaction.pageAccessVerifier;
    if (!pageAccessVerifier) throw new Error('Recording page access verifier is unavailable');
    if (transaction.reassertViewport) await reassertViewportSurface(transaction.binding);
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
    if (transaction.pauseRecorder && transaction.shouldResume) {
      await sendNavigationRecorderCommand(
        VideoMessageType.OFFSCREEN_RESUME_RECORDING,
        transaction.binding
      );
    }
    if (activeTransaction === transaction) activeTransaction = null;
  } catch (error) {
    await stopCurrentTransaction(transaction, error);
  }
}

function startCompletion(transaction: TabNavigationTransaction): void {
  if (transaction.completion) return;
  transaction.completion = restoreTransaction(transaction).catch((error) => {
    logger.error('Failed to stop tab recording after navigation failure', error);
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
  if (transaction) void stopCurrentTransaction(transaction, error);
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

import {
  ensureHttpUrl,
  fetchDebuggerTargets,
  rejectExtensionConflict,
  resolveTabInfo,
  selectPageTarget,
  sendDevtoolsConflictToast,
  waitForTabReady,
} from './targets';
import { attachToPageTarget } from './attach-request';
import {
  getExistingClientTarget,
  isFirstAttachedClient,
  registerAttachedClient,
  registerTabTargetId,
} from './index';
import type { DebuggerClient } from './index';
import { createLogger } from '@sniptale/platform/observability/logger';
import { consumeDebuggerActivationProof, type DebuggerActivationProof } from './activation';

const logger = createLogger({ namespace: 'BackgroundDebuggerAttachSession' });

export async function attachDebugger(
  tabId: number,
  client: DebuggerClient,
  activationProof: DebuggerActivationProof
): Promise<string> {
  logger.log('attachDebugger called', { client, tabId });
  consumeDebuggerActivationProof({ client, proof: activationProof, tabId });

  const firstClient = isFirstAttachedClient(tabId);
  const existingTarget = resolveExistingClientTarget(tabId, client);
  if (existingTarget) {
    return existingTarget;
  }

  const tab = await resolveTabInfo(tabId);
  await waitForTabReady(tabId, tab);
  ensureHttpUrl(tab);

  const { targets, tabTargets } = await fetchDebuggerTargets(tabId);
  await rejectExtensionConflict(firstClient, tabTargets);

  const pageTarget = selectPageTarget(tabId, targets, tabTargets);
  const targetId = pageTarget.id;
  if (!targetId) {
    throw new Error(`Debugger target is missing an id for tab ${tabId}`);
  }

  if (firstClient && !pageTarget.attached) {
    await attachToPageTarget(targetId);
  }

  registerAttachedClient(tabId, client);
  registerTabTargetId(tabId, targetId);

  return targetId;
}

export async function attachDebuggerSafe(
  tabId: number,
  client: DebuggerClient,
  activationProof: DebuggerActivationProof
): Promise<boolean> {
  try {
    await attachDebugger(tabId, client, activationProof);
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (
      errorMessage.includes('already attached') ||
      errorMessage.includes('Cannot attach') ||
      errorMessage.includes('DevTools') ||
      errorMessage.includes('Another client')
    ) {
      logger.warn('DevTools conflict detected', errorMessage);

      try {
        await sendDevtoolsConflictToast(tabId);
      } catch (sendError) {
        logger.warn('Failed to send toast notification', sendError);
      }

      return false;
    }

    throw error;
  }
}

function resolveExistingClientTarget(tabId: number, client: DebuggerClient): string | null {
  const targetId = getExistingClientTarget(tabId, client);
  if (!targetId) {
    return null;
  }

  logger.log('Client already attached to tab', { client, tabId });
  return targetId;
}

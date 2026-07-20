import { browserTabs } from '@sniptale/platform/browser/tabs';
import { browserWindows } from '@sniptale/platform/browser/windows';
import type {
  AISecretUnlockMessage,
  AISecretUnlockResponse,
} from '../../../contracts/messaging/ai-secret-unlock';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  loadSerializedAISecretProtectionStatus as loadAISecretProtectionStatus,
  mutateStoredAISettings,
} from '../../../composition/persistence/ai-settings/graph-mutations';
import type { StoredAISecretUnlockRequest } from '../../../composition/persistence/ai-settings/secret-unlock-requests.store.ts';
import type { BackgroundOwnedRouteContext } from '../../routing-contracts/owned-route-context';
import { resolveLlmSessionSenderKey } from '../llm/session-tokens';
import {
  authorizeAISecretUnlockSenderForState,
  buildUnlockUrl,
} from './authorization/secret-unlock';
import {
  createCompletedRestartRequiredResponse,
  createNonPendingUnlockResponse,
  createSubmittedUnlockStatusResponse,
  createTerminalUnlockStatusResponse,
  createUnauthorizedUnlockResponse,
} from './secret-unlock-route-responses';
import { hasExplicitAiSecretUnlockContext } from './secret-unlock-route-context';
import { isUnlockRequestOwner } from './secret-unlock-route-owner';
import {
  readUnlockRequest,
  reconcileUnlockRequests,
  transitionUnlockRequestFromStatuses,
  writeUnlockRequest,
} from './secret-unlock-route-state';
import { submitUnlockRequest } from './secret-unlock-route-submit';
import { createPrivilegedSyncMemoryDomain } from '../../routing-contracts/capabilities/privileged-authority/state';

const logger = createLogger({ namespace: 'BackgroundAiSecretUnlockRoute' });
const AI_SECRET_UNLOCK_TTL_MS = 5 * 60 * 1000;
const CANCELABLE_UNLOCK_STATUSES = new Set(['pending'] as const);

const unlockRequests = createPrivilegedSyncMemoryDomain<StoredAISecretUnlockRequest>(
  'background.privileged.ai-secret-unlock-requests'
);

function isAISecretUnlockMessage(message: unknown): message is AISecretUnlockMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    message.type === MessageType.AI_SECRET_UNLOCK
  );
}

function createUnlockRequestId(): string {
  return globalThis.crypto.randomUUID();
}

async function openUnlockWindow(requestId: string): Promise<void> {
  const url = buildUnlockUrl(requestId);
  try {
    await browserWindows.create({
      focused: true,
      height: 420,
      type: 'popup',
      url,
      width: 440,
    });
  } catch {
    await browserTabs.create({ url });
  }
}

function resolveUnlockRecord(requestId: string): StoredAISecretUnlockRequest | null {
  return unlockRequests.get(requestId) ?? null;
}

export function authorizeAISecretUnlockSender(
  message: AISecretUnlockMessage,
  sender: chrome.runtime.MessageSender
): string | null {
  return authorizeAISecretUnlockSenderForState({
    message,
    record:
      message.operation === 'status'
        ? (resolveUnlockRecord(message.requestId) ?? undefined)
        : undefined,
    sender,
  });
}

async function startUnlockRequest(
  message: Extract<AISecretUnlockMessage, { operation: 'start' }>,
  sender: chrome.runtime.MessageSender
): Promise<AISecretUnlockResponse> {
  await reconcileUnlockRequests(unlockRequests);
  const senderKey = resolveLlmSessionSenderKey(message.purpose, sender) ?? '';

  const protectionStatus = await loadAISecretProtectionStatus();
  if (!protectionStatus.isEnabled || protectionStatus.isUnlocked) {
    return { success: true, status: 'completed' };
  }

  const now = Date.now();
  const requestId = createUnlockRequestId();
  await writeUnlockRequest(unlockRequests, {
    createdAt: now,
    expiresAt: now + AI_SECRET_UNLOCK_TTL_MS,
    operation: 'ai-secret-unlock',
    ...(sender.documentId ? { ownerDocumentId: sender.documentId } : {}),
    ...(sender.url ? { ownerUrl: sender.url } : {}),
    purpose: message.purpose,
    requestId,
    senderKey,
    status: 'pending',
  });
  await openUnlockWindow(requestId);
  return { success: true, requestId, reason: 'ai-secrets-locked', status: 'pending' };
}

async function cancelUnlockRequest(
  message: Extract<AISecretUnlockMessage, { operation: 'cancel' }>,
  _sender: chrome.runtime.MessageSender
): Promise<AISecretUnlockResponse> {
  const transition = await transitionUnlockRequestFromStatuses(unlockRequests, {
    createNext: (current) => ({
      ...current,
      status: 'failed',
      terminalFailureReason: 'AI secret unlock request cancelled',
    }),
    requestId: message.requestId,
    requireStatuses: CANCELABLE_UNLOCK_STATUSES,
  });
  if (!transition.transitioned) {
    if (!transition.record) {
      return { success: true, requestId: message.requestId, status: 'failed' };
    }
    return createNonPendingUnlockResponse(transition.record, message.requestId);
  }

  return { success: true, requestId: message.requestId, status: 'failed' };
}

async function readUnlockRequestStatus(
  message: Extract<AISecretUnlockMessage, { operation: 'status' }>,
  sender: chrome.runtime.MessageSender
): Promise<AISecretUnlockResponse> {
  const record = await readUnlockRequest(unlockRequests, message.requestId);

  if (!record) {
    return { success: false, requestId: message.requestId, status: 'failed' };
  }
  if (!isUnlockRequestOwner(record, sender)) {
    return {
      success: false,
      requestId: message.requestId,
      status: 'failed',
      error: 'Unauthorized AI secret unlock status reader',
    };
  }
  if (record.status === 'completed') {
    const protectionStatus = await loadAISecretProtectionStatus();
    if (protectionStatus.isEnabled && !protectionStatus.isUnlocked) {
      return createCompletedRestartRequiredResponse(message.requestId);
    }
  }
  if (record.status === 'submitted') {
    const protectionStatus = await loadAISecretProtectionStatus();
    return createSubmittedUnlockStatusResponse({
      isProtectionEnabled: protectionStatus.isEnabled,
      isProtectionUnlocked: protectionStatus.isUnlocked,
      requestId: message.requestId,
    });
  }
  if (record.status === 'expired' || record.status === 'failed') {
    return createTerminalUnlockStatusResponse(record);
  }

  return { success: true, requestId: message.requestId, status: record.status };
}

function runAISecretUnlockMessage(
  message: AISecretUnlockMessage,
  sender: chrome.runtime.MessageSender
): Promise<AISecretUnlockResponse> {
  switch (message.operation) {
    case 'start':
      return startUnlockRequest(message, sender);
    case 'submit':
      return submitUnlockRequest({
        message,
        unlockAISecretProtection: (passphrase) =>
          mutateStoredAISettings({ operation: 'unlock-secret-passphrase-protection', passphrase }),
        unlockRequests,
      });
    case 'status':
      return readUnlockRequestStatus(message, sender);
    case 'cancel':
      return cancelUnlockRequest(message, sender);
  }
}

export function routeAISecretUnlockMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: ResponseSender<AISecretUnlockResponse>,
  routeContext?: BackgroundOwnedRouteContext | null
): boolean {
  if (!isAISecretUnlockMessage(message)) {
    return false;
  }

  if (!hasExplicitAiSecretUnlockContext(message, routeContext)) {
    sendResponse(createUnauthorizedUnlockResponse(message));
    return true;
  }

  runAISecretUnlockMessage(message, sender).then(sendResponse, (error) => {
    logger.error('AI secret unlock route failed', error);
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : 'AI secret unlock failed',
    });
  });
  return true;
}

export function resetAISecretUnlockRequestsForTests(): void {
  unlockRequests.clear();
}

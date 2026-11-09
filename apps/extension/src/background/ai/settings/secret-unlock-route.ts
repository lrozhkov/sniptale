import type { AISecretProtectionStatusPayload } from '../../../contracts/messaging/ai-settings-runtime';
import { loadSyncConnection } from '../../../composition/persistence/remote-connection/store';
import {
  sameSyncConnectionIdentity,
  type SyncConnectionMetadata,
  type SyncConnectionScope,
} from '../../../composition/persistence/remote-connection/model';
import type { SecretProtectionService } from '../../../composition/persistence/secret-protection/model';
import { browserTabs } from '@sniptale/platform/browser/tabs';
import { browserWindows } from '@sniptale/platform/browser/windows';
import type {
  AISecretUnlockMessage,
  AISecretUnlockPurpose,
  SyncUnlockIntent,
  AISecretUnlockResponse,
} from '../../../contracts/messaging/ai-secret-unlock';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  loadSerializedAISecretProtectionStatus as loadAISecretProtectionStatus,
  mutateStoredAISettings,
} from '../../../composition/persistence/ai-settings/graph-mutations';
import type { StoredAISecretUnlockRequest } from '../../../composition/persistence/secret-protection/secret-unlock-requests.store.ts';
import type { BackgroundOwnedRouteContext } from '../../routing-contracts/owned-route-context';
import {
  authorizeAISecretUnlockSenderForState,
  resolveSecretUnlockSenderKey,
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

function participates(
  status: AISecretProtectionStatusPayload,
  purpose: AISecretUnlockPurpose
): boolean {
  return status.participants
    ? purpose === 'sync'
      ? status.participants.webdav
      : status.participants.ai
    : status.isEnabled;
}

export interface AISecretUnlockSyncPort {
  continueSyncIntent(intent: SyncUnlockIntent & { scope: SyncConnectionScope }): Promise<void>;
}

/** Check the exact live native target around the asynchronous permission query. */
async function currentSyncIntent(intent: SyncUnlockIntent): Promise<SyncConnectionMetadata | null> {
  const matches = (connection: Awaited<ReturnType<typeof loadSyncConnection>>) =>
    Boolean(
      connection &&
      connection.phase === 'active' &&
      sameSyncConnectionIdentity(connection.identity, intent.authorization) &&
      connection.credentialId === intent.credentialId &&
      (connection.workspace?.fingerprint ?? null) === intent.workspaceFingerprint
    );
  const before = await loadSyncConnection();
  if (!matches(before) || !before) return null;
  if (
    !(await chrome.permissions.contains({
      origins: [`${new URL(before.binding.rootUrl).origin}/*`],
    }))
  )
    return null;
  const after = await loadSyncConnection();
  return matches(after) && JSON.stringify(before) === JSON.stringify(after) ? after : null;
}

class SyncIntentConsumed extends Error {}
async function consumeSyncIntent(
  requestId: string,
  protection: SecretProtectionService,
  sync: AISecretUnlockSyncPort
): Promise<void> {
  const record = await readUnlockRequest(unlockRequests, requestId);
  if (
    !record ||
    record.purpose !== 'sync' ||
    !record.syncIntent ||
    record.syncConsumed ||
    record.status !== 'completed' ||
    record.expiresAt <= Date.now()
  )
    return;
  await protection.readKey('webdav');
  if (!(await currentSyncIntent(record.syncIntent))) return;
  let consumed: Awaited<ReturnType<typeof transitionUnlockRequestFromStatuses>>;
  try {
    consumed = await transitionUnlockRequestFromStatuses(unlockRequests, {
      requestId,
      requireStatuses: new Set(['completed']),
      createNext: (current) => {
        if (
          current.purpose !== 'sync' ||
          current.syncConsumed ||
          JSON.stringify(current.syncIntent) !== JSON.stringify(record.syncIntent) ||
          current.expiresAt <= Date.now()
        )
          throw new SyncIntentConsumed();
        return { ...current, syncConsumed: true };
      },
    });
  } catch (error) {
    if (error instanceof SyncIntentConsumed) return;
    throw error;
  }
  if (!consumed.transitioned) return;
  const selected = await currentSyncIntent(record.syncIntent);
  if (!selected) return;
  await protection.readKey('webdav');
  await sync.continueSyncIntent({
    ...record.syncIntent,
    scope: {
      spaceId: selected.binding.spaceId,
      connectionGeneration: selected.binding.connectionGeneration,
      profileCreatedAt: selected.binding.profileCreatedAt,
    },
  });
}

async function startUnlockRequest(
  message: Extract<AISecretUnlockMessage, { operation: 'start' }>,
  sender: chrome.runtime.MessageSender,
  protection?: SecretProtectionService,
  sync?: AISecretUnlockSyncPort
): Promise<AISecretUnlockResponse> {
  await reconcileUnlockRequests(unlockRequests);
  const senderKey = resolveSecretUnlockSenderKey(message.purpose, sender) ?? '';
  if (!senderKey)
    return { success: false, status: 'failed', error: 'Unauthorized secret unlock owner' };
  let syncIntent: SyncUnlockIntent | undefined;
  if (message.purpose === 'sync') {
    if (!protection || !sync)
      return { success: false, status: 'failed', error: 'Sync unlock selection refused' };
    const connection = await loadSyncConnection();
    if (!connection || connection.phase !== 'active' || !connection.credentialId)
      return { success: false, status: 'failed', error: 'Sync unlock selection refused' };
    syncIntent = {
      authorization: connection.identity,
      credentialId: connection.credentialId,
      workspaceFingerprint: connection.workspace?.fingerprint ?? null,
    };
    if (!(await currentSyncIntent(syncIntent)))
      return { success: false, status: 'failed', error: 'Sync unlock selection refused' };
  }

  const protectionStatus = protection
    ? await protection.readStatus()
    : await loadAISecretProtectionStatus();
  if (
    message.purpose !== 'sync' &&
    (!participates(protectionStatus, message.purpose) || protectionStatus.isUnlocked)
  ) {
    return { success: true, status: 'completed' };
  }

  if (syncIntent && !(await currentSyncIntent(syncIntent)))
    return { success: false, status: 'failed', error: 'Sync unlock selection refused' };

  const now = Date.now();
  const requestId = createUnlockRequestId();
  await writeUnlockRequest(unlockRequests, {
    createdAt: now,
    expiresAt: now + AI_SECRET_UNLOCK_TTL_MS,
    operation: 'ai-secret-unlock',
    ...(sender.documentId ? { ownerDocumentId: sender.documentId } : {}),
    ...(sender.url ? { ownerUrl: sender.url } : {}),
    purpose: message.purpose,
    ...(syncIntent ? { syncIntent: structuredClone(syncIntent), syncConsumed: false } : {}),
    requestId,
    senderKey,
    status:
      message.purpose === 'sync' &&
      (!participates(protectionStatus, message.purpose) || protectionStatus.isUnlocked)
        ? 'completed'
        : 'pending',
  });
  if (
    message.purpose === 'sync' &&
    protection &&
    sync &&
    (!participates(protectionStatus, message.purpose) || protectionStatus.isUnlocked)
  ) {
    await consumeSyncIntent(requestId, protection, sync);
    return { success: true, requestId, status: 'completed' };
  }
  await openUnlockWindow(requestId);
  return { success: true, requestId, reason: 'ai-secrets-locked', status: 'pending' };
}

async function cancelUnlockRequest(
  message: Extract<AISecretUnlockMessage, { operation: 'cancel' }>,
  _sender: chrome.runtime.MessageSender,
  protection?: SecretProtectionService
): Promise<AISecretUnlockResponse> {
  const transition = await transitionUnlockRequestFromStatuses(unlockRequests, {
    createNext: (current) => ({
      ...current,
      status: 'failed',
      terminalFailureReason: 'AI secret unlock request cancelled',
    }),
    requestId: message.requestId,
    requireStatuses: protection ? new Set(['pending', 'submitted']) : CANCELABLE_UNLOCK_STATUSES,
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
  sender: chrome.runtime.MessageSender,
  protection?: SecretProtectionService
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
    const protectionStatus = protection
      ? await protection.readStatus()
      : await loadAISecretProtectionStatus();
    if (participates(protectionStatus, record.purpose) && !protectionStatus.isUnlocked) {
      return createCompletedRestartRequiredResponse(message.requestId);
    }
  }
  if (record.status === 'submitted') {
    const protectionStatus = protection
      ? await protection.readStatus()
      : await loadAISecretProtectionStatus();
    return createSubmittedUnlockStatusResponse({
      isProtectionEnabled: participates(protectionStatus, record.purpose),
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
  sender: chrome.runtime.MessageSender,
  protection?: SecretProtectionService,
  sync?: AISecretUnlockSyncPort
): Promise<AISecretUnlockResponse> {
  switch (message.operation) {
    case 'start':
      return startUnlockRequest(message, sender, protection, sync);
    case 'submit':
      return submitUnlockRequest({
        message,
        unlockAISecretProtection: (passphrase) =>
          protection
            ? protection.unlock(passphrase, async () => {
                const current = await readUnlockRequest(unlockRequests, message.requestId);
                return Boolean(
                  current &&
                  current.status === 'submitted' &&
                  current.expiresAt > Date.now() &&
                  (current.purpose !== 'sync' ||
                    (sync && current.syncIntent && (await currentSyncIntent(current.syncIntent))))
                );
              })
            : mutateStoredAISettings({
                operation: 'unlock-secret-passphrase-protection',
                passphrase,
              }),
        unlockRequests,
      }).then(async (response) => {
        if (response.success && response.status === 'completed' && protection && sync)
          await consumeSyncIntent(message.requestId, protection, sync);
        return response;
      });
    case 'status':
      return readUnlockRequestStatus(message, sender, protection);
    case 'cancel':
      return cancelUnlockRequest(message, sender, protection);
  }
}

export function routeAISecretUnlockMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: ResponseSender<AISecretUnlockResponse>,
  routeContext?: BackgroundOwnedRouteContext | null,
  protection?: SecretProtectionService,
  sync?: AISecretUnlockSyncPort
): boolean {
  if (!isAISecretUnlockMessage(message)) {
    return false;
  }

  if (!hasExplicitAiSecretUnlockContext(message, routeContext)) {
    sendResponse(createUnauthorizedUnlockResponse(message));
    return true;
  }

  runAISecretUnlockMessage(message, sender, protection, sync).then(sendResponse, (error) => {
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

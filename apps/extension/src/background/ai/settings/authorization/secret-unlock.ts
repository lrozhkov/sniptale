import { isCanonicalPopupSenderUrl } from '../../../../platform/navigation/extension-pages/sender-url';
import { runtimeInfo } from '@sniptale/platform/browser/runtime';
import type {
  AISecretUnlockMessage,
  AISecretUnlockPurpose,
} from '../../../../contracts/messaging/ai-secret-unlock';
import { resolveLlmSessionSenderKey } from '../../llm/session-tokens';

const AI_SECRET_UNLOCK_PAGE_PATH = 'apps/extension/src/settings/index.html';

type UnlockAuthorizationRecord = {
  senderKey: string;
};

function resolveTrustedUnlockPageRequestId(sender: chrome.runtime.MessageSender): string | null {
  if (!sender.url) {
    return null;
  }

  try {
    const expectedUrl = new URL(runtimeInfo.getURL(AI_SECRET_UNLOCK_PAGE_PATH));
    const actualUrl = new URL(sender.url);
    if (
      expectedUrl.origin !== actualUrl.origin ||
      expectedUrl.pathname !== actualUrl.pathname ||
      actualUrl.searchParams.get('aiUnlock') !== '1'
    ) {
      return null;
    }

    return actualUrl.searchParams.get('requestId');
  } catch {
    return null;
  }
}

function isTrustedUnlockPageSender(
  sender: chrome.runtime.MessageSender,
  requestId: string
): boolean {
  return resolveTrustedUnlockPageRequestId(sender) === requestId;
}

/** A popup document may own only its explicit sync unlock request. */
export function resolveSecretUnlockSenderKey(
  purpose: AISecretUnlockPurpose,
  sender: chrome.runtime.MessageSender
): string | null {
  if (purpose !== 'sync') return resolveLlmSessionSenderKey(purpose, sender);
  const extensionId = globalThis.chrome?.runtime?.id;
  if (
    !extensionId ||
    sender.id !== extensionId ||
    sender.tab ||
    (sender.documentId !== undefined &&
      (typeof sender.documentId !== 'string' || sender.documentId.length === 0)) ||
    (sender.frameId !== undefined && sender.frameId !== 0) ||
    (sender.documentLifecycle !== undefined && sender.documentLifecycle !== 'active') ||
    !isCanonicalPopupSenderUrl(sender.url)
  )
    return null;
  // Chrome action popups can omit documentId; status then belongs to the canonical popup principal.
  return sender.documentId
    ? `sync:popup:document:${sender.documentId}`
    : `sync:popup:extension:${extensionId}`;
}

function isUnlockStatusOwner(
  record: UnlockAuthorizationRecord | undefined,
  sender: chrome.runtime.MessageSender
): boolean {
  if (!record) {
    return false;
  }
  const contentSenderKey = resolveLlmSessionSenderKey('content-ai-pick', sender);
  const scenarioSenderKey = resolveLlmSessionSenderKey('scenario-editor', sender);
  const reviewSenderKey = resolveLlmSessionSenderKey('review-text', sender);
  return (
    record.senderKey === contentSenderKey ||
    record.senderKey === scenarioSenderKey ||
    record.senderKey === reviewSenderKey ||
    record.senderKey === resolveSecretUnlockSenderKey('sync', sender)
  );
}

function isPotentialUnlockStatusOwner(sender: chrome.runtime.MessageSender): boolean {
  return (
    resolveLlmSessionSenderKey('content-ai-pick', sender) !== null ||
    resolveLlmSessionSenderKey('scenario-editor', sender) !== null ||
    resolveLlmSessionSenderKey('review-text', sender) !== null ||
    resolveSecretUnlockSenderKey('sync', sender) !== null
  );
}

export function authorizeAISecretUnlockSenderForState(args: {
  message: AISecretUnlockMessage;
  record?: UnlockAuthorizationRecord | undefined;
  sender: chrome.runtime.MessageSender;
}): string | null {
  const { message, sender } = args;
  if (message.operation === 'start') {
    return resolveSecretUnlockSenderKey(message.purpose, sender)
      ? null
      : 'Unauthorized AI secret unlock sender';
  }
  if (message.operation === 'submit') {
    return isTrustedUnlockPageSender(sender, message.requestId)
      ? null
      : 'Unauthorized AI secret unlock submitter';
  }
  if (message.operation === 'cancel') {
    return isTrustedUnlockPageSender(sender, message.requestId)
      ? null
      : 'Unauthorized AI secret unlock canceller';
  }
  return (
    args.record ? isUnlockStatusOwner(args.record, sender) : isPotentialUnlockStatusOwner(sender)
  )
    ? null
    : 'Unauthorized AI secret unlock status reader';
}

export function buildUnlockUrl(requestId: string): string {
  const url = new URL(runtimeInfo.getURL(AI_SECRET_UNLOCK_PAGE_PATH));
  url.searchParams.set('aiUnlock', '1');
  url.searchParams.set('requestId', requestId);
  return url.toString();
}

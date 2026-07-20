import type {
  ContentPrivilegedActionActivationKey,
  ContentPrivilegedActionActivationProof,
  ContentPrivilegedActionActivationPurpose,
  ContentPrivilegedActionType,
} from '@sniptale/runtime-contracts/protocol/content-privileged-action';
import {
  CaptureMessageType,
  MessageType,
} from '@sniptale/runtime-contracts/messaging/message-types';
import type { ContentSenderBinding } from './capability-store';
import { createPrivilegedCapabilityStore } from '../privileged-authority/state';
import { requirePolicyStateTtlMs } from '../policy/ttl';

type ContentPrivilegedActionActivationRecord = ContentSenderBinding & {
  actionTypes: readonly ContentPrivilegedActionType[];
  bindingKey: string;
  expiresAtEpochMs: number;
  purpose: ContentPrivilegedActionActivationPurpose;
  secret: string;
};

type ContentPrivilegedActionActivationIssueResult =
  | { activationKey: ContentPrivilegedActionActivationKey; status: 'issued' }
  | { status: 'already-claimed' }
  | { status: 'rate-limited' };

type ContentPrivilegedActionActivationIssueHistoryRecord = {
  issueTimes: number[];
};

const CONTENT_ACTION_ACTIVATION_KEYS_POLICY_ID = 'content-action-activation-keys';
const CONTENT_PRIVILEGED_ACTION_ACTIVATION_ISSUE_RATE_WINDOW_MS = 5 * 60_000;
const CONTENT_PRIVILEGED_ACTION_ACTIVATION_MAX_ISSUES_PER_WINDOW = 6;

const contentPrivilegedActionActivationKeys =
  createPrivilegedCapabilityStore<ContentPrivilegedActionActivationRecord>({
    domain: 'background.privileged.content-action-activation-keys',
    policyId: CONTENT_ACTION_ACTIVATION_KEYS_POLICY_ID,
    storageClass: 'memory-only',
  });
const contentPrivilegedActionActivationIssueHistory =
  createPrivilegedCapabilityStore<ContentPrivilegedActionActivationIssueHistoryRecord>({
    domain: 'background.privileged.content-action-activation-issue-history',
    policyId: CONTENT_ACTION_ACTIVATION_KEYS_POLICY_ID,
    storageClass: 'memory-only',
  });

function createActivationSecret(): string {
  return crypto.randomUUID();
}

function getPurposeActionTypes(
  purpose: ContentPrivilegedActionActivationPurpose
): readonly ContentPrivilegedActionType[] {
  if (purpose === 'recording-download') {
    return [
      MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK,
      MessageType.SAVE_RECORDING_FOR_DOWNLOAD,
      MessageType.RELEASE_RECORDING_DOWNLOAD,
    ];
  }

  return [
    CaptureMessageType.CAPTURE_VISIBLE,
    CaptureMessageType.CAPTURE_FULL,
    CaptureMessageType.CAPTURE_VISIBLE_FOR_CROP,
    MessageType.EXPORT_CAPTURE_FULL_PAGE,
    MessageType.EXECUTE_SAVE,
    MessageType.OPEN_EDITOR_WITH_IMAGE,
    MessageType.SAVE_SCREENSHOT_TO_GALLERY,
    MessageType.TRIGGER_QUICK_ACTION,
  ];
}

function getSenderBindingKey(
  senderBinding: ContentSenderBinding,
  purpose: ContentPrivilegedActionActivationPurpose
): string {
  return [
    purpose,
    senderBinding.tabId,
    senderBinding.frameId,
    senderBinding.documentId,
    senderBinding.senderUrl,
  ].join('\n');
}

function pruneExpiredActivationKeys(nowEpochMs = Date.now()): void {
  for (const [keyId, record] of contentPrivilegedActionActivationKeys.entries()) {
    if (record.expiresAtEpochMs <= nowEpochMs) {
      contentPrivilegedActionActivationKeys.delete(keyId);
    }
  }
}

function pruneActivationIssueTimes(nowEpochMs: number): void {
  const cutoffEpochMs = nowEpochMs - CONTENT_PRIVILEGED_ACTION_ACTIVATION_ISSUE_RATE_WINDOW_MS;
  for (const [bindingKey, record] of contentPrivilegedActionActivationIssueHistory.entries()) {
    const retainedIssueTimes = record.issueTimes.filter(
      (issuedAtEpochMs) => issuedAtEpochMs > cutoffEpochMs
    );
    if (retainedIssueTimes.length === 0) {
      contentPrivilegedActionActivationIssueHistory.delete(bindingKey);
    } else {
      contentPrivilegedActionActivationIssueHistory.set(bindingKey, {
        issueTimes: retainedIssueTimes,
      });
    }
  }
}

function canIssueActivationKeyForBinding(bindingKey: string, nowEpochMs: number): boolean {
  pruneActivationIssueTimes(nowEpochMs);
  const retainedIssueTimes =
    contentPrivilegedActionActivationIssueHistory.get(bindingKey)?.issueTimes ?? [];
  if (retainedIssueTimes.length >= CONTENT_PRIVILEGED_ACTION_ACTIVATION_MAX_ISSUES_PER_WINDOW) {
    return false;
  }

  contentPrivilegedActionActivationIssueHistory.set(bindingKey, {
    issueTimes: [...retainedIssueTimes, nowEpochMs],
  });
  return true;
}

function hasActiveActivationKeyForBinding(bindingKey: string): boolean {
  for (const record of contentPrivilegedActionActivationKeys.entries()) {
    if (record[1].bindingKey === bindingKey) {
      return true;
    }
  }
  return false;
}

export function issueContentPrivilegedActionActivationKey(
  senderBinding: ContentSenderBinding,
  purpose: ContentPrivilegedActionActivationPurpose
): ContentPrivilegedActionActivationIssueResult {
  const nowEpochMs = Date.now();
  pruneExpiredActivationKeys(nowEpochMs);
  const senderBindingKey = getSenderBindingKey(senderBinding, purpose);
  if (hasActiveActivationKeyForBinding(senderBindingKey)) {
    return { status: 'already-claimed' };
  }
  if (!canIssueActivationKeyForBinding(senderBindingKey, nowEpochMs)) {
    return { status: 'rate-limited' };
  }

  const keyId = createActivationSecret();
  const secret = createActivationSecret();
  const expiresAtEpochMs =
    nowEpochMs + requirePolicyStateTtlMs(CONTENT_ACTION_ACTIVATION_KEYS_POLICY_ID);
  contentPrivilegedActionActivationKeys.set(keyId, {
    ...senderBinding,
    actionTypes: getPurposeActionTypes(purpose),
    bindingKey: senderBindingKey,
    expiresAtEpochMs,
    purpose,
    secret,
  });
  return { activationKey: { expiresAtEpochMs, keyId, secret }, status: 'issued' };
}

export function consumeContentPrivilegedActionActivationProof(args: {
  actionType: ContentPrivilegedActionType;
  proof: ContentPrivilegedActionActivationProof;
  senderBinding: ContentSenderBinding;
}): boolean {
  pruneExpiredActivationKeys();
  const record = contentPrivilegedActionActivationKeys.get(args.proof.keyId);
  const authorized =
    record?.secret === args.proof.secret &&
    record.expiresAtEpochMs === args.proof.expiresAtEpochMs &&
    record.expiresAtEpochMs > Date.now() &&
    record.actionTypes.includes(args.actionType) &&
    record.documentId === args.senderBinding.documentId &&
    record.frameId === args.senderBinding.frameId &&
    record.senderUrl === args.senderBinding.senderUrl &&
    record.tabId === args.senderBinding.tabId;
  if (authorized) {
    contentPrivilegedActionActivationKeys.delete(args.proof.keyId);
  }
  return authorized;
}

export function resetContentPrivilegedActionActivationKeysForTests(): void {
  contentPrivilegedActionActivationKeys.clear();
  contentPrivilegedActionActivationIssueHistory.clear();
}

export function getContentPrivilegedActionActivationIssueHistorySizeForTests(): number {
  return [...contentPrivilegedActionActivationIssueHistory.entries()].length;
}

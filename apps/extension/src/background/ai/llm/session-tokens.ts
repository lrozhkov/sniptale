import { runtimeInfo } from '@sniptale/platform/browser/runtime';
import type { LlmSessionPurpose } from '../../../contracts/messaging/llm';
import {
  createAiEgressAuthorityKey,
  type AiEgressAuthority,
} from '../../../features/ai/egress-authority';
import {
  resolveCapabilityOrigin,
  type CapabilityScope,
} from '@sniptale/platform/security/capability-context';
import { createPrivilegedCapabilityStore } from '../../routing-contracts/capabilities/privileged-authority/state';
import {
  issuePolicyCapability,
  pruneExpiredPolicyCapabilities,
  type PolicyCapabilityRecord,
} from '../../routing-contracts/capabilities/policy/capability-store';
import { consumeOneShotPolicyCapability } from '../../routing-contracts/capabilities/policy/one-shot';
import type { PolicySenderBinding } from '../../routing-contracts/capabilities/policy/sender-binding';

const LLM_SESSION_POLICY_ID = 'llm-session-tokens';
const SCENARIO_EDITOR_PATH = 'apps/extension/src/scenario-editor/index.html';

type LlmSessionPayload = {
  egressAuthorityKey: string;
  purpose: LlmSessionPurpose;
  senderKey: string;
};

const llmSessionTokens = createPrivilegedCapabilityStore<PolicyCapabilityRecord<LlmSessionPayload>>(
  {
    domain: 'background.privileged.llm-session-tokens',
    policyId: LLM_SESSION_POLICY_ID,
    storageClass: 'memory-only',
  }
);

function createToken(): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) {
    return randomUuid;
  }

  const randomBytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(randomBytes);
  return `llm-${Array.from(randomBytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function pruneExpiredTokens(now = Date.now()): void {
  pruneExpiredPolicyCapabilities({ nowEpochMs: now, store: llmSessionTokens });
}

function getSenderUrlOriginAndPath(
  url: string | undefined
): { origin: string; path: string } | null {
  if (!url) {
    return null;
  }

  try {
    const parsedUrl = new URL(url);
    return {
      origin: parsedUrl.origin,
      path: parsedUrl.pathname.replace(/^\//, ''),
    };
  } catch {
    return null;
  }
}

function resolveContentAiPickSenderKey(sender: chrome.runtime.MessageSender): string | null {
  if (typeof sender.tab?.id !== 'number') {
    return null;
  }

  const frameId = sender.frameId ?? -1;
  const documentId = sender.documentId ?? 'unknown-document';
  return `tab:${sender.tab.id}:frame:${frameId}:document:${documentId}`;
}

function resolveScenarioEditorSenderKey(sender: chrome.runtime.MessageSender): string | null {
  const expected = getSenderUrlOriginAndPath(runtimeInfo.getURL(SCENARIO_EDITOR_PATH));
  const actual = getSenderUrlOriginAndPath(sender.url);
  if (
    !expected ||
    !actual ||
    actual.origin !== expected.origin ||
    actual.path !== expected.path ||
    !sender.documentId
  ) {
    return null;
  }

  return `scenario-editor:document:${sender.documentId}`;
}

export function resolveLlmSessionSenderKey(
  purpose: LlmSessionPurpose,
  sender: chrome.runtime.MessageSender
): string | null {
  return purpose === 'content-ai-pick'
    ? resolveContentAiPickSenderKey(sender)
    : resolveScenarioEditorSenderKey(sender);
}

function resolveLlmSessionScope(purpose: LlmSessionPurpose): CapabilityScope {
  return purpose === 'content-ai-pick' ? 'llm:content-ai-pick' : 'llm:scenario-editor';
}

function createLlmSessionSenderBinding(args: {
  purpose: LlmSessionPurpose;
  sender: chrome.runtime.MessageSender;
}): PolicySenderBinding | null {
  const senderKey = resolveLlmSessionSenderKey(args.purpose, args.sender);
  if (!senderKey) {
    return null;
  }

  return {
    documentId: args.sender.documentId ?? 'unknown-document',
    frameId: args.sender.frameId ?? -1,
    origin: resolveCapabilityOrigin(args.sender.url),
    tabId: args.sender.tab?.id,
  };
}

export function issueLlmSessionToken(args: {
  egressAuthority: AiEgressAuthority;
  purpose: LlmSessionPurpose;
  sender: chrome.runtime.MessageSender;
}): string | null {
  pruneExpiredTokens();
  const senderKey = resolveLlmSessionSenderKey(args.purpose, args.sender);
  const senderBinding = createLlmSessionSenderBinding(args);
  if (!senderKey || !senderBinding) {
    return null;
  }

  return issuePolicyCapability({
    payload: {
      egressAuthorityKey: createAiEgressAuthorityKey(args.egressAuthority),
      purpose: args.purpose,
      senderKey,
    },
    policyStateId: LLM_SESSION_POLICY_ID,
    scopes: [resolveLlmSessionScope(args.purpose)],
    senderBinding,
    store: llmSessionTokens,
    tokenFactory: createToken,
  });
}

export function consumeLlmSessionToken(args: {
  egressAuthority: AiEgressAuthority;
  purpose: LlmSessionPurpose;
  sender: chrome.runtime.MessageSender;
  token: string;
}): boolean {
  pruneExpiredTokens();
  const senderKey = resolveLlmSessionSenderKey(args.purpose, args.sender);
  const senderBinding = createLlmSessionSenderBinding(args);
  if (!senderKey || !senderBinding) {
    llmSessionTokens.delete(args.token);
    return false;
  }

  const result = consumeOneShotPolicyCapability({
    policyStateId: LLM_SESSION_POLICY_ID,
    scope: resolveLlmSessionScope(args.purpose),
    senderBinding,
    store: llmSessionTokens,
    strategy: 'delete-before-validation',
    token: args.token,
    validateRecord: ({ payload }) =>
      payload.egressAuthorityKey === createAiEgressAuthorityKey(args.egressAuthority) &&
      payload.purpose === args.purpose &&
      payload.senderKey === senderKey,
  });
  return result.consumed;
}

export function resetLlmSessionTokensForTests(): void {
  llmSessionTokens.clear();
}

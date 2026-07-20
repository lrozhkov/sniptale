import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createContentAiEgressAuthority } from '../../../../features/ai/egress-authority';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createAiPrivacyProof } from '../../../../features/ai/privacy';
import { issueLlmSessionToken, resetLlmSessionTokensForTests } from '../session-tokens';
import { authorizeContentLlmRoute } from './egress';

const CONTENT_URL = 'https://example.test/page';

function sender(): chrome.runtime.MessageSender {
  return {
    documentId: 'document-7',
    frameId: 0,
    tab: { id: 7 } as chrome.tabs.Tab,
    url: CONTENT_URL,
  };
}

function createProof(payload: { jsonData?: string; markdownData?: string }) {
  return createAiPrivacyProof({
    captureMode: 'selected_editable',
    payload,
    riskClass: 'safe_text',
    userInitiatedAiExtraction: true,
  });
}

function authorizeIPCMessage(args: {
  kind: 'background-owned';
  message: { type: string } & Record<string, unknown>;
  sender: chrome.runtime.MessageSender;
}) {
  return authorizeContentLlmRoute(args);
}

function stubCryptoRandomUuid(): void {
  const originalCrypto = globalThis.crypto;
  vi.stubGlobal('crypto', {
    get subtle() {
      return originalCrypto.subtle;
    },
    randomUUID: () => 'token-1',
  });
}

beforeEach(() => {
  resetLlmSessionTokensForTests();
  stubCryptoRandomUuid();
});

afterEach(() => {
  resetLlmSessionTokensForTests();
  vi.unstubAllGlobals();
});

it('rejects content LLM messages without a privacy proof before token consumption', async () => {
  const llmSender = sender();

  await expect(
    authorizeIPCMessage({
      kind: 'background-owned',
      message: {
        jsonData: '{"fields":[]}',
        llmSessionToken: 'token-1',
        prompt: 'Normalize selected nodes',
        type: MessageType.PROCESS_WITH_LLM,
      },
      sender: llmSender,
    })
  ).resolves.toEqual({ authorized: false, reason: 'Missing AI privacy proof' });
});

it('rejects content LLM messages whose privacy proof is bound to another payload', async () => {
  const llmSender = sender();
  const issuedPayload = { jsonData: '{"fields":[{"id":"issued"}]}' };
  const privacyProof = await createProof(issuedPayload);
  const token = issueLlmSessionToken({
    egressAuthority: await createContentAiEgressAuthority({
      payload: issuedPayload,
      privacyProof,
    }),
    purpose: 'content-ai-pick',
    sender: llmSender,
  });

  await expect(
    authorizeIPCMessage({
      kind: 'background-owned',
      message: {
        jsonData: '{"fields":[{"id":"changed"}]}',
        llmSessionToken: token ?? '',
        privacyProof,
        prompt: 'Normalize selected nodes',
        type: MessageType.PROCESS_WITH_LLM,
      },
      sender: llmSender,
    })
  ).resolves.toEqual({
    authorized: false,
    reason: 'AI privacy proof payload binding mismatch',
  });
});

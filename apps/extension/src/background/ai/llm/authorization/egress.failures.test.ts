import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createContentAiEgressAuthority } from '../../../../features/ai/egress-authority';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createAiPrivacyProof } from '../../../../features/ai/privacy';
import { issueLlmSessionToken, resetLlmSessionTokensForTests } from '../session-tokens';
import {
  authorizeContentLlmRoute,
  authorizeLlmSessionRequestRoute,
  authorizeScenarioEditorLlmRoute,
} from './egress';

const CONTENT_URL = 'https://example.test/page';
const SCENARIO_EDITOR_URL = 'chrome-extension://test/apps/extension/src/scenario-editor/index.html';

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getURL: (path: string) => `chrome-extension://test/${path}`,
  },
}));

function sender(props: {
  documentId?: string;
  frameId?: number;
  tabId?: number;
  url?: string;
}): chrome.runtime.MessageSender {
  return {
    ...(props.documentId === undefined ? {} : { documentId: props.documentId }),
    ...(props.frameId === undefined ? {} : { frameId: props.frameId }),
    ...(props.tabId === undefined ? {} : { tab: { id: props.tabId } as chrome.tabs.Tab }),
    ...(props.url === undefined ? {} : { url: props.url }),
  };
}

function contentSender(): chrome.runtime.MessageSender {
  return sender({ documentId: 'document-7', frameId: 0, tabId: 7, url: CONTENT_URL });
}

async function authorizeIPCMessage(args: {
  kind: 'background-owned';
  message: { type: string } & Record<string, unknown>;
  sender: chrome.runtime.MessageSender;
}) {
  if (args.message.type === MessageType.REQUEST_LLM_SESSION) {
    return authorizeLlmSessionRequestRoute(args);
  }
  if (args.message.type === MessageType.PROCESS_WITH_LLM) {
    return authorizeContentLlmRoute(args);
  }
  if (args.message.type === MessageType.PROCESS_SCENARIO_EDITOR_WITH_LLM) {
    return authorizeScenarioEditorLlmRoute(args);
  }
  return { authorized: false, reason: 'Unsupported test message' };
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

it('rejects malformed LLM session requests at the egress boundary', async () => {
  await expect(
    authorizeIPCMessage({
      kind: 'background-owned',
      message: { purpose: 'content-ai-pick', type: MessageType.REQUEST_LLM_SESSION },
      sender: contentSender(),
    })
  ).resolves.toEqual({ authorized: false, reason: 'Invalid LLM session request' });
});

it('rejects content LLM requests before token work when the privacy proof is missing', async () => {
  await expect(
    authorizeIPCMessage({
      kind: 'background-owned',
      message: {
        jsonData: '{"fields":[]}',
        llmSessionToken: 'token-1',
        prompt: 'Normalize selected nodes',
        type: MessageType.PROCESS_WITH_LLM,
      },
      sender: contentSender(),
    })
  ).resolves.toEqual({ authorized: false, reason: 'Missing AI privacy proof' });
});

it('rejects content LLM requests when the proof hash is not bound to the payload', async () => {
  const llmSender = contentSender();
  const issuedPayload = { jsonData: '{"fields":[{"id":"issued"}]}' };
  const privacyProof = await createAiPrivacyProof({
    captureMode: 'selected_editable',
    payload: issuedPayload,
    riskClass: 'safe_text',
    userInitiatedAiExtraction: true,
  });
  const token = issueLlmSessionToken({
    egressAuthority: await createContentAiEgressAuthority({ payload: issuedPayload, privacyProof }),
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

it('rejects malformed scenario JSON before token consumption', async () => {
  await expect(
    authorizeIPCMessage({
      kind: 'background-owned',
      message: {
        attachments: [],
        contractVersion: 3,
        instruction: 'Rewrite',
        llmSessionToken: 'token-1',
        projectSnapshotJson: 'not-json',
        type: MessageType.PROCESS_SCENARIO_EDITOR_WITH_LLM,
      },
      sender: sender({ documentId: 'scenario-doc-1', url: SCENARIO_EDITOR_URL }),
    })
  ).resolves.toEqual({ authorized: false, reason: 'projectSnapshotJson must be valid JSON' });
});

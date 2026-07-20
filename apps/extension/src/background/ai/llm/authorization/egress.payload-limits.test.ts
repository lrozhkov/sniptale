import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  createContentAiEgressAuthority,
  createScenarioEditorEgressAuthority,
} from '../../../../features/ai/egress-authority';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createAiPrivacyProof, type LlmPrivacyPayload } from '../../../../features/ai/privacy';
import { issueLlmSessionToken, resetLlmSessionTokensForTests } from '../session-tokens';
import { authorizeContentLlmRoute, authorizeScenarioEditorLlmRoute } from './egress';

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

async function withPrivacyProof<TPayload extends LlmPrivacyPayload>(
  payload: TPayload
): Promise<TPayload & { privacyProof: Awaited<ReturnType<typeof createAiPrivacyProof>> }> {
  return {
    ...payload,
    privacyProof: await createAiPrivacyProof({
      captureMode: 'selected_editable',
      payload,
      riskClass: 'safe_text',
      userInitiatedAiExtraction: true,
    }),
  };
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

it('rejects oversized content LLM payloads before consuming the payload-bound token', async () => {
  const llmSender = sender({
    documentId: 'content-doc-1',
    frameId: 0,
    tabId: 7,
    url: CONTENT_URL,
  });
  const validPayload = await withPrivacyProof({ jsonData: '{"fields":[]}' });
  const token = issueLlmSessionToken({
    egressAuthority: await createContentAiEgressAuthority({
      payload: { jsonData: validPayload.jsonData },
      privacyProof: validPayload.privacyProof,
    }),
    purpose: 'content-ai-pick',
    sender: llmSender,
  });

  await expect(
    authorizeContentLlmRoute({
      message: {
        ...validPayload,
        jsonData: '\u0800'.repeat(700_000),
        llmSessionToken: token ?? '',
        prompt: 'Normalize selected nodes',
        type: MessageType.PROCESS_WITH_LLM,
      },
      sender: llmSender,
    })
  ).resolves.toEqual({ authorized: false, reason: 'jsonData exceeds 2000000 decoded bytes' });

  await expect(
    authorizeContentLlmRoute({
      message: {
        ...validPayload,
        llmSessionToken: token ?? '',
        prompt: 'Normalize selected nodes',
        type: MessageType.PROCESS_WITH_LLM,
      },
      sender: llmSender,
    })
  ).resolves.toEqual({ authorized: true });
});

it('rejects oversized scenario LLM payloads before canonicalizing or consuming the token', async () => {
  const scenarioSender = sender({
    documentId: 'scenario-doc-1',
    url: SCENARIO_EDITOR_URL,
  });
  const validScenarioPayload = {
    attachments: [],
    contractVersion: 3 as const,
    instruction: 'Rewrite',
    projectOutlineJson: '{}',
    projectSnapshotJson: '{"steps":[]}',
    selectedSlideCodeJson: '{}',
    toolManifestJson: '{}',
  };
  const token = issueLlmSessionToken({
    egressAuthority: await createScenarioEditorEgressAuthority(validScenarioPayload),
    purpose: 'scenario-editor',
    sender: scenarioSender,
  });

  await expect(
    authorizeScenarioEditorLlmRoute({
      message: {
        ...validScenarioPayload,
        llmSessionToken: token ?? '',
        projectOutlineJson: 'x'.repeat(1_000_001),
        type: MessageType.PROCESS_SCENARIO_EDITOR_WITH_LLM,
      },
      sender: scenarioSender,
    })
  ).resolves.toEqual({ authorized: false, reason: 'Invalid LLM request' });

  await expect(
    authorizeScenarioEditorLlmRoute({
      message: {
        ...validScenarioPayload,
        llmSessionToken: token ?? '',
        type: MessageType.PROCESS_SCENARIO_EDITOR_WITH_LLM,
      },
      sender: scenarioSender,
    })
  ).resolves.toEqual({ authorized: true });
});

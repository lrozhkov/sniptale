import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  createContentAiEgressAuthority,
  createScenarioEditorEgressAuthority,
} from '../../../../features/ai/egress-authority';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createAiPrivacyProof, type LlmPrivacyPayload } from '../../../../features/ai/privacy';
import { issueLlmSessionToken, resetLlmSessionTokensForTests } from '../session-tokens';
import {
  authorizeContentLlmRoute,
  authorizeLlmSessionRequestRoute,
  authorizeScenarioEditorLlmRoute,
} from './egress';
import {
  hasPreauthorizedLlmRouteMessage,
  hasPreauthorizedScenarioEditorLlmRouteMessage,
} from './preauthorization';

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

function createScenarioLlmAuthority() {
  return createScenarioEditorEgressAuthority({
    attachments: [],
    contractVersion: 3,
    projectSnapshotJson: '{"steps":[]}',
  });
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

it('preauthorizes content LLM messages with sender-bound one-shot tokens', async () => {
  const llmSender = sender({ documentId: 'document-7', frameId: 0, tabId: 7, url: CONTENT_URL });
  const payload = await withPrivacyProof({
    jsonData: '{"fields":[]}',
    markdownData: '| a |\n| - |',
  });
  const llmToken = issueLlmSessionToken({
    egressAuthority: await createContentAiEgressAuthority({
      payload: { jsonData: payload.jsonData, markdownData: payload.markdownData },
      privacyProof: payload.privacyProof,
    }),
    purpose: 'content-ai-pick',
    sender: llmSender,
  });
  const llmMessage = {
    llmSessionToken: llmToken ?? '',
    prompt: 'Normalize selected nodes',
    type: MessageType.PROCESS_WITH_LLM,
    ...payload,
  };

  await expect(
    authorizeIPCMessage({ kind: 'background-owned', message: llmMessage, sender: llmSender })
  ).resolves.toEqual({ authorized: true });
  expect(hasPreauthorizedLlmRouteMessage(llmMessage)).toBe(true);
  await expect(
    authorizeIPCMessage({ kind: 'background-owned', message: llmMessage, sender: llmSender })
  ).resolves.toEqual({ authorized: false, reason: 'Unauthorized LLM request' });
});

it('rejects content LLM messages when the self-created proof targets a different payload', async () => {
  const llmSender = sender({ documentId: 'document-7', frameId: 0, tabId: 7, url: CONTENT_URL });
  const issuedPayload = await withPrivacyProof({ jsonData: '{"fields":[{"id":"issued"}]}' });
  const submittedPayload = await withPrivacyProof({ jsonData: '{"fields":[{"id":"changed"}]}' });
  const llmToken = issueLlmSessionToken({
    egressAuthority: await createContentAiEgressAuthority({
      payload: { jsonData: issuedPayload.jsonData },
      privacyProof: issuedPayload.privacyProof,
    }),
    purpose: 'content-ai-pick',
    sender: llmSender,
  });

  await expect(
    authorizeIPCMessage({
      kind: 'background-owned',
      message: {
        llmSessionToken: llmToken ?? '',
        prompt: 'Normalize selected nodes',
        type: MessageType.PROCESS_WITH_LLM,
        ...submittedPayload,
      },
      sender: llmSender,
    })
  ).resolves.toEqual({ authorized: false, reason: 'Unauthorized LLM request' });
});

it('preauthorizes scenario editor LLM messages with sender-bound one-shot tokens', async () => {
  const scenarioSender = sender({ documentId: 'scenario-doc-1', url: SCENARIO_EDITOR_URL });
  const token = issueLlmSessionToken({
    egressAuthority: await createScenarioLlmAuthority(),
    purpose: 'scenario-editor',
    sender: scenarioSender,
  });
  const message = {
    attachments: [],
    contractVersion: 3 as const,
    instruction: 'Rewrite',
    llmSessionToken: token ?? '',
    projectSnapshotJson: '{"steps":[]}',
    type: MessageType.PROCESS_SCENARIO_EDITOR_WITH_LLM,
  };

  await expect(
    authorizeIPCMessage({ kind: 'background-owned', message, sender: scenarioSender })
  ).resolves.toEqual({ authorized: true });
  expect(hasPreauthorizedScenarioEditorLlmRouteMessage(message)).toBe(true);
});

it('rejects scenario editor LLM messages when attachments differ from the issued lease', async () => {
  const scenarioSender = sender({ documentId: 'scenario-doc-1', url: SCENARIO_EDITOR_URL });
  const token = issueLlmSessionToken({
    egressAuthority: await createScenarioEditorEgressAuthority({
      attachments: [
        {
          dataUrl: 'data:image/png;base64,AA==',
          filename: 'step-1.png',
          mimeType: 'image/png',
          stepId: 'step-1',
          stepNumber: 1,
        },
      ],
      contractVersion: 3,
      projectSnapshotJson: '{"steps":[]}',
    }),
    purpose: 'scenario-editor',
    sender: scenarioSender,
  });

  await expect(
    authorizeIPCMessage({
      kind: 'background-owned',
      message: {
        attachments: [
          {
            dataUrl: 'data:image/png;base64,AQ==',
            filename: 'step-1.png',
            mimeType: 'image/png',
            stepId: 'step-1',
            stepNumber: 1,
          },
        ],
        contractVersion: 3 as const,
        instruction: 'Rewrite',
        llmSessionToken: token ?? '',
        projectSnapshotJson: '{"steps":[]}',
        type: MessageType.PROCESS_SCENARIO_EDITOR_WITH_LLM,
      },
      sender: scenarioSender,
    })
  ).resolves.toEqual({ authorized: false, reason: 'Unauthorized LLM request' });
});

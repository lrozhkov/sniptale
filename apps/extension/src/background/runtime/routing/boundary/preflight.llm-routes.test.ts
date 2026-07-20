import { beforeEach, expect, it, vi } from 'vitest';

import {
  createSender,
  expectListenerResult,
  parseBackgroundRuntimeMessageMock,
  registerListener,
  resetRuntimeMessagingMocks,
  routeLlmMessageMock,
  routeLlmSessionMessageMock,
  routeScenarioEditorLlmMessageMock,
} from '../../../../../../../tooling/test/support/background-runtime-messaging.test-support';
import {
  createContentAiEgressAuthority,
  createScenarioEditorEgressAuthority,
  type AiEgressAuthority,
} from '../../../../features/ai/egress-authority';
import { createAiPrivacyProof } from '../../../../features/ai/privacy';
import {
  issueLlmSessionToken,
  resetLlmSessionTokensForTests,
} from '../../../ai/llm/session-tokens';

const VALID_CONTENT_HASH =
  'sha256:1111111111111111111111111111111111111111111111111111111111111111';

function createContentAuthority(payloadHash = VALID_CONTENT_HASH): AiEgressAuthority {
  return {
    captureMode: 'selected_editable',
    contractVersion: 1,
    payloadHash,
    purpose: 'content-ai-pick',
    riskClass: 'safe_text',
  };
}

beforeEach(() => {
  resetRuntimeMessagingMocks();
  resetLlmSessionTokensForTests();
});

it('returns early when the LLM session route handles the message', () => {
  const { listener, sendResponse } = registerListener();
  const sender = createSender(5);
  const message = {
    egressAuthority: createContentAuthority(),
    purpose: 'content-ai-pick',
    type: 'REQUEST_LLM_SESSION',
  };
  parseBackgroundRuntimeMessageMock.mockReturnValue(message);
  routeLlmSessionMessageMock.mockReturnValue(true);

  expectListenerResult(true, listener, message, sender, sendResponse);

  expect(routeLlmSessionMessageMock).toHaveBeenCalledWith(message, sender, sendResponse);
});

it('returns early when the content LLM router handles the message', async () => {
  const { listener, sendResponse } = registerListener();
  const sender = createSender(5);
  const payload = { jsonData: '{"fields":[]}' };
  const privacyProof = await createAiPrivacyProof({
    captureMode: 'selected_editable',
    payload,
    riskClass: 'safe_text',
    userInitiatedAiExtraction: true,
  });
  const llmSessionToken = issueLlmSessionToken({
    egressAuthority: await createContentAiEgressAuthority({ payload, privacyProof }),
    purpose: 'content-ai-pick',
    sender,
  });
  const message = {
    jsonData: payload.jsonData,
    llmSessionToken,
    privacyProof,
    prompt: 'Normalize selected nodes',
    type: 'PROCESS_WITH_LLM',
  };
  parseBackgroundRuntimeMessageMock.mockReturnValue(message);
  routeLlmMessageMock.mockReturnValue(true);

  expectListenerResult(true, listener, message, sender, sendResponse);

  await vi.waitFor(() => {
    expect(routeLlmMessageMock).toHaveBeenCalledWith(message, sendResponse, sender);
  });
});

it('returns early when the scenario-editor LLM router handles the message', async () => {
  const { listener, sendResponse } = registerListener();
  const sender = createSender(
    undefined,
    'chrome-extension://test/apps/extension/src/scenario-editor/index.html'
  );
  sender.documentId = 'scenario-doc-1';
  const scenarioPayload = {
    attachments: [],
    contractVersion: 3 as const,
    instruction: 'Rewrite',
    projectSnapshotJson: '{"steps":[]}',
  };
  const llmSessionToken = issueLlmSessionToken({
    egressAuthority: await createScenarioEditorEgressAuthority(scenarioPayload),
    purpose: 'scenario-editor',
    sender,
  });
  const message = {
    ...scenarioPayload,
    llmSessionToken,
    type: 'PROCESS_SCENARIO_EDITOR_WITH_LLM',
  };
  parseBackgroundRuntimeMessageMock.mockReturnValue(message);
  routeScenarioEditorLlmMessageMock.mockReturnValue(true);

  expectListenerResult(true, listener, message, sender, sendResponse);

  await vi.waitFor(() => {
    expect(routeScenarioEditorLlmMessageMock).toHaveBeenCalledWith(message, sendResponse, sender);
  });
});

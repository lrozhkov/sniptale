import { beforeEach, expect, it, vi } from 'vitest';
import { CHROME_AI_MODEL_ID } from '../../../features/ai/chrome/constants';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createScenarioAiClient } from './client';

const mocks = vi.hoisted(() => ({
  createRuntimeMessagingTransport: vi.fn(),
  requestLlmSessionToken: vi.fn(),
  runChromeAiScenarioRequest: vi.fn(),
  sendRuntimeMessage: vi.fn(),
}));

vi.mock('../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/runtime-messaging')>()),
  createRuntimeMessagingTransport: mocks.createRuntimeMessagingTransport,
}));

vi.mock('../../../workflows/ai-session/llm-session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../workflows/ai-session/llm-session')>()),
  requestLlmSessionToken: mocks.requestLlmSessionToken,
}));

vi.mock('./chrome/scenario-runner', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./chrome/scenario-runner')>()),
  runChromeAiScenarioRequest: mocks.runChromeAiScenarioRequest,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createRuntimeMessagingTransport.mockReturnValue({
    sendRuntimeMessage: mocks.sendRuntimeMessage,
  });
  mocks.requestLlmSessionToken.mockResolvedValue('llm-session-token-1');
  mocks.runChromeAiScenarioRequest.mockResolvedValue({ success: true, steps: [] });
  mocks.sendRuntimeMessage.mockResolvedValue({ success: true, steps: [{ stepId: 'step-1' }] });
});

it('requests an LLM session token and sends provider-backed scenario AI messages', async () => {
  const client = createScenarioAiClient();

  const response = await client.requestResponse({
    attachments: [],
    instruction: 'Update the scenario',
    modelId: 'provider-model-1',
    projectSnapshotJson: '{"project":true}',
  });

  expect(response).toEqual({ success: true, steps: [{ stepId: 'step-1' }] });
  expect(mocks.requestLlmSessionToken).toHaveBeenCalledWith(
    'scenario-editor',
    expect.objectContaining({
      contractVersion: 1,
      purpose: 'scenario-editor',
      scenarioContractVersion: 3,
    })
  );
  expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      instruction: 'Update the scenario',
      llmSessionToken: 'llm-session-token-1',
      type: MessageType.PROCESS_SCENARIO_EDITOR_WITH_LLM,
    })
  );
});

it('routes chrome built-in scenario AI requests without runtime messaging', async () => {
  const client = createScenarioAiClient();

  await client.requestResponse({
    attachments: [],
    instruction: 'Update the scenario',
    modelId: CHROME_AI_MODEL_ID,
    projectSnapshotJson: '{"project":true}',
  });

  expect(mocks.runChromeAiScenarioRequest).toHaveBeenCalledWith(
    expect.objectContaining({ contractVersion: 3, projectSnapshotJson: '{"project":true}' })
  );
  expect(mocks.requestLlmSessionToken).not.toHaveBeenCalled();
  expect(mocks.sendRuntimeMessage).not.toHaveBeenCalled();
});

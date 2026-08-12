import { beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

const sendRuntimeMessageMock = vi.hoisted(() => vi.fn());

vi.mock('../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));

import { moveAIModel, resetGlobalSystemPrompt, resetScenarioEditorSystemPrompt } from './mutations';

beforeEach(() => {
  sendRuntimeMessageMock.mockReset();
  sendRuntimeMessageMock.mockResolvedValue({ success: true, result: 'accepted' });
});

it('sends model order changes through the typed AI settings mutation boundary', async () => {
  await moveAIModel('model-2', 'model-1');

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    beforeModelId: 'model-1',
    modelId: 'model-2',
    operation: 'move-model',
    type: MessageType.AI_SETTINGS_MUTATION,
  });
});

it('sends prompt resets through the typed AI settings mutation boundary', async () => {
  await resetGlobalSystemPrompt();
  await resetScenarioEditorSystemPrompt();

  expect(sendRuntimeMessageMock).toHaveBeenNthCalledWith(1, {
    operation: 'reset-global-prompt',
    type: MessageType.AI_SETTINGS_MUTATION,
  });
  expect(sendRuntimeMessageMock).toHaveBeenNthCalledWith(2, {
    operation: 'reset-scenario-editor-prompt',
    type: MessageType.AI_SETTINGS_MUTATION,
  });
});

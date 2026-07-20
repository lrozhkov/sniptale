import { beforeEach, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
  mutateStoredAISettings: vi.fn(),
  resetAISettingsMutationQueueForTests: vi.fn(),
}));

vi.mock('../../../composition/persistence/ai-settings', () => storageMocks);

import { mutateAiSettings, resetAiSettingsMutationQueueForTests } from './mutations';

beforeEach(() => {
  vi.clearAllMocks();
  storageMocks.mutateStoredAISettings.mockResolvedValue(undefined);
});

it('delegates the complete mutation command to the persistence authority', async () => {
  const message = {
    model: {
      displayName: 'Model 1',
      id: 'model-1',
      modelCode: 'model-code',
      providerId: 'provider-1',
    },
    operation: 'add-model',
    type: 'AI_SETTINGS_MUTATION',
  } as const;

  await mutateAiSettings(message);

  expect(storageMocks.mutateStoredAISettings).toHaveBeenCalledWith(message);
});

it('delegates queue reset to the persistence authority', () => {
  resetAiSettingsMutationQueueForTests();

  expect(storageMocks.resetAISettingsMutationQueueForTests).toHaveBeenCalledOnce();
});

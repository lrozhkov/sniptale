import { expect, expectTypeOf, it } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type {
  AIProviderDestinationKind,
  AiSettingsMutationMessage,
  AiSettingsQueryMessage,
} from './ai-settings-runtime';

it('keeps AI settings query and mutation payloads operation-specific', () => {
  const query = {
    modelId: 'model-1',
    operation: 'read-chrome-ai-content-system-prompt',
    type: MessageType.AI_SETTINGS_QUERY,
  } satisfies AiSettingsQueryMessage;
  const mutation = {
    operation: 'save-default-model',
    defaultModelId: null,
    type: MessageType.AI_SETTINGS_MUTATION,
  } satisfies AiSettingsMutationMessage;

  expect(query.modelId).toBe('model-1');
  expect(mutation.defaultModelId).toBeNull();
  expectTypeOf<AIProviderDestinationKind>().toEqualTypeOf<
    'chrome-built-in' | 'external' | 'local-custom'
  >();
});

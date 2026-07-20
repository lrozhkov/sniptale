import { expect, it } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  aiSettingsQueryMessageSchema,
  aiSettingsQueryResponseSchema,
  aiSettingsMutationMessageSchema,
  aiSettingsMutationResponseSchema,
} from './ai-settings-schemas';

it('parses explicit provider secret clear mutations', () => {
  expect(
    aiSettingsMutationMessageSchema.parse({
      operation: 'clear-provider-secret',
      providerId: 'provider-1',
      type: MessageType.AI_SETTINGS_MUTATION,
    })
  ).toEqual({
    operation: 'clear-provider-secret',
    providerId: 'provider-1',
    type: MessageType.AI_SETTINGS_MUTATION,
  });
});

it('parses AI secret passphrase unlock mutations', () => {
  expect(
    aiSettingsMutationMessageSchema.parse({
      operation: 'unlock-secret-passphrase-protection',
      passphrase: 'passphrase',
      type: MessageType.AI_SETTINGS_MUTATION,
    })
  ).toEqual({
    operation: 'unlock-secret-passphrase-protection',
    passphrase: 'passphrase',
    type: MessageType.AI_SETTINGS_MUTATION,
  });
});

it('parses background-owned AI secret protection status reads and responses', () => {
  expect(
    aiSettingsMutationMessageSchema.parse({
      operation: 'read-secret-protection-status',
      type: MessageType.AI_SETTINGS_MUTATION,
    })
  ).toEqual({
    operation: 'read-secret-protection-status',
    type: MessageType.AI_SETTINGS_MUTATION,
  });

  expect(
    aiSettingsMutationResponseSchema.parse({
      secretProtectionStatus: {
        isEnabled: true,
        isUnlocked: false,
        mode: 'passphrase',
      },
      success: true,
    })
  ).toEqual({
    secretProtectionStatus: {
      isEnabled: true,
      isUnlocked: false,
      mode: 'passphrase',
    },
    success: true,
  });
});

it('parses sanitized AI settings query payloads without provider destinations', () => {
  expectParsedAiSettingsQueryMessage();
  expectParsedSanitizedModelSelection();
  expectRejectsProviderBaseUrlLeak();
});

function expectParsedAiSettingsQueryMessage() {
  expect(
    aiSettingsQueryMessageSchema.parse({
      operation: 'read-model-selection-bootstrap',
      type: MessageType.AI_SETTINGS_QUERY,
    })
  ).toEqual({
    operation: 'read-model-selection-bootstrap',
    type: MessageType.AI_SETTINGS_QUERY,
  });
}

function expectParsedSanitizedModelSelection() {
  expect(
    aiSettingsQueryResponseSchema.parse({
      modelSelection: {
        chromeAiEnabled: false,
        defaultModelId: '00000000-0000-4000-8000-000000000001',
        globalSystemPrompt: 'Prompt',
        models: [
          {
            displayName: 'Model',
            id: '00000000-0000-4000-8000-000000000001',
            modelCode: 'model-code',
            providerId: '00000000-0000-4000-8000-000000000002',
          },
        ],
        providers: [
          {
            connectionType: 'openai-compatible',
            createdAt: 1,
            destinationKind: 'external',
            hasStoredApiKey: true,
            id: '00000000-0000-4000-8000-000000000002',
            name: 'Provider',
          },
        ],
      },
      success: true,
    }).modelSelection?.providers[0]
  ).not.toHaveProperty('baseUrl');
}

function expectRejectsProviderBaseUrlLeak() {
  expect(() =>
    aiSettingsQueryResponseSchema.parse({
      modelSelection: {
        chromeAiEnabled: false,
        defaultModelId: null,
        globalSystemPrompt: '',
        models: [],
        providers: [
          {
            baseUrl: 'https://api.provider.test/v1',
            connectionType: 'openai-compatible',
            createdAt: 1,
            destinationKind: 'external',
            hasStoredApiKey: true,
            id: '00000000-0000-4000-8000-000000000002',
            name: 'Provider',
          },
        ],
      },
      success: true,
    })
  ).toThrow(/baseUrl/);
}

it('rejects removed default-model capability messages', () => {
  expect(() =>
    aiSettingsMutationMessageSchema.parse({
      defaultModelId: 'model-1',
      operation: 'request-default-model-capability',
      type: MessageType.AI_SETTINGS_MUTATION,
    })
  ).toThrow();

  expect(() =>
    aiSettingsMutationMessageSchema.parse({
      capabilityToken: '00000000-0000-4000-8000-000000000000',
      defaultModelId: 'model-1',
      operation: 'save-default-model',
      type: MessageType.AI_SETTINGS_MUTATION,
    })
  ).toThrow(/capabilityToken/);
});

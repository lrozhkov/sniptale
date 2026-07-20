import { describe, expect, it } from 'vitest';

import {
  cloneLegacyAiSettings,
  parseLegacyStoredAIProviders,
  parseStoredAIModels,
  parseStoredChromeAiEnabled,
  parseStoredAIProviders,
  parseStoredDefaultModelId,
  parseStoredProviderSecretMap,
  parseStoredSystemPrompt,
} from './guards';

function verifyProviderListParsing() {
  expect(
    parseStoredAIProviders([
      {
        id: 'provider-1',
        name: 'Provider',
        connectionType: 'openai-compatible',
        baseUrl: 'https://api.example.test',
        hasStoredApiKey: true,
        createdAt: 1,
      },
      { id: 'broken' },
    ])
  ).toMatchObject({
    hasInvalidRoot: false,
    invalidEntryCount: 1,
    value: [{ id: 'provider-1' }],
  });
}

function verifyModelListParsing() {
  expect(
    parseStoredAIModels([
      {
        id: 'model-1',
        providerId: 'provider-1',
        modelCode: 'gpt',
        displayName: 'GPT',
      },
    ])
  ).toMatchObject({
    hasInvalidRoot: false,
    invalidEntryCount: 0,
    value: [{ id: 'model-1' }],
  });
}

function verifyProviderBaseUrlQueryRejection() {
  expect(
    parseStoredAIProviders([
      {
        id: 'provider-query',
        name: 'Provider',
        connectionType: 'openai-compatible',
        baseUrl: 'https://api.example.test/v1?token=secret',
        hasStoredApiKey: true,
        createdAt: 1,
      },
    ])
  ).toMatchObject({
    hasInvalidRoot: false,
    invalidEntryCount: 1,
    value: [],
  });
}

describe('ai storage guards list parsing', () => {
  it('parses valid providers and models while counting invalid entries', () => {
    verifyProviderListParsing();
    verifyModelListParsing();
  });

  it('rejects provider records whose base URL carries query data', () => {
    verifyProviderBaseUrlQueryRejection();
  });
});

describe('ai storage guards scalar parsing', () => {
  it('parses legacy providers and scalar storage values', () => {
    expect(
      parseLegacyStoredAIProviders([
        {
          id: 'provider-1',
          name: 'Provider',
          connectionType: 'openai-compatible',
          baseUrl: 'https://api.example.test',
          apiKey: 'secret',
          createdAt: 1,
        },
      ])
    ).toMatchObject({
      hasInvalidRoot: false,
      invalidEntryCount: 0,
    });
    expect(parseStoredDefaultModelId('model-1')).toBe('model-1');
    expect(parseStoredDefaultModelId(42)).toBeNull();
    expect(parseStoredChromeAiEnabled(true)).toBe(true);
    expect(parseStoredChromeAiEnabled('true')).toBe(false);
    expect(parseStoredSystemPrompt(undefined, 'fallback')).toBe('fallback');
  });
});

describe('ai storage guards secret parsing', () => {
  it('clones legacy settings roots and filters valid provider secrets', () => {
    expect(cloneLegacyAiSettings({ providers: [] })).toEqual({ providers: [] });
    expect(cloneLegacyAiSettings('broken')).toBeNull();
    expect(
      parseStoredProviderSecretMap({
        valid: {
          version: 1,
          algorithm: 'AES-GCM',
          iv: 'iv',
          ciphertext: 'ciphertext',
        },
        invalid: { version: 2 },
      })
    ).toEqual({
      valid: {
        version: 1,
        algorithm: 'AES-GCM',
        iv: 'iv',
        ciphertext: 'ciphertext',
      },
    });
  });
});

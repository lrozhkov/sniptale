import { describe, expect, it } from 'vitest';

import { AISettingsSchema, ProviderFormSchema } from './ai-settings';

function expectProviderBaseUrlIssue(baseUrl: string, message: string) {
  const result = ProviderFormSchema.safeParse({
    name: 'Remote provider',
    connectionType: 'openai-compatible',
    baseUrl,
  });

  expect(result.success).toBe(false);
  if (result.success) {
    throw new Error('Expected provider base URL to fail validation');
  }

  expect(result.error.issues).toEqual([
    expect.objectContaining({
      message,
      path: ['baseUrl'],
    }),
  ]);
}

describe('ProviderFormSchema', () => {
  it('maps provider URLs with embedded credentials to the invalid-url validation message', () => {
    expectProviderBaseUrlIssue('https://user:pass@example.com/v1', 'validation.schemas.invalidUrl');
  });

  it('maps provider URLs with query or fragment to the invalid-url validation message', () => {
    expectProviderBaseUrlIssue(
      'https://api.example.com/v1?token=secret#models',
      'validation.schemas.invalidUrl'
    );
  });

  it('maps non-loopback http URLs to the https-required validation message', () => {
    expectProviderBaseUrlIssue('http://example.com/v1', 'validation.schemas.httpsUrlRequired');
  });
});

describe('AISettingsSchema', () => {
  it('accepts boolean chrome-ai toggle state and non-uuid default ids for virtual models', () => {
    const result = AISettingsSchema.safeParse({
      chromeAiEnabled: true,
      providers: [],
      models: [],
      defaultModelId: 'chrome-ai-google-model',
      globalSystemPrompt: 'Global prompt',
      scenarioEditorSystemPrompt: 'Scenario prompt',
    });

    expect(result.success).toBe(true);
  });

  it('rejects empty-string default model ids while still allowing null', () => {
    expect(
      AISettingsSchema.safeParse({
        chromeAiEnabled: false,
        providers: [],
        models: [],
        defaultModelId: '',
        globalSystemPrompt: 'Global prompt',
        scenarioEditorSystemPrompt: 'Scenario prompt',
      }).success
    ).toBe(false);

    expect(
      AISettingsSchema.safeParse({
        chromeAiEnabled: true,
        providers: [],
        models: [],
        defaultModelId: null,
        globalSystemPrompt: 'Global prompt',
        scenarioEditorSystemPrompt: 'Scenario prompt',
      }).success
    ).toBe(true);
  });
});

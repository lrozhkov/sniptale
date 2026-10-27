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

it('validates the same audio operation constraints in runtime models and the model form', async () => {
  const { AIModelSchema, ModelFormSchema } = await import('./ai-settings');
  const model = {
    id: '00000000-0000-4000-8000-000000000001',
    providerId: '00000000-0000-4000-8000-000000000002',
    modelCode: 'custom',
    displayName: 'Speech',
    operation: 'speech',
    audio: { speech: { voiceId: 'voice', responseFormat: 'mp3' } },
  };
  expect(AIModelSchema.strict().safeParse(model).success).toBe(true);
  expect(ModelFormSchema.safeParse(model).success).toBe(true);
  expect(AIModelSchema.strict().safeParse({ ...model, operation: 'text' }).success).toBe(false);
  expect(
    ModelFormSchema.safeParse({ ...model, audio: { speech: { ...model.audio.speech, speed: 5 } } })
      .success
  ).toBe(false);
});

it('retains catalog and manual property ownership and rejects an unknown ownership value', async () => {
  const { AIModelSchema } = await import('./ai-settings');
  const base = {
    id: '00000000-0000-4000-8000-000000000001',
    providerId: '00000000-0000-4000-8000-000000000002',
    modelCode: 'exact',
    displayName: 'Name',
  };
  for (const propertySource of ['catalog', 'manual']) {
    expect(AIModelSchema.strict().parse({ ...base, propertySource })).toEqual({
      ...base,
      propertySource,
    });
  }
  expect(AIModelSchema.strict().safeParse({ ...base, propertySource: 'automatic' }).success).toBe(
    false
  );
});

it('admits existing catalog identity bounds in runtime models without widening manual entry', async () => {
  const { AIModelSchema, ModelFormSchema } = await import('./ai-settings');
  const base = {
    id: '00000000-0000-4000-8000-000000000001',
    providerId: '00000000-0000-4000-8000-000000000002',
    modelCode: 'c'.repeat(500),
    displayName: 'n'.repeat(500),
  };
  expect(AIModelSchema.strict().safeParse(base).success).toBe(true);
  expect(ModelFormSchema.safeParse(base).success).toBe(true);
  expect(AIModelSchema.strict().safeParse({ ...base, modelCode: 'c'.repeat(501) }).success).toBe(
    false
  );
  expect(AIModelSchema.strict().safeParse({ ...base, displayName: 'n'.repeat(501) }).success).toBe(
    false
  );
});

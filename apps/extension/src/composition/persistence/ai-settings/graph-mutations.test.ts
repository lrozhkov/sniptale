import { beforeEach, expect, it, vi } from 'vitest';

import type { AIModel, AIProvider } from '../../../contracts/settings';
vi.mock('../infrastructure/browser-storage', () => ({
  browserStorage: { local: { get: vi.fn(async () => ({ sniptale_ai_storage_version: 4 })) } },
}));

const coreMocks = vi.hoisted(() => ({
  changeAISecretPassphraseProtection: vi.fn(),
  clearAIProviderSecret: vi.fn(),
  deleteAIProviderGraphRecord: vi.fn(),
  disableAISecretPassphraseProtection: vi.fn(),
  enableAISecretPassphraseProtection: vi.fn(),
  loadAISecretProtectionStatus: vi.fn(),
  loadAIModels: vi.fn(),
  loadAIProviders: vi.fn(),
  lockAISecretProtection: vi.fn(),
  resetAISecretPassphraseProtection: vi.fn(),
  saveAIModels: vi.fn(),
  saveChromeAiEnabled: vi.fn(),
  saveGlobalSystemPrompt: vi.fn(),
  saveScenarioEditorSystemPrompt: vi.fn(),
  unlockAISecretProtection: vi.fn(),
  upsertAIProviderRecord: vi.fn(),
}));

const invariantMock = vi.hoisted(() => vi.fn());
const initializeAiStorageAccessMock = vi.hoisted(() => vi.fn());

vi.mock('./core', () => coreMocks);
vi.mock('./graph-invariants', () => ({ assertAISettingsGraphInvariants: invariantMock }));
vi.mock('./init', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./init')>()),
  initializeAiStorageAccess: initializeAiStorageAccessMock,
}));

import { mutateStoredAISettings, resetAISettingsMutationQueueForTests } from './graph-mutations';

let models: AIModel[] = [];
let providers: AIProvider[] = [];

function createProvider(id = 'provider-1'): AIProvider {
  return {
    baseUrl: `https://${id}.example.com/v1`,
    connectionType: 'openai-compatible',
    createdAt: 1,
    hasStoredApiKey: false,
    id,
    name: id,
  };
}

function createProviderInput(id = 'provider-1', apiKey?: string) {
  return {
    apiKey,
    baseUrl: `https://${id}.example.com/v1`,
    connectionType: 'openai-compatible' as const,
    createdAt: 1,
    id,
    name: id,
  };
}

function createModel(id: string, providerId = 'provider-1'): AIModel {
  return { displayName: id, id, modelCode: `${id}-code`, providerId };
}

function installStatefulCoreMocks(): void {
  coreMocks.loadAIModels.mockImplementation(async () => [...models]);
  coreMocks.loadAIProviders.mockImplementation(async () => [...providers]);
  coreMocks.saveAIModels.mockImplementation(async (nextModels: AIModel[]) => {
    models = nextModels;
  });
  coreMocks.upsertAIProviderRecord.mockImplementation(async (input) => {
    const nextProvider = createProvider(input.id);
    providers = providers.some(({ id }) => id === input.id)
      ? providers.map((provider) => (provider.id === input.id ? nextProvider : provider))
      : [...providers, nextProvider];
  });
  coreMocks.clearAIProviderSecret.mockImplementation(async (providerId: string) => {
    providers = providers.map((provider) =>
      provider.id === providerId ? { ...provider, hasStoredApiKey: false } : provider
    );
  });
  coreMocks.deleteAIProviderGraphRecord.mockImplementation(async (providerId: string) => {
    providers = providers.filter(({ id }) => id !== providerId);
    models = models.filter((model) => model.providerId !== providerId);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetAISettingsMutationQueueForTests();
  providers = [createProvider()];
  models = [];
  initializeAiStorageAccessMock.mockResolvedValue(undefined);
  invariantMock.mockResolvedValue(undefined);
  installStatefulCoreMocks();
});

it('adds and updates models only when their provider and model records exist', async () => {
  await mutateStoredAISettings({ model: createModel('model-1'), operation: 'add-model' });
  await expect(
    mutateStoredAISettings({ model: createModel('model-1'), operation: 'add-model' })
  ).rejects.toThrow('Model model-1 already exists');
  await expect(
    mutateStoredAISettings({
      model: createModel('missing-model', 'missing-provider'),
      operation: 'update-model',
    })
  ).rejects.toThrow('Provider missing-provider not found for model missing-model');

  await mutateStoredAISettings({
    model: { ...createModel('model-1'), displayName: 'Updated' },
    operation: 'update-model',
  });
  expect(models).toEqual([{ ...createModel('model-1'), displayName: 'Updated' }]);
});

it('moves a model before another model or to the end without changing model records', async () => {
  models = [createModel('model-1'), createModel('model-2'), createModel('model-3')];

  await mutateStoredAISettings({
    beforeModelId: 'model-1',
    modelId: 'model-3',
    operation: 'move-model',
  });
  expect(models.map(({ id }) => id)).toEqual(['model-3', 'model-1', 'model-2']);

  await mutateStoredAISettings({
    beforeModelId: null,
    modelId: 'model-1',
    operation: 'move-model',
  });
  expect(models.map(({ id }) => id)).toEqual(['model-3', 'model-2', 'model-1']);
});

it('rejects unknown model reorder targets and skips no-op writes', async () => {
  models = [createModel('model-1'), createModel('model-2')];

  await expect(
    mutateStoredAISettings({
      beforeModelId: 'missing-model',
      modelId: 'model-1',
      operation: 'move-model',
    })
  ).rejects.toThrow('Model missing-model not found');
  await mutateStoredAISettings({
    beforeModelId: 'model-1',
    modelId: 'model-1',
    operation: 'move-model',
  });

  expect(coreMocks.saveAIModels).not.toHaveBeenCalled();
});

it('rejects an update when the provider exists but the model does not', async () => {
  await expect(
    mutateStoredAISettings({ model: createModel('missing-model'), operation: 'update-model' })
  ).rejects.toThrow('Model missing-model not found');
});

it('preserves unknown stored model fields during compatible updates', async () => {
  models = [{ ...createModel('model-1'), legacyField: 'keep-me' } as AIModel];

  await mutateStoredAISettings({
    model: { ...createModel('model-1'), displayName: 'Updated' },
    operation: 'update-model',
  });

  expect(models[0]).toEqual({
    ...createModel('model-1'),
    displayName: 'Updated',
    legacyField: 'keep-me',
  });
});

it('deletes only the requested model through the active graph permit', async () => {
  models = [createModel('model-1'), createModel('model-2')];
  await mutateStoredAISettings({ modelId: 'model-1', operation: 'delete-model' });
  expect(coreMocks.saveAIModels).toHaveBeenCalledWith([createModel('model-2')], expect.anything());
  expect(models).toEqual([createModel('model-2')]);
});

it('validates provider commands before writing', async () => {
  const secret = 'provider-secret-value';
  await expect(
    mutateStoredAISettings({
      operation: 'add-provider',
      provider: createProviderInput('provider-1', secret),
    })
  ).rejects.toThrow('Provider provider-1 already exists');

  expect(coreMocks.upsertAIProviderRecord).not.toHaveBeenCalled();
  await expect(
    mutateStoredAISettings({
      operation: 'add-provider',
      provider: createProviderInput('provider-1', secret),
    })
  ).rejects.not.toThrow(secret);
});

it('adds and updates provider records without allowing a missing update target', async () => {
  await mutateStoredAISettings({
    operation: 'add-provider',
    provider: createProviderInput('provider-2'),
  });
  await mutateStoredAISettings({
    operation: 'update-provider',
    provider: { ...createProviderInput('provider-2'), name: 'Updated provider' },
  });
  await expect(
    mutateStoredAISettings({
      operation: 'update-provider',
      provider: createProviderInput('missing-provider'),
    })
  ).rejects.toThrow('Provider missing-provider not found');

  expect(providers.map(({ id }) => id)).toEqual(['provider-1', 'provider-2']);
});

it('clears provider secrets only for existing providers and deletes their graph', async () => {
  await mutateStoredAISettings({ operation: 'clear-provider-secret', providerId: 'provider-1' });
  await expect(
    mutateStoredAISettings({
      operation: 'clear-provider-secret',
      providerId: 'missing-provider',
    })
  ).rejects.toThrow('Provider missing-provider not found');
  await mutateStoredAISettings({ operation: 'delete-provider', providerId: 'provider-1' });

  expect(coreMocks.clearAIProviderSecret).toHaveBeenCalledWith('provider-1', expect.any(Object));
  expect(coreMocks.deleteAIProviderGraphRecord).toHaveBeenCalledWith(
    'provider-1',
    expect.any(Object)
  );
});

it('cascades provider deletion and keeps the queue usable after a rejected write', async () => {
  models = [createModel('model-1')];
  coreMocks.deleteAIProviderGraphRecord.mockRejectedValueOnce(new Error('graph write failed'));

  await expect(
    mutateStoredAISettings({ operation: 'delete-provider', providerId: 'provider-1' })
  ).rejects.toThrow('graph write failed');
  await mutateStoredAISettings({ modelId: 'model-1', operation: 'delete-model' });

  expect(models).toEqual([]);
});

it('removes the text-only prompt when changing a model operation to speech', async () => {
  models = [{ ...createModel('model-1'), systemPrompt: 'Text-only prompt' }];
  const speech: AIModel = {
    ...createModel('model-1'),
    operation: 'speech',
    audio: { speech: { voiceId: 'voice', responseFormat: 'mp3' } },
  };
  await mutateStoredAISettings({ operation: 'update-model', model: speech });
  expect(coreMocks.saveAIModels).toHaveBeenCalledWith([speech], expect.anything());
  await mutateStoredAISettings({ operation: 'update-model', model: createModel('model-1') });
  expect(models).toEqual([createModel('model-1')]);
});

it('rejects incompatible audio parameters before any graph write', async () => {
  const invalid: AIModel = {
    ...createModel('invalid'),
    operation: 'transcription',
    audio: { speech: { voiceId: 'voice', responseFormat: 'mp3' } },
  };
  await expect(mutateStoredAISettings({ operation: 'add-model', model: invalid })).rejects.toThrow(
    'Invalid AI model operation configuration'
  );
  expect(coreMocks.saveAIModels).not.toHaveBeenCalled();
});

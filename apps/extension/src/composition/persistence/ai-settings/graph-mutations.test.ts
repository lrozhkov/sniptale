import { beforeEach, expect, it, vi } from 'vitest';

import type { AIModel, AIProvider } from '../../../contracts/settings';

const coreMocks = vi.hoisted(() => ({
  changeAISecretPassphraseProtection: vi.fn(),
  clearAIProviderSecret: vi.fn(),
  deleteAIProviderGraphRecord: vi.fn(),
  disableAISecretPassphraseProtection: vi.fn(),
  enableAISecretPassphraseProtection: vi.fn(),
  loadAISecretProtectionStatus: vi.fn(),
  loadAIModels: vi.fn(),
  loadAIProviders: vi.fn(),
  loadDefaultModelId: vi.fn(),
  lockAISecretProtection: vi.fn(),
  resetAISecretPassphraseProtection: vi.fn(),
  saveAIModels: vi.fn(),
  saveAIModelGraph: vi.fn(),
  saveChromeAiEnabled: vi.fn(),
  saveDefaultModelId: vi.fn(),
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

let defaultModelId: string | null = null;
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
  coreMocks.loadDefaultModelId.mockImplementation(async () => defaultModelId);
  coreMocks.saveAIModels.mockImplementation(async (nextModels: AIModel[]) => {
    models = nextModels;
  });
  coreMocks.saveAIModelGraph.mockImplementation(
    async (nextModels: AIModel[], nextDefaultModelId: string | null) => {
      models = nextModels;
      defaultModelId = nextDefaultModelId;
    }
  );
  coreMocks.saveDefaultModelId.mockImplementation(async (nextDefaultModelId: string | null) => {
    defaultModelId = nextDefaultModelId;
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
    const deletedModelIds = new Set(
      models.filter((model) => model.providerId === providerId).map(({ id }) => id)
    );
    providers = providers.filter(({ id }) => id !== providerId);
    models = models.filter((model) => model.providerId !== providerId);
    if (defaultModelId && deletedModelIds.has(defaultModelId)) {
      defaultModelId = null;
    }
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetAISettingsMutationQueueForTests();
  providers = [createProvider()];
  models = [];
  defaultModelId = null;
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

it('updates models and default model in one graph write when deleting the default', async () => {
  models = [createModel('model-1'), createModel('model-2')];
  defaultModelId = 'model-1';

  await mutateStoredAISettings({ modelId: 'model-1', operation: 'delete-model' });

  expect(coreMocks.saveAIModelGraph).toHaveBeenCalledWith([createModel('model-2')], null);
  expect(models).toEqual([createModel('model-2')]);
  expect(defaultModelId).toBeNull();
});

it('preserves an unrelated default and accepts valid default changes', async () => {
  models = [createModel('model-1'), createModel('model-2')];
  defaultModelId = 'model-2';

  await mutateStoredAISettings({ modelId: 'model-1', operation: 'delete-model' });
  await mutateStoredAISettings({ defaultModelId: 'model-2', operation: 'save-default-model' });
  await mutateStoredAISettings({ defaultModelId: null, operation: 'save-default-model' });

  expect(coreMocks.saveAIModelGraph).toHaveBeenCalledWith([createModel('model-2')], 'model-2');
  expect(defaultModelId).toBeNull();
});

it('validates provider and default-model commands before writing', async () => {
  const secret = 'provider-secret-value';
  await expect(
    mutateStoredAISettings({
      operation: 'add-provider',
      provider: createProviderInput('provider-1', secret),
    })
  ).rejects.toThrow('Provider provider-1 already exists');
  await expect(
    mutateStoredAISettings({ defaultModelId: 'missing-model', operation: 'save-default-model' })
  ).rejects.toThrow('Default AI model missing-model not found');

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

  expect(coreMocks.clearAIProviderSecret).toHaveBeenCalledWith('provider-1');
  expect(coreMocks.deleteAIProviderGraphRecord).toHaveBeenCalledWith('provider-1');
});

it('cascades provider deletion and keeps the queue usable after a rejected write', async () => {
  models = [createModel('model-1')];
  defaultModelId = 'model-1';
  coreMocks.deleteAIProviderGraphRecord.mockRejectedValueOnce(new Error('graph write failed'));

  await expect(
    mutateStoredAISettings({ operation: 'delete-provider', providerId: 'provider-1' })
  ).rejects.toThrow('graph write failed');
  await mutateStoredAISettings({ modelId: 'model-1', operation: 'delete-model' });

  expect(models).toEqual([]);
  expect(defaultModelId).toBeNull();
});

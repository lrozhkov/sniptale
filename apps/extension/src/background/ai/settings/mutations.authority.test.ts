import { beforeEach, expect, it, vi } from 'vitest';

import type { AIModel, AIProvider } from '../../../contracts/settings';

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}

let models: AIModel[] = [];
let writes: Array<{ models: AIModel[]; release: Deferred }> = [];

const provider: AIProvider = {
  baseUrl: 'https://provider.example.com/v1',
  connectionType: 'openai-compatible',
  createdAt: 1,
  hasStoredApiKey: false,
  id: 'provider-1',
  name: 'Provider 1',
};

function createDeferred(): Deferred {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function createModel(id: string): AIModel {
  return {
    displayName: id,
    id,
    modelCode: `${id}-code`,
    providerId: provider.id,
  };
}

async function waitForWrite(index: number): Promise<void> {
  for (let attempt = 0; attempt < 100 && writes.length <= index; attempt += 1) {
    await Promise.resolve();
  }
  expect(writes.length).toBeGreaterThan(index);
}

const storageMocks = vi.hoisted(() => ({
  initializeAiStorageAccess: vi.fn(),
  loadAISecretProtectionStatus: vi.fn(),
}));

vi.mock('../../../composition/persistence/ai-settings/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/ai-settings/core')>()),
  loadAIModels: vi.fn(async () => [...models]),
  loadAIProviders: vi.fn(async () => [provider]),
  loadDefaultModelId: vi.fn(async () => null),
  loadAISecretProtectionStatus: storageMocks.loadAISecretProtectionStatus,
  saveAIModels: vi.fn(async (nextModels: AIModel[]) => {
    const release = createDeferred();
    writes.push({ models: nextModels, release });
    await release.promise;
    models = nextModels;
  }),
}));

vi.mock('../../../composition/persistence/ai-settings/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/ai-settings/index')>()),
  loadAIModels: vi.fn(async () => [...models]),
  loadAIProviders: vi.fn(async () => [provider]),
  loadDefaultModelId: vi.fn(async () => null),
  saveAIModels: vi.fn(async (nextModels: AIModel[]) => {
    const release = createDeferred();
    writes.push({ models: nextModels, release });
    await release.promise;
    models = nextModels;
  }),
}));

vi.mock('../../../composition/persistence/ai-settings/init', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/ai-settings/init')>()),
  initializeAiStorageAccess: storageMocks.initializeAiStorageAccess,
}));

vi.mock('../../../composition/persistence/ai-settings/graph-invariants', () => ({
  assertAISettingsGraphInvariants: vi.fn(async () => undefined),
}));

import { loadAISecretProtectionStatus } from '../../../composition/persistence/ai-settings';
import { addAIModel } from '../../../composition/persistence/ai-settings/models';
import { mutateAiSettings, resetAiSettingsMutationQueueForTests } from './mutations';

beforeEach(() => {
  models = [];
  writes = [];
  resetAiSettingsMutationQueueForTests();
  storageMocks.initializeAiStorageAccess.mockResolvedValue(undefined);
  storageMocks.loadAISecretProtectionStatus.mockResolvedValue({
    isEnabled: true,
    isUnlocked: true,
    mode: 'passphrase',
  });
});

it('serializes background and persistence facade graph mutations without stale reads', async () => {
  const backgroundMutation = mutateAiSettings({
    model: createModel('model-1'),
    operation: 'add-model',
    type: 'AI_SETTINGS_MUTATION',
  });
  await waitForWrite(0);

  const facadeMutation = addAIModel(createModel('model-2'));
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await Promise.resolve();
  }

  writes[0]?.release.resolve();
  await backgroundMutation;
  await waitForWrite(1);
  writes[1]?.release.resolve();
  await facadeMutation;

  expect(models.map(({ id }) => id)).toEqual(['model-1', 'model-2']);
});

it('orders secret-protection status reads after an in-flight settings mutation', async () => {
  const mutation = mutateAiSettings({
    model: createModel('model-1'),
    operation: 'add-model',
    type: 'AI_SETTINGS_MUTATION',
  });
  await waitForWrite(0);

  const statusRead = loadAISecretProtectionStatus();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await Promise.resolve();
  }
  expect(storageMocks.loadAISecretProtectionStatus).not.toHaveBeenCalled();

  writes[0]?.release.resolve();
  await mutation;
  await expect(statusRead).resolves.toEqual({
    isEnabled: true,
    isUnlocked: true,
    mode: 'passphrase',
  });
  expect(storageMocks.loadAISecretProtectionStatus).toHaveBeenCalledOnce();
});

import { beforeEach, expect, it, vi } from 'vitest';

import type { AIModel, AIProvider } from '../../../contracts/settings';
vi.mock('../../../composition/persistence/infrastructure/browser-storage', () => ({
  browserStorage: { local: { get: vi.fn(async () => ({ sniptale_ai_storage_version: 4 })) } },
}));

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}

let models: AIModel[] = [];
let writes: Array<{ models: AIModel[]; release: Deferred }> = [];
let nextWriteStarted = createDeferred();

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
  if (writes.length <= index) await nextWriteStarted.promise;
  expect(writes.length).toBeGreaterThan(index);
}

async function publishModels(nextModels: AIModel[]): Promise<void> {
  const release = createDeferred();
  writes.push({ models: nextModels, release });
  const started = nextWriteStarted;
  nextWriteStarted = createDeferred();
  started.resolve();
  await release.promise;
  models = nextModels;
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
  saveAIModels: vi.fn(publishModels),
}));

vi.mock('../../../composition/persistence/ai-settings/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/ai-settings/index')>()),
  loadAIModels: vi.fn(async () => [...models]),
  loadAIProviders: vi.fn(async () => [provider]),
  loadDefaultModelId: vi.fn(async () => null),
  saveAIModels: vi.fn(publishModels),
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
  nextWriteStarted = createDeferred();
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
  expect(writes).toHaveLength(1);

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

import { beforeEach, expect, it, vi } from 'vitest';

const mutateStoredAISettingsMock = vi.hoisted(() => vi.fn());

vi.mock('./graph-mutations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./graph-mutations')>()),
  mutateStoredAISettings: mutateStoredAISettingsMock,
}));

import * as facade from './index';
import { addAIModel, deleteAIModel, updateAIModel } from './models';
import { addAIProvider, deleteAIProvider, updateAIProvider } from './providers';
import { loadAISettings } from './settings';

beforeEach(() => {
  vi.clearAllMocks();
  mutateStoredAISettingsMock.mockResolvedValue(undefined);
});

it('keeps the ai storage root as a thin facade over owner-local seams', () => {
  expect(facade.addAIProvider).toBe(addAIProvider);
  expect(facade.updateAIProvider).toBe(updateAIProvider);
  expect(facade.deleteAIProvider).toBe(deleteAIProvider);
  expect(facade.addAIModel).toBe(addAIModel);
  expect(facade.updateAIModel).toBe(updateAIModel);
  expect(facade.deleteAIModel).toBe(deleteAIModel);
  expect(facade.loadAISettings).toBe(loadAISettings);
});

it('routes model and provider facade writes through typed persistence commands', async () => {
  const model = {
    displayName: 'Model',
    id: 'model-1',
    modelCode: 'code',
    providerId: 'provider-1',
  };
  const provider = {
    baseUrl: 'https://provider.example.com/v1',
    connectionType: 'openai-compatible' as const,
    createdAt: 1,
    id: 'provider-1',
    name: 'Provider',
  };

  await addAIModel(model);
  await updateAIModel(model);
  await deleteAIModel(model.id);
  await addAIProvider(provider);
  await updateAIProvider(provider);
  await deleteAIProvider(provider.id);

  expect(mutateStoredAISettingsMock.mock.calls.map(([command]) => command.operation)).toEqual([
    'add-model',
    'update-model',
    'delete-model',
    'add-provider',
    'update-provider',
    'delete-provider',
  ]);
});

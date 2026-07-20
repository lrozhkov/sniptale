import { beforeEach, expect, it, vi } from 'vitest';

const loaderMocks = vi.hoisted(() => ({
  reconcileSelectedAIModelIdMock: vi.fn(),
}));

vi.mock('../../../../../../features/ai/selection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../features/ai/selection')>()),
  reconcileSelectedAIModelId: loaderMocks.reconcileSelectedAIModelIdMock,
}));

import type { AIModel } from '../../../../../../contracts/settings';
import { ensureDefaultAiProvidersModel } from './default-model';

const MODELS: AIModel[] = [
  {
    id: 'model-1',
    providerId: 'provider-1',
    modelCode: 'llama3.2',
    displayName: 'Llama 3.2',
    systemPrompt: '',
  },
  {
    id: 'model-2',
    providerId: 'provider-1',
    modelCode: 'phi4',
    displayName: 'Phi 4',
    systemPrompt: '',
  },
];

beforeEach(() => {
  loaderMocks.reconcileSelectedAIModelIdMock.mockReset();
});

it('skips the default-model fallback when a default already exists or there are no models', async () => {
  const setDefaultModelId = vi.fn();
  loaderMocks.reconcileSelectedAIModelIdMock
    .mockResolvedValueOnce('model-2')
    .mockResolvedValueOnce(null);

  await ensureDefaultAiProvidersModel('model-2', MODELS, setDefaultModelId);
  await ensureDefaultAiProvidersModel(null, [], setDefaultModelId);

  expect(setDefaultModelId).not.toHaveBeenCalled();
  expect(loaderMocks.reconcileSelectedAIModelIdMock).toHaveBeenCalledTimes(2);
});

it('selects and persists the first loaded model when no default exists', async () => {
  const setDefaultModelId = vi.fn();
  loaderMocks.reconcileSelectedAIModelIdMock.mockResolvedValue('model-1');

  await ensureDefaultAiProvidersModel(null, MODELS, setDefaultModelId);

  expect(setDefaultModelId).toHaveBeenCalledWith('model-1');
});

it('replaces a stale stored default with the first available model', async () => {
  const setDefaultModelId = vi.fn();
  loaderMocks.reconcileSelectedAIModelIdMock.mockResolvedValue('model-1');

  await ensureDefaultAiProvidersModel('model-missing', MODELS, setDefaultModelId);

  expect(setDefaultModelId).toHaveBeenCalledWith('model-1');
});

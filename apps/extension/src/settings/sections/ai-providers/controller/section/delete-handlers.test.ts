import { expect, it, vi } from 'vitest';

const deleteMocks = vi.hoisted(() => ({
  handleAiProvidersDeleteMock: vi.fn(),
}));

vi.mock('../delete-actions', () => ({
  handleAiProvidersDelete: deleteMocks.handleAiProvidersDeleteMock,
}));

import type { AIModel, AIProvider } from '../../../../../contracts/settings';
import { useAiProvidersDeleteHandlers } from './delete-handlers';

const PROVIDER: AIProvider = {
  id: 'provider-1',
  name: 'OpenAI',
  connectionType: 'openai-compatible',
  baseUrl: 'https://api.openai.com/v1',
  hasStoredApiKey: true,
  createdAt: 1,
};

const MODEL: AIModel = {
  id: 'model-1',
  providerId: 'provider-1',
  modelCode: 'gpt-4.1',
  displayName: 'GPT 4.1',
  systemPrompt: '',
};

it('routes delete actions only for the matching confirm target type', async () => {
  const reloadData = vi.fn().mockResolvedValue(undefined);
  const setConfirmDelete = vi.fn();
  const handlers = useAiProvidersDeleteHandlers({
    confirmDelete: { type: 'provider', item: PROVIDER },
    reloadData,
    setConfirmDelete,
  });

  await handlers.handleDeleteProvider();
  await handlers.handleDeleteModel();

  expect(deleteMocks.handleAiProvidersDeleteMock).toHaveBeenCalledTimes(1);
  expect(deleteMocks.handleAiProvidersDeleteMock).toHaveBeenCalledWith({
    confirmDelete: { type: 'provider', item: PROVIDER },
    reloadData,
    setConfirmDelete,
  });
});

it('routes model deletes and ignores a missing confirm target', async () => {
  const handlers = useAiProvidersDeleteHandlers({
    confirmDelete: { type: 'model', item: MODEL },
    reloadData: vi.fn().mockResolvedValue(undefined),
    setConfirmDelete: vi.fn(),
  });

  await handlers.handleDeleteModel();

  expect(deleteMocks.handleAiProvidersDeleteMock).toHaveBeenCalledWith({
    confirmDelete: { type: 'model', item: MODEL },
    reloadData: expect.any(Function),
    setConfirmDelete: expect.any(Function),
  });

  deleteMocks.handleAiProvidersDeleteMock.mockClear();

  const noTargetHandlers = useAiProvidersDeleteHandlers({
    confirmDelete: null,
    reloadData: vi.fn(),
    setConfirmDelete: vi.fn(),
  });

  await noTargetHandlers.handleDeleteProvider();
  await noTargetHandlers.handleDeleteModel();

  expect(deleteMocks.handleAiProvidersDeleteMock).not.toHaveBeenCalled();
});

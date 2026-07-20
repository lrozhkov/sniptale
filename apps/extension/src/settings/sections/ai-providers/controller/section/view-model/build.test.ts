import { expect, it, vi } from 'vitest';

const buildMocks = vi.hoisted(() => ({
  buildAiProvidersModelOptionsMock: vi.fn(),
}));

vi.mock('../../model-options', () => ({
  buildAiProvidersModelOptions: buildMocks.buildAiProvidersModelOptionsMock,
}));

import { buildAiProvidersSectionControllerState } from './build';

function createBuildDataState() {
  return {
    chromeAiEnabled: false,
    defaultModelId: 'model-1',
    isLoading: false,
    models: [{ id: 'model-1', providerId: 'provider-1' }] as never,
    providers: [{ id: 'provider-1', name: 'OpenAI' }] as never,
    selection: {
      models: [{ id: 'model-1', providerId: 'provider-1' }] as never,
      providers: [{ id: 'provider-1', name: 'OpenAI' }] as never,
    },
  };
}

function createBuildArgs() {
  const actions = {
    getProviderName: vi.fn(),
    handleClearProviderSecret: vi.fn(),
    handleDefaultModelChange: vi.fn(),
    handleDeleteModel: vi.fn(),
    handleDeleteProvider: vi.fn(),
    reloadData: vi.fn(),
  };
  const chromeAi = { availability: 'available', enabled: false } as never;
  const secretProtection = {
    status: { isEnabled: false, isUnlocked: true, mode: 'transparent' },
  } as never;
  const modals = { confirmDelete: null, model: { open: false }, provider: { open: false } };
  const prompts = { global: { value: 'Global' }, scenarioEditor: { value: 'Scenario' } };

  return {
    args: {
      chromeAi,
      secretProtection,
      dataState: createBuildDataState(),
      deleteHandlers: {
        handleDeleteModel: actions.handleDeleteModel,
        handleDeleteProvider: actions.handleDeleteProvider,
      },
      handleClearProviderSecret: actions.handleClearProviderSecret,
      getProviderName: actions.getProviderName,
      handleDefaultModelChange: actions.handleDefaultModelChange,
      modalState: modals as never,
      prompts: prompts as never,
      reloadData: actions.reloadData,
    },
    ...actions,
    modals,
    prompts,
  };
}

it('builds the ai providers controller state from owner-local props', () => {
  const {
    args,
    getProviderName,
    handleDefaultModelChange,
    handleDeleteModel,
    handleDeleteProvider,
    handleClearProviderSecret,
    modals,
    prompts,
    reloadData,
  } = createBuildArgs();
  buildMocks.buildAiProvidersModelOptionsMock.mockReturnValue([{ label: 'OpenAI / GPT 4.1' }]);

  const state = buildAiProvidersSectionControllerState(args);

  expect(buildMocks.buildAiProvidersModelOptionsMock).toHaveBeenCalledWith({
    getProviderName,
    models: [{ id: 'model-1', providerId: 'provider-1' }],
  });
  expect(state).toMatchObject({
    chromeAi: expect.objectContaining({ availability: 'available' }),
    secretProtection: expect.objectContaining({
      status: { isEnabled: false, isUnlocked: true, mode: 'transparent' },
    }),
    defaultModelId: 'model-1',
    handleDeleteModel,
    handleDeleteProvider,
    handleClearProviderSecret,
    handleDefaultModelChange,
    isLoading: false,
    modelOptions: [{ label: 'OpenAI / GPT 4.1' }],
    modals,
    prompts,
    reloadData,
  });
});

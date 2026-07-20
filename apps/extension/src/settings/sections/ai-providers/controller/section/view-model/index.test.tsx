import { expect, it, vi } from 'vitest';

const controllerMocks = vi.hoisted(() => ({
  buildAiProvidersSectionControllerStateMock: vi.fn(),
  useAiProvidersSectionControllerDependenciesMock: vi.fn(),
}));

vi.mock('./build', async (importOriginal) => {
  const original = await importOriginal<typeof import('./build')>();

  return {
    ...original,
    buildAiProvidersSectionControllerState:
      controllerMocks.buildAiProvidersSectionControllerStateMock,
  };
});

vi.mock('./dependencies', () => ({
  useAiProvidersSectionControllerDependencies:
    controllerMocks.useAiProvidersSectionControllerDependenciesMock,
}));

import { useAiProvidersSectionController } from '.';

function createControllerDependencies() {
  return {
    dataState: {
      defaultModelId: 'model-1',
      isLoading: false,
      models: [],
      providers: [],
    },
    deleteHandlers: {
      handleDeleteModel: vi.fn(),
      handleDeleteProvider: vi.fn(),
    },
    getProviderName: vi.fn(),
    handleDefaultModelChange: vi.fn(),
    modalState: {
      confirmDelete: null,
      closeModelModal: vi.fn(),
      closeProviderModal: vi.fn(),
      model: { open: false },
      openModelModal: vi.fn(),
      openProviderModal: vi.fn(),
      provider: { open: false },
      setConfirmDelete: vi.fn(),
    },
    prompts: {
      global: {
        handleResizeStart: vi.fn(),
        handleSave: vi.fn(),
        setValue: vi.fn(),
        textareaRef: { current: null },
        value: 'Global prompt',
      },
      scenarioEditor: {
        handleResizeStart: vi.fn(),
        handleSave: vi.fn(),
        setValue: vi.fn(),
        textareaRef: { current: null },
        value: 'Scenario prompt',
      },
    },
    reloadData: vi.fn(),
  };
}

it('keeps the controller facade thin', () => {
  const dependencies = createControllerDependencies();
  const controllerState = { ok: true };

  controllerMocks.useAiProvidersSectionControllerDependenciesMock.mockReturnValue(dependencies);
  controllerMocks.buildAiProvidersSectionControllerStateMock.mockReturnValue(controllerState);

  expect(useAiProvidersSectionController()).toBe(controllerState);
  expect(controllerMocks.useAiProvidersSectionControllerDependenciesMock).toHaveBeenCalled();
  expect(controllerMocks.buildAiProvidersSectionControllerStateMock).toHaveBeenCalledWith(
    dependencies
  );
});

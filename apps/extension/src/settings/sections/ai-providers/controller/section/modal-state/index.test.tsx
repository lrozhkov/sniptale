import { beforeEach, expect, it, vi } from 'vitest';

const controllerMocks = vi.hoisted(() => ({
  useDeleteStateMock: vi.fn(),
  useModelModalStateMock: vi.fn(),
  useProviderModalStateMock: vi.fn(),
}));

vi.mock('../delete-state', () => ({
  useDeleteState: controllerMocks.useDeleteStateMock,
}));

vi.mock('../model-modal', () => ({
  useModelModalState: controllerMocks.useModelModalStateMock,
}));

vi.mock('../provider-modal', () => ({
  useProviderModalState: controllerMocks.useProviderModalStateMock,
}));

import { useAiProvidersModalState } from '.';

beforeEach(() => {
  vi.clearAllMocks();
  controllerMocks.useProviderModalStateMock.mockReturnValue({
    closeProviderModal: vi.fn(),
    openProviderModal: vi.fn(),
    providerModal: { open: true },
  });
  controllerMocks.useModelModalStateMock.mockReturnValue({
    closeModelModal: vi.fn(),
    modelModal: { open: true },
    openModelModal: vi.fn(),
  });
  controllerMocks.useDeleteStateMock.mockReturnValue({
    confirmDelete: null,
    setConfirmDelete: vi.fn(),
  });
});

it('composes the modal owners without adding local state', () => {
  const state = useAiProvidersModalState();

  expect(state).toEqual({
    closeModelModal: expect.any(Function),
    closeProviderModal: expect.any(Function),
    confirmDelete: null,
    modelModal: { open: true },
    openModelModal: expect.any(Function),
    openProviderModal: expect.any(Function),
    providerModal: { open: true },
    setConfirmDelete: expect.any(Function),
  });
  expect(controllerMocks.useProviderModalStateMock).toHaveBeenCalledTimes(1);
  expect(controllerMocks.useModelModalStateMock).toHaveBeenCalledTimes(1);
  expect(controllerMocks.useDeleteStateMock).toHaveBeenCalledTimes(1);
});

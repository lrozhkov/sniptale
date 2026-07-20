import { beforeEach, expect, it, vi } from 'vitest';

const displayModeMocks = vi.hoisted(() => ({
  loggerErrorMock: vi.fn(),
  saveQuickActionsDisplayModeMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock('../../../composition/persistence/quick-actions', async (importOriginal) => ({
  ...(await importOriginal()),
  saveQuickActionsDisplayMode: displayModeMocks.saveQuickActionsDisplayModeMock,
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    error: displayModeMocks.loggerErrorMock,
  }),
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal()),
  toast: {
    error: displayModeMocks.toastErrorMock,
  },
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => `t:${key}`,
}));

import { persistDisplayMode } from './display-mode';

beforeEach(() => {
  displayModeMocks.loggerErrorMock.mockReset();
  displayModeMocks.saveQuickActionsDisplayModeMock.mockReset();
  displayModeMocks.toastErrorMock.mockReset();
});

it('persists the display mode and confirms the save', async () => {
  const setDisplayModeState = vi.fn();
  const onConfirm = vi.fn();

  displayModeMocks.saveQuickActionsDisplayModeMock.mockResolvedValue(undefined);

  await persistDisplayMode('list', 'hidden', setDisplayModeState, onConfirm);

  expect(setDisplayModeState).toHaveBeenCalledWith('hidden');
  expect(displayModeMocks.saveQuickActionsDisplayModeMock).toHaveBeenCalledWith('hidden');
  expect(onConfirm).toHaveBeenCalledWith('t:settings.quickActions.messageSettingSaved');
});

it('does not update local state when the display mode save fails', async () => {
  const setDisplayModeState = vi.fn();
  const onConfirm = vi.fn();
  const saveError = new Error('save failed');

  displayModeMocks.saveQuickActionsDisplayModeMock.mockRejectedValueOnce(saveError);

  await persistDisplayMode('list', 'hidden', setDisplayModeState, onConfirm);

  expect(setDisplayModeState).not.toHaveBeenCalled();
  expect(onConfirm).not.toHaveBeenCalled();
  expect(displayModeMocks.loggerErrorMock).toHaveBeenCalledWith(
    'Failed to save quick actions display mode',
    saveError
  );
  expect(displayModeMocks.toastErrorMock).toHaveBeenCalledWith(
    't:common.states.errort:settings.quickActions.messageSaveErrorSuffix'
  );
});

it('skips persistence work when the requested display mode already matches local state', async () => {
  const setDisplayModeState = vi.fn();
  const onConfirm = vi.fn();

  await persistDisplayMode('list', 'list', setDisplayModeState, onConfirm);

  expect(displayModeMocks.saveQuickActionsDisplayModeMock).not.toHaveBeenCalled();
  expect(setDisplayModeState).not.toHaveBeenCalled();
  expect(onConfirm).not.toHaveBeenCalled();
});

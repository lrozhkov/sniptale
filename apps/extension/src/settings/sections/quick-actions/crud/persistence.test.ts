import { beforeEach, expect, it, vi } from 'vitest';

const persistenceMocks = vi.hoisted(() => ({
  saveQuickActionsMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock('../../../../composition/persistence/quick-actions', async (importOriginal) => ({
  ...(await importOriginal()),
  saveQuickActions: persistenceMocks.saveQuickActionsMock,
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    error: persistenceMocks.loggerErrorMock,
  }),
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal()),
  toast: {
    error: persistenceMocks.toastErrorMock,
  },
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
}));

import type { QuickAction } from '../../../../contracts/settings';
import { persistQuickActions } from './persistence';

function createQuickAction(): QuickAction {
  return {
    afterCapture: 'download_default',
    bundledId: null,
    delay: null,
    emulation: 'native',
    exitAfterCapture: false,
    hotkey: null,
    icon: 'Camera',
    id: 'action-1',
    imageFormat: null,
    imageQuality: null,
    name: 'Action',
    origin: 'user',
    screenshotMode: 'visible',
    status: true,
  };
}

beforeEach(() => {
  persistenceMocks.saveQuickActionsMock.mockReset();
  persistenceMocks.saveQuickActionsMock.mockResolvedValue(undefined);
  persistenceMocks.loggerErrorMock.mockReset();
  persistenceMocks.toastErrorMock.mockReset();
});

it('persists actions and reports storage failures', async () => {
  const setActions = vi.fn();
  const actions = [createQuickAction()];
  const saveError = new Error('save failed');

  await persistQuickActions(actions, setActions);
  expect(persistenceMocks.saveQuickActionsMock).toHaveBeenCalledWith(actions);
  expect(setActions).toHaveBeenCalledWith(actions);

  persistenceMocks.saveQuickActionsMock.mockRejectedValueOnce(saveError);
  await persistQuickActions(actions, setActions);

  expect(persistenceMocks.loggerErrorMock).toHaveBeenCalledWith(
    'Failed to save quick actions',
    saveError
  );
  expect(persistenceMocks.toastErrorMock).toHaveBeenCalledWith(
    'common.states.errorsettings.quickActions.messageSaveErrorSuffix'
  );
});

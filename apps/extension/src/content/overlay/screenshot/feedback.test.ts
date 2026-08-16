import { expect, it, vi } from 'vitest';
import { restoreVisibleUiState } from './feedback';
import type { ScreenshotControllerRuntimeSession } from './types';

vi.mock('../../selection/locker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../selection/locker')>()),
  disableNavigationLock: vi.fn(),
  enableNavigationLock: vi.fn(),
  setUIHidden: vi.fn(),
}));

it('restores the editing mode suspended by area selection exactly once', () => {
  const restoreEditingMode = vi.fn();
  const session: ScreenshotControllerRuntimeSession = {
    editingModeBaseline: 'drawing',
    navigationLockBaseline: false,
    runActive: true,
    runGeneration: 1,
  };
  const runtime = {
    restoreEditingMode,
    session,
    setIsCompletelyHidden: vi.fn(),
    setIsToolbarVisible: vi.fn(),
    setNavigationLockEnabled: vi.fn(),
  };

  restoreVisibleUiState(runtime, 1);
  restoreVisibleUiState(runtime, 1);

  expect(restoreEditingMode).toHaveBeenCalledOnce();
  expect(restoreEditingMode).toHaveBeenCalledWith('drawing');
  expect(runtime.session.editingModeBaseline).toBeNull();
});

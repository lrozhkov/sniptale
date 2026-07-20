// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';

const useEffectMock = vi.hoisted(() => vi.fn());

vi.mock('react', () => ({ useEffect: useEffectMock }));

import { usePopupExportCleanup } from './cleanup';

function resetCleanupMocks() {
  vi.restoreAllMocks();
  useEffectMock.mockReset();
}

it('clears the pending copy-reset timeout on cleanup', () => {
  resetCleanupMocks();
  const clearTimeoutMock = vi.spyOn(window, 'clearTimeout').mockImplementation(() => undefined);
  let cleanup: (() => void) | undefined;

  useEffectMock.mockImplementation((effect: () => () => void) => {
    cleanup = effect();
  });

  usePopupExportCleanup({ current: 42 } as never);
  cleanup?.();

  expect(clearTimeoutMock).toHaveBeenCalledWith(42);
});

it('skips timeout cleanup when there is no pending timeout', () => {
  resetCleanupMocks();
  const clearTimeoutMock = vi.spyOn(window, 'clearTimeout').mockImplementation(() => undefined);
  let cleanup: (() => void) | undefined;

  useEffectMock.mockImplementation((effect: () => () => void) => {
    cleanup = effect();
  });

  usePopupExportCleanup({ current: null } as never);
  cleanup?.();

  expect(clearTimeoutMock).not.toHaveBeenCalled();
});

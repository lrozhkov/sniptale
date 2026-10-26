// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ get: vi.fn(), subscribe: vi.fn(), send: vi.fn() }));
vi.mock('../../../composition/persistence/infrastructure/browser-storage', () => ({
  browserStorage: {
    sync: { get: mocks.get },
    canObserveChanges: () => true,
    subscribeToChanges: mocks.subscribe,
  },
}));
vi.mock('../../application/runtime-services/services', () => ({
  getContentRuntimeServices: () => ({ messaging: { sendRuntimeMessage: mocks.send } }),
}));
import { usePageLaunchPreferences } from './preferences';
let value: ReturnType<typeof usePageLaunchPreferences>;
function Consumer() {
  value = usePageLaunchPreferences();
  return null;
}
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.get.mockReset();
  mocks.subscribe.mockReset();
  mocks.subscribe.mockReturnValue(vi.fn());
  root = createRoot(document.createElement('div'));
});
afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});
it('keeps the newest accepted storage read when an older opening read finishes later', async () => {
  let old!: (value: Record<string, unknown>) => void;
  mocks.get.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        old = resolve;
      })
  );
  await act(async () => root.render(<Consumer />));
  mocks.get.mockResolvedValue({
    sniptale_settings: { pageLaunch: { corner: 'top-left', quickActionsCorner: true } },
  });
  await act(async () => {
    mocks.subscribe.mock.calls[0]![0]({ sniptale_settings: {} }, 'sync');
  });
  expect(value.preferences.corner).toBe('top-left');
  await act(async () => old({ sniptale_settings: { pageLaunch: { corner: 'bottom-right' } } }));
  expect(value.preferences.corner).toBe('top-left');
  expect(value.preferences.quickActionsCorner).toBe(true);
});
it('opening has defaults and synthetic corner commands cannot write', async () => {
  mocks.get.mockResolvedValue({});
  await act(async () => root.render(<Consumer />));
  expect(value.preferences.enabled).toBe(false);
  expect(value.preferences.quickActionsPopup).toBe(true);
  await expect(value.saveCorner('top-left', new Event('click'))).rejects.toThrow('Trusted');
  expect(mocks.send).not.toHaveBeenCalled();
});

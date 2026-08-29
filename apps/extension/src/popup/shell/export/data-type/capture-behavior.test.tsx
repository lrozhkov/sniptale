// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ loadSettings: vi.fn(), patchSettings: vi.fn() }));
vi.mock('../../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/settings')>()),
  loadSettings: mocks.loadSettings,
  patchSettings: mocks.patchSettings,
}));

import { usePackageCaptureBehaviorPreferences } from './capture-behavior';

let container: HTMLDivElement;
let root: Root;

function Harness() {
  const state = usePackageCaptureBehaviorPreferences();
  return (
    <div>
      <output>
        {state.preferences.floatingElements}:{String(state.preferences.freezeMotion)}:
        {String(state.preferences.preloadLazyContent)}
      </output>
      <button
        type="button"
        onClick={() =>
          state.update({ floatingElements: 'hide', freezeMotion: false, preloadLazyContent: false })
        }
      >
        update
      </button>
    </div>
  );
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  mocks.loadSettings.mockResolvedValue({
    fullPageCapture: {
      floatingElements: 'once',
      freezeMotion: true,
      preloadLazyContent: true,
    },
  });
  mocks.patchSettings.mockResolvedValue(undefined);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('loads and persists the shared full-page capture behavior', async () => {
  await act(async () => root.render(<Harness />));
  await act(async () => Promise.resolve());
  expect(container.querySelector('output')?.textContent).toBe('once:true:true');

  await act(async () => container.querySelector('button')?.click());

  expect(container.querySelector('output')?.textContent).toBe('hide:false:false');
  expect(mocks.patchSettings).toHaveBeenCalledWith({
    fullPageCapture: {
      floatingElements: 'hide',
      freezeMotion: false,
      preloadLazyContent: false,
    },
  });
});

it('restores the canonical stored value after a failed write', async () => {
  mocks.patchSettings.mockRejectedValueOnce(new Error('write failed'));
  mocks.loadSettings
    .mockResolvedValueOnce({
      fullPageCapture: {
        floatingElements: 'once',
        freezeMotion: true,
        preloadLazyContent: true,
      },
    })
    .mockResolvedValueOnce({
      fullPageCapture: {
        floatingElements: 'repeat',
        freezeMotion: true,
        preloadLazyContent: false,
      },
    });
  await act(async () => root.render(<Harness />));
  await act(async () => Promise.resolve());
  await act(async () => container.querySelector('button')?.click());
  await act(async () => Promise.resolve());

  expect(container.querySelector('output')?.textContent).toBe('repeat:true:false');
});

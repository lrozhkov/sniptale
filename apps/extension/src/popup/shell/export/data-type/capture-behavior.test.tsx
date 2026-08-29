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

import {
  PackageCaptureBehaviorSettings,
  usePackageCaptureBehaviorPreferences,
} from './capture-behavior';

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
      <output data-testid="limits">
        {state.resourceLimits.maxFileCount}:{state.resourceLimits.maxFileSizeMiB}:
        {state.resourceLimits.maxTotalSizeMiB}
      </output>
      <button
        type="button"
        onClick={() =>
          state.update({ floatingElements: 'hide', freezeMotion: false, preloadLazyContent: false })
        }
      >
        update
      </button>
      <button
        type="button"
        data-testid="update-limits"
        onClick={() =>
          state.updateResourceLimits({
            maxFileCount: 50,
            maxFileSizeMiB: 20,
            maxTotalSizeMiB: 100,
          })
        }
      >
        update limits
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
    exportResourceLimits: { maxFileCount: 30, maxFileSizeMiB: 30, maxTotalSizeMiB: 150 },
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
      exportResourceLimits: { maxFileCount: 30, maxFileSizeMiB: 30, maxTotalSizeMiB: 150 },
      fullPageCapture: {
        floatingElements: 'once',
        freezeMotion: true,
        preloadLazyContent: true,
      },
    })
    .mockResolvedValueOnce({
      exportResourceLimits: { maxFileCount: 30, maxFileSizeMiB: 30, maxTotalSizeMiB: 150 },
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

it('persists attachment limits through the canonical settings patch', async () => {
  await act(async () => root.render(<Harness />));
  await act(async () => Promise.resolve());
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[data-testid="update-limits"]')?.click()
  );

  expect(container.querySelector('[data-testid="limits"]')?.textContent).toBe('50:20:100');
  expect(mocks.patchSettings).toHaveBeenCalledWith({
    exportResourceLimits: { maxFileCount: 50, maxFileSizeMiB: 20, maxTotalSizeMiB: 100 },
  });
});

it('restores stored attachment limits after a failed write', async () => {
  mocks.patchSettings.mockRejectedValueOnce(new Error('write failed'));
  mocks.loadSettings
    .mockResolvedValueOnce({
      exportResourceLimits: { maxFileCount: 30, maxFileSizeMiB: 30, maxTotalSizeMiB: 150 },
      fullPageCapture: {
        floatingElements: 'once',
        freezeMotion: true,
        preloadLazyContent: true,
      },
    })
    .mockResolvedValueOnce({
      exportResourceLimits: { maxFileCount: 20, maxFileSizeMiB: 10, maxTotalSizeMiB: 50 },
      fullPageCapture: {
        floatingElements: 'once',
        freezeMotion: true,
        preloadLazyContent: true,
      },
    });
  await act(async () => root.render(<Harness />));
  await act(async () => Promise.resolve());
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[data-testid="update-limits"]')?.click()
  );
  await act(async () => Promise.resolve());

  expect(container.querySelector('[data-testid="limits"]')?.textContent).toBe('20:10:50');
});

it('updates each compact resource limit control and displays custom stored values', async () => {
  const onResourceLimitsChange = vi.fn();
  await act(async () =>
    root.render(
      <PackageCaptureBehaviorSettings
        preferences={{ floatingElements: 'once', freezeMotion: true, preloadLazyContent: true }}
        onChange={vi.fn()}
        resourceLimits={{ maxFileCount: 17, maxFileSizeMiB: 19, maxTotalSizeMiB: 77 }}
        onResourceLimitsChange={onResourceLimitsChange}
      />
    )
  );
  const selects = container.querySelectorAll('select');
  expect(selects).toHaveLength(4);

  for (const [index, value] of [
    [1, '20'],
    [2, '30'],
    [3, '100'],
  ] as const) {
    await act(async () => {
      const select = selects.item(index);
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  expect(onResourceLimitsChange.mock.calls).toEqual([
    [{ maxFileCount: 20, maxFileSizeMiB: 19, maxTotalSizeMiB: 77 }],
    [{ maxFileCount: 17, maxFileSizeMiB: 30, maxTotalSizeMiB: 77 }],
    [{ maxFileCount: 17, maxFileSizeMiB: 19, maxTotalSizeMiB: 100 }],
  ]);
});

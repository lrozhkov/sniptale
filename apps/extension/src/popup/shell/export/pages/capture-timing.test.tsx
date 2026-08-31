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

import { PageCaptureTimingSettings, usePageCaptureTimingPreferences } from './capture-timing';

let container: HTMLDivElement;
let root: Root;

function Harness() {
  const preferences = usePageCaptureTimingPreferences();
  return (
    <div>
      <output>
        {preferences.timing.loadTimeoutMs}:{preferences.timing.settleDelayMs}
      </output>
      <button
        type="button"
        onClick={() => preferences.update({ loadTimeoutMs: 60_000, settleDelayMs: 3_000 })}
      >
        first
      </button>
      <button
        type="button"
        onClick={() => preferences.update({ loadTimeoutMs: 120_000, settleDelayMs: 5_000 })}
      >
        second
      </button>
    </div>
  );
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.loadSettings.mockResolvedValue({
    pagePackageCaptureTiming: { loadTimeoutMs: 30_000, settleDelayMs: 2_000 },
  });
  mocks.patchSettings.mockResolvedValue(undefined);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('loads the persisted timing and saves an optimistic update', async () => {
  await act(async () => root.render(<Harness />));
  await act(async () => Promise.resolve());
  expect(container.querySelector('output')?.textContent).toBe('30000:2000');
  await act(async () => container.querySelector('button')?.click());
  expect(container.querySelector('output')?.textContent).toBe('60000:3000');
  expect(mocks.patchSettings).toHaveBeenCalledWith({
    pagePackageCaptureTiming: { loadTimeoutMs: 60_000, settleDelayMs: 3_000 },
  });
});

it('restores persisted timing when a write fails', async () => {
  mocks.patchSettings.mockRejectedValueOnce(new Error('write failed'));
  mocks.loadSettings
    .mockResolvedValueOnce({
      pagePackageCaptureTiming: { loadTimeoutMs: 30_000, settleDelayMs: 2_000 },
    })
    .mockResolvedValueOnce({
      pagePackageCaptureTiming: { loadTimeoutMs: 15_000, settleDelayMs: 1_000 },
    });
  await act(async () => root.render(<Harness />));
  await act(async () => Promise.resolve());
  await act(async () => container.querySelector('button')?.click());
  await act(async () => Promise.resolve());
  expect(container.querySelector('output')?.textContent).toBe('15000:1000');
});

it('keeps defaults when storage cannot be read', async () => {
  mocks.loadSettings.mockRejectedValueOnce(new Error('unavailable'));
  await act(async () => root.render(<Harness />));
  await act(async () => Promise.resolve());
  expect(container.querySelector('output')?.textContent).toBe('30000:2000');
});

it('does not let a late initial read overwrite a user update', async () => {
  let resolveInitial!: (settings: {
    pagePackageCaptureTiming: { loadTimeoutMs: number; settleDelayMs: number };
  }) => void;
  mocks.loadSettings.mockImplementationOnce(
    () => new Promise((resolve) => (resolveInitial = resolve))
  );
  await act(async () => root.render(<Harness />));
  await act(async () => container.querySelectorAll('button')[0]?.click());
  await act(async () =>
    resolveInitial({ pagePackageCaptureTiming: { loadTimeoutMs: 15_000, settleDelayMs: 0 } })
  );
  expect(container.querySelector('output')?.textContent).toBe('60000:3000');
});

it('does not let an earlier failed write rollback a later successful update', async () => {
  let rejectFirst!: (error: Error) => void;
  let resolveReload!: (settings: {
    pagePackageCaptureTiming: { loadTimeoutMs: number; settleDelayMs: number };
  }) => void;
  mocks.patchSettings
    .mockImplementationOnce(() => new Promise((_, reject) => (rejectFirst = reject)))
    .mockResolvedValueOnce(undefined);
  await act(async () => root.render(<Harness />));
  await act(async () => Promise.resolve());
  await act(async () => container.querySelectorAll('button')[0]?.click());
  mocks.loadSettings.mockImplementationOnce(
    () => new Promise((resolve) => (resolveReload = resolve))
  );
  await act(async () => rejectFirst(new Error('first failed')));
  await act(async () => container.querySelectorAll('button')[1]?.click());
  await act(async () =>
    resolveReload({ pagePackageCaptureTiming: { loadTimeoutMs: 30_000, settleDelayMs: 2_000 } })
  );
  expect(container.querySelector('output')?.textContent).toBe('120000:5000');
});

it('keeps page timing selects compact inside the settings curtain', async () => {
  await act(async () =>
    root.render(
      <PageCaptureTimingSettings
        timing={{ loadTimeoutMs: 30_000, settleDelayMs: 2_000 }}
        onChange={vi.fn()}
      />
    )
  );

  const selects = container.querySelectorAll('[data-ui="popup.export.page-timing-select"]');
  expect(selects).toHaveLength(2);
  for (const select of selects) {
    expect(select.className).toContain('!w-[104px]');
    expect(select.className).toContain('!max-w-[104px]');
  }
});

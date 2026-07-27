// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const pinSessionMocks = vi.hoisted(() => ({
  load: vi.fn(),
  write: vi.fn(),
  writeVisibility: vi.fn(),
}));

vi.mock('./pin-session', () => ({
  loadContentPinToTabSessionState: pinSessionMocks.load,
  readContentPinToTabSessionState: () => false,
  writeContentPinToTabSessionState: pinSessionMocks.write,
  writeContentPinToTabToolbarVisibilityState: pinSessionMocks.writeVisibility,
}));

import { useContentSurfaceState } from './surface';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useContentSurfaceState> | null = null;

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function Harness() {
  latestState = useContentSurfaceState();
  return null;
}

function getLatestState() {
  expect(latestState).not.toBeNull();
  return latestState as ReturnType<typeof useContentSurfaceState>;
}

async function renderHarness() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(<Harness />);
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  pinSessionMocks.load.mockReset();
  pinSessionMocks.load.mockResolvedValue({
    pinToTab: false,
    pinToTabAvailable: true,
  });
  pinSessionMocks.write.mockReset();
  pinSessionMocks.write.mockImplementation(async (value: boolean) => ({
    pinToTabAvailable: true,
    status: 'acknowledged',
    value,
  }));
  pinSessionMocks.writeVisibility.mockReset();
  pinSessionMocks.writeVisibility.mockResolvedValue(undefined);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  latestState = null;
  vi.unstubAllGlobals();
});

it('rolls the optimistic pin toggle back when background persistence fails', async () => {
  pinSessionMocks.write.mockRejectedValueOnce(new Error('runtime unavailable'));
  await renderHarness();

  act(() => {
    getLatestState().setPinToTab(true);
  });
  expect(getLatestState().pinToTab).toBe(true);

  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(getLatestState().pinToTab).toBe(false);
});

it('refreshes pin availability when the tab regains focus after permission changes', async () => {
  pinSessionMocks.load
    .mockResolvedValueOnce({ pinToTab: true, pinToTabAvailable: true })
    .mockResolvedValueOnce({ pinToTab: false, pinToTabAvailable: false });
  await renderHarness();

  expect(getLatestState().pinToTab).toBe(true);
  expect(getLatestState().pinToTabAvailable).toBe(true);

  await act(async () => {
    window.dispatchEvent(new Event('focus'));
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(getLatestState().pinToTab).toBe(false);
  expect(getLatestState().pinToTabAvailable).toBe(false);
});

it('does not let a focus refresh started during a write overwrite its newer acknowledgement', async () => {
  const write = createDeferred<{
    pinToTabAvailable: boolean;
    status: 'acknowledged';
    value: boolean;
  }>();
  const staleRefresh = createDeferred<{ pinToTab: boolean; pinToTabAvailable: boolean }>();
  pinSessionMocks.load
    .mockResolvedValueOnce({ pinToTab: false, pinToTabAvailable: true })
    .mockReturnValueOnce(staleRefresh.promise);
  pinSessionMocks.write.mockReturnValueOnce(write.promise);
  await renderHarness();

  act(() => {
    getLatestState().setPinToTab(true);
  });
  act(() => {
    window.dispatchEvent(new Event('focus'));
  });

  await act(async () => {
    write.resolve({ pinToTabAvailable: true, status: 'acknowledged', value: true });
    await Promise.resolve();
  });
  await act(async () => {
    staleRefresh.resolve({ pinToTab: false, pinToTabAvailable: false });
    await Promise.resolve();
  });

  expect(getLatestState().pinToTab).toBe(true);
  expect(getLatestState().pinToTabAvailable).toBe(true);
});

it('reconciles an optimistic pin with the authoritative background value', async () => {
  pinSessionMocks.write.mockResolvedValueOnce({
    pinToTabAvailable: true,
    status: 'acknowledged',
    value: false,
  });
  await renderHarness();

  act(() => {
    getLatestState().setPinToTab(true);
  });

  await act(async () => {
    await Promise.resolve();
  });

  expect(getLatestState().pinToTab).toBe(false);
});

it('rolls back to confirmed authority when a superseded optimistic write is followed by failure', async () => {
  pinSessionMocks.write
    .mockResolvedValueOnce({ status: 'superseded' })
    .mockRejectedValueOnce(new Error('runtime unavailable'));
  await renderHarness();

  act(() => {
    getLatestState().setPinToTab(true);
    getLatestState().setPinToTab(false);
  });

  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(getLatestState().pinToTab).toBe(false);
});

it('rolls back to a stale acknowledged write when the current write fails', async () => {
  pinSessionMocks.write
    .mockResolvedValueOnce({ pinToTabAvailable: true, status: 'acknowledged', value: true })
    .mockRejectedValueOnce(new Error('runtime unavailable'));
  await renderHarness();

  act(() => {
    getLatestState().setPinToTab(true);
    getLatestState().setPinToTab(false);
  });

  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(getLatestState().pinToTab).toBe(true);
});

it('rolls an optimistic toolbar show back when visibility persistence fails', async () => {
  pinSessionMocks.writeVisibility.mockRejectedValueOnce(new Error('runtime unavailable'));
  await renderHarness();

  act(() => {
    getLatestState().setPinnedToolbarVisible(true);
  });
  expect(getLatestState().isToolbarVisible).toBe(true);

  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(getLatestState().isToolbarVisible).toBe(false);
});

it('rolls an optimistic toolbar hide back when visibility persistence fails', async () => {
  pinSessionMocks.writeVisibility.mockRejectedValueOnce(new Error('runtime unavailable'));
  await renderHarness();
  act(() => {
    getLatestState().setIsToolbarVisible(true);
  });

  act(() => {
    getLatestState().setPinnedToolbarVisible(false);
  });
  expect(getLatestState().isToolbarVisible).toBe(false);

  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(getLatestState().isToolbarVisible).toBe(true);
});

it('rolls overlapping visibility failures back to the last confirmed state', async () => {
  pinSessionMocks.writeVisibility
    .mockRejectedValueOnce(new Error('first runtime failure'))
    .mockRejectedValueOnce(new Error('second runtime failure'));
  await renderHarness();
  act(() => {
    getLatestState().setIsToolbarVisible(true);
  });

  act(() => {
    getLatestState().setPinnedToolbarVisible(false);
    getLatestState().setPinnedToolbarVisible(true);
  });

  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(getLatestState().isToolbarVisible).toBe(true);
});

it('uses a stale successful visibility acknowledgement when the current write fails', async () => {
  const hide = createDeferred<void>();
  const show = createDeferred<void>();
  pinSessionMocks.writeVisibility
    .mockReturnValueOnce(hide.promise)
    .mockReturnValueOnce(show.promise);
  await renderHarness();
  act(() => {
    getLatestState().setIsToolbarVisible(true);
  });

  act(() => {
    getLatestState().setPinnedToolbarVisible(false);
    getLatestState().setPinnedToolbarVisible(true);
  });
  await act(async () => {
    hide.resolve(undefined);
    await Promise.resolve();
  });
  await act(async () => {
    show.reject(new Error('current visibility write failed'));
    await Promise.resolve();
  });

  expect(getLatestState().isToolbarVisible).toBe(false);
});

// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const pinSessionMocks = vi.hoisted(() => ({
  load: vi.fn(),
  write: vi.fn(),
}));

vi.mock('./pin-session', () => ({
  loadContentPinToTabSessionState: pinSessionMocks.load,
  readContentPinToTabSessionState: () => false,
  writeContentPinToTabSessionState: pinSessionMocks.write,
}));

import { useContentSurfaceState } from './surface';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useContentSurfaceState> | null = null;

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
  pinSessionMocks.load.mockResolvedValue(false);
  pinSessionMocks.write.mockReset();
  pinSessionMocks.write.mockImplementation(async (value: boolean) => ({
    status: 'acknowledged',
    value,
  }));
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

it('reconciles an optimistic pin with the authoritative background value', async () => {
  pinSessionMocks.write.mockResolvedValueOnce({ status: 'acknowledged', value: false });
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
    .mockResolvedValueOnce({ status: 'acknowledged', value: true })
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

// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useDiagnosticsPanelLoader } from './useDiagnosticsPanelLoader';

const { getDiagnostics } = vi.hoisted(() => ({
  getDiagnostics: vi.fn(),
}));

vi.mock('../../../composition/persistence/diagnostics/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/diagnostics/index')>()),
  getDiagnostics,
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

function createDeferred<T>() {
  let rejectPromise: (error: unknown) => void;
  let resolvePromise: (value: T) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    reject: rejectPromise!,
    resolve: resolvePromise!,
  };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useDiagnosticsPanelLoader> | null = null;

function renderHarness(recordingId: string) {
  function Harness() {
    latestState = useDiagnosticsPanelLoader(recordingId);
    return null;
  }

  act(() => {
    root?.render(<Harness />);
  });
}

function getState() {
  if (!latestState) {
    throw new Error('Diagnostics loader state is not ready');
  }

  return latestState;
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  getDiagnostics.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  latestState = null;
  container?.remove();
  container = null;
});

it('ignores stale diagnostics loads after the selected recording changes', async () => {
  const firstLoad = createDeferred<{ meta: { id: string }; events: Array<{ id: string }> | [] }>();
  const secondLoad = createDeferred<{ meta: { id: string }; events: Array<{ id: string }> | [] }>();

  getDiagnostics.mockImplementationOnce(() => firstLoad.promise);
  getDiagnostics.mockImplementationOnce(() => secondLoad.promise);

  renderHarness('recording-a');
  renderHarness('recording-b');
  await act(async () => {
    secondLoad.resolve({ meta: { id: 'recording-b' }, events: [{ id: 'event-b' }] });
    await Promise.resolve();
  });
  await act(async () => {
    firstLoad.resolve({ meta: { id: 'recording-a' }, events: [{ id: 'event-a' }] });
    await Promise.resolve();
  });

  expect(getState().meta).toEqual({ id: 'recording-b' });
  expect(getState().events).toEqual([{ id: 'event-b' }]);
  expect(getState().loading).toBe(false);
});

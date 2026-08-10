// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { RecordingTelemetryEntry } from '../../../composition/persistence/recordings/contracts';
import { useRecordingTelemetry } from './recording-telemetry';

const { getTelemetryMock, subscribeMock, unsubscribeMock } = vi.hoisted(() => ({
  getTelemetryMock: vi.fn(),
  subscribeMock: vi.fn(),
  unsubscribeMock: vi.fn(),
}));

vi.mock('../../../composition/persistence/recordings/telemetry', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/recordings/telemetry')
  >()),
  getRecordingTelemetry: getTelemetryMock,
}));

vi.mock('../../../features/media-hub/events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../features/media-hub/events')>()),
  subscribeToMediaHubEvents: subscribeMock,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let setSource: ((source: string | null) => void) | null = null;
const setRecordingTelemetry = vi.fn();

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  subscribeMock.mockReturnValue(unsubscribeMock);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  setSource = null;
  vi.clearAllMocks();
});

it('drops a late telemetry load after the source recording changes', async () => {
  let resolveFirst: (value: RecordingTelemetryEntry | undefined) => void = () => undefined;
  getTelemetryMock
    .mockReturnValueOnce(
      new Promise<RecordingTelemetryEntry | undefined>((resolve) => {
        resolveFirst = resolve;
      })
    )
    .mockResolvedValueOnce(createTelemetry('recording-2'));

  renderHarness('recording-1');
  act(() => setSource?.('recording-2'));
  await act(async () => Promise.resolve());
  expect(setRecordingTelemetry).toHaveBeenLastCalledWith(createTelemetry('recording-2'));

  await act(async () => {
    resolveFirst(createTelemetry('recording-1'));
    await Promise.resolve();
  });
  expect(setRecordingTelemetry).not.toHaveBeenLastCalledWith(createTelemetry('recording-1'));
});

it('reloads matching telemetry after a recording sidecar update and unsubscribes', async () => {
  getTelemetryMock
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce(createTelemetry('recording-1'));
  renderHarness('recording-1');
  await act(async () => Promise.resolve());

  const listener = subscribeMock.mock.calls[0]?.[0] as
    | ((event: { assetIds: string[]; reason: 'update'; type: 'library-changed' }) => void)
    | undefined;
  act(() =>
    listener?.({
      assetIds: ['recording:recording-1'],
      reason: 'update',
      type: 'library-changed',
    })
  );
  await act(async () => Promise.resolve());

  expect(setRecordingTelemetry).toHaveBeenLastCalledWith(createTelemetry('recording-1'));
  act(() => root?.unmount());
  root = null;
  expect(unsubscribeMock).toHaveBeenCalledTimes(1);
});

function renderHarness(initialSource: string | null) {
  function Harness() {
    const [source, updateSource] = useState(initialSource);
    setSource = updateSource;
    useRecordingTelemetry(source, setRecordingTelemetry);
    return null;
  }
  act(() => root?.render(<Harness />));
}

function createTelemetry(recordingId: string): RecordingTelemetryEntry {
  return {
    actionEvents: [],
    captureMode: null,
    createdAt: 1,
    cursorTrack: null,
    recordingId,
    signals: [],
    updatedAt: 2,
    viewport: null,
  };
}

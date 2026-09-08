// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { RecordingTelemetryEntry } from '../../../composition/persistence/recordings/contracts';
import { useRecordingTelemetry } from './recording-telemetry';
import {
  createProject,
  createVideoClip,
} from '../../../features/video/project/timeline/project-meta.test.helpers';

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

it('deduplicates material origins and does not reload on timing edits or asset reordering', async () => {
  let project = createProject([createVideoClip()]);
  project.assets.push({ ...project.assets[0]!, id: 'duplicate-wrapper' });
  getTelemetryMock.mockImplementation((id: string) => Promise.resolve(createTelemetry(id)));
  function Harness() {
    useRecordingTelemetry(project, setRecordingTelemetry);
    return null;
  }
  act(() => root?.render(<Harness />));
  await act(async () => {
    await Promise.resolve();
  });
  expect(getTelemetryMock).toHaveBeenCalledTimes(2);
  project = { ...project, assets: [...project.assets].reverse(), duration: 20 };
  act(() => root?.render(<Harness />));
  await act(async () => {
    await Promise.resolve();
  });
  expect(getTelemetryMock).toHaveBeenCalledTimes(2);
  project = { ...project, id: 'another-project' };
  act(() => root?.render(<Harness />));
  await act(async () => {
    await Promise.resolve();
  });
  expect(getTelemetryMock).toHaveBeenCalledTimes(4);
});

it('rejects mismatched sidecars and does not publish after unmount', async () => {
  let resolvePending: (entry: RecordingTelemetryEntry) => void = () => undefined;
  getTelemetryMock.mockReturnValueOnce(
    new Promise<RecordingTelemetryEntry>((resolve) => {
      resolvePending = resolve;
    })
  );
  renderHarness('recording-1');
  await act(async () => {
    resolvePending(createTelemetry('foreign'));
  });
  expect(setRecordingTelemetry).toHaveBeenLastCalledWith([]);
  getTelemetryMock.mockReturnValueOnce(
    new Promise<RecordingTelemetryEntry>((resolve) => {
      resolvePending = resolve;
    })
  );
  act(() => setSource?.('recording-2'));
  act(() => root?.unmount());
  root = null;
  const calls = setRecordingTelemetry.mock.calls.length;
  await act(async () => {
    resolvePending(createTelemetry('recording-2'));
  });
  expect(setRecordingTelemetry).toHaveBeenCalledTimes(calls);
});

it('loads all distinct material origins and preserves available history when one source fails', async () => {
  const project = createProject([createVideoClip()]);
  getTelemetryMock.mockImplementation((id: string) =>
    id === 'rec-asset-audio'
      ? Promise.reject(new Error('Unavailable source'))
      : Promise.resolve(createTelemetry(id))
  );
  act(() => root?.render(<MultiSourceHarness />));
  function MultiSourceHarness() {
    useRecordingTelemetry(project, setRecordingTelemetry);
    return null;
  }
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(getTelemetryMock.mock.calls.map(([id]) => id).sort()).toEqual([
    'rec-asset-audio',
    'rec-asset-video',
  ]);
  expect(setRecordingTelemetry).toHaveBeenLastCalledWith([createTelemetry('rec-asset-video')]);
});

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
  expect(setRecordingTelemetry).toHaveBeenLastCalledWith([createTelemetry('recording-2')]);

  await act(async () => {
    resolveFirst(createTelemetry('recording-1'));
    await Promise.resolve();
  });
  expect(setRecordingTelemetry).not.toHaveBeenLastCalledWith([createTelemetry('recording-1')]);
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

  expect(setRecordingTelemetry).toHaveBeenLastCalledWith([createTelemetry('recording-1')]);
  act(() => root?.unmount());
  root = null;
  expect(unsubscribeMock).toHaveBeenCalledTimes(1);
});

function renderHarness(initialSource: string | null) {
  function Harness() {
    const [source, updateSource] = useState(initialSource);
    setSource = updateSource;
    useRecordingTelemetry(
      source ? { ...createProject([]), assets: [], baseRecordingId: source } : null,
      setRecordingTelemetry
    );
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

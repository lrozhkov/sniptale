// @vitest-environment jsdom
import '../../composition/persistence/infrastructure/indexed-db/fake-indexed-db.test-support';
import { act } from 'react';
import { TextEncoder as NodeTextEncoder } from 'node:util';
import { createRoot, type Root } from 'react-dom/client';
import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DB_VERSION } from '../../composition/persistence/infrastructure/indexed-db/core.stores';
import { handleDatabaseUpgrade } from '../../composition/persistence/infrastructure/indexed-db/upgrade/core';
import { installPersistenceLockManagerForTests } from '../../composition/persistence/infrastructure/mutation-barrier';
import { createRecordingEventsStore } from '../../composition/persistence/recordings/recording-events/store';
import { createRecordingCursorTrajectoryStore } from '../../composition/persistence/recordings/cursor-trajectory/store';
import type { RecordingTelemetryEntry } from '../../composition/persistence/recordings/contracts';
import { createRecordingEventsBlockPacker } from '../../features/video/project/recording-events/blocks';
import { createCursorTrajectoryBlockPacker } from '../../features/video/project/cursor-trajectory/blocks';
import { cursorTrajectoryProjectCoversTime } from '../../features/video/project/cursor-trajectory/project-window';
import { recordingEventsProjectCoversTime } from '../../features/video/project/recording-events/project-facts';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { resolveQuickEditEffectiveState } from '../../features/video/review/advanced/effective';
import { evaluateQuickEditCameraAtTime } from '../../features/video/review/advanced/scene';
import { deriveReviewCursorFocusPath } from '../../features/video/review/advanced/cursor-focus-path';
import { reviewRecordingWindow } from '../../features/video/review/telemetry';
import { useReviewRecordingHistory } from './use-recording-history';

const io = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('../../workflows/video-review/recording-review', async (original) => ({
  ...(await original<typeof import('../../workflows/video-review/recording-review')>()),
  createReviewRecordingHistorySource: io.create,
}));
const source = { width: 160, height: 90, duration: 20, mimeType: 'video/mp4', size: 100 };
const clock = {
  source: 'windows-message-time' as const,
  timestampQuantumUs: 1000,
  resolutionBoundUs: null,
  mappingUncertaintyUs: null,
};
let db: IDBPDatabase;
let databaseName: string;
let root: Root;
let host: HTMLDivElement;
let current: ReturnType<typeof useReviewRecordingHistory>;
const dependencies = { database: async () => db, mintGeneration: () => crypto.randomUUID() };
type Resource = Parameters<typeof useReviewRecordingHistory>[0];
type Options = Parameters<typeof useReviewRecordingHistory>[3];
function Probe({
  input,
  time = 10,
  options,
}: {
  input: Resource;
  time?: number;
  options?: Options;
}) {
  current = useReviewRecordingHistory(input, time, { kind: 'none' }, options);
  return null;
}
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('Uint8Array', new NodeTextEncoder().encode('').constructor);
  installPersistenceLockManagerForTests({ request: async (_name, _options, work) => work({}) });
  databaseName = `cursor-history-hook-${crypto.randomUUID()}`;
  db = await openDB(databaseName, DB_VERSION, { upgrade: handleDatabaseUpgrade });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  io.create.mockReset();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  db.close();
  await deleteDB(databaseName);
  installPersistenceLockManagerForTests(null);
  vi.unstubAllGlobals();
});

async function archiveEvents(recordingId: string) {
  const eventStreamId = 'a'.repeat(32);
  const events = createRecordingEventsBlockPacker(recordingId, eventStreamId);
  const eventBlocks = events.append({
    kind: 'segment',
    recordSeq: 0,
    segmentId: 0,
    activeTimeUs: 0,
    reason: 'start',
    clock,
  });
  eventBlocks.push(
    ...events.append({
      kind: 'signal',
      recordSeq: 1,
      segmentId: 0,
      activeTimeUs: 9_000_000,
      signal: {
        id: 'idle',
        kind: 'cursor-idle',
        startTimeUs: 9_000_000,
        endTimeUs: 12_000_000,
        point: { x: 0.7, y: 0.3 },
        data: { source: 'native-cursor' },
      },
    })
  );
  eventBlocks.push(
    ...events.append({
      kind: 'action',
      recordSeq: 2,
      segmentId: 0,
      activeTimeUs: 11_063_109,
      action: {
        id: 'click',
        kind: 'CLICK',
        timeUs: 11_063_109,
        durationUs: 0,
        point: { x: 0.7, y: 0.3 },
        label: 'Click',
        preset: 'NONE',
        data: {
          button: 0,
          gestureId: null,
          downTimeUs: 11_063_109,
          clickCount: 1,
          gestureType: 'click',
          completion: 'released',
          upTimeUs: 11_063_109,
          pressDurationUs: 0,
          lastObservedTimeUs: 11_063_109,
          semanticEndTimeUs: null,
          dragStartTimeUs: null,
          pointerCancelled: null,
          dropObserved: null,
          upPoint: { x: 0.7, y: 0.3 },
          ctrlKey: null,
          altKey: null,
          shiftKey: null,
          metaKey: null,
        },
      },
    })
  );
  eventBlocks.push(
    ...events.append({
      kind: 'boundary',
      recordSeq: 3,
      segmentId: 0,
      activeTimeUs: 19_100_000,
      reason: 'stop',
    }),
    ...events.finish()
  );
  const recordingEvents = {
    format: 'recording-events-v1' as const,
    formatVersion: 1 as const,
    algorithm: 'lossless-v1' as const,
    encoding: 'json-utf8-v1' as const,
    eventStreamId,
    state: 'complete' as const,
    finalized: true,
    ...events.summary(),
  };
  const eventStore = createRecordingEventsStore(dependencies);
  const eventWriter = await eventStore.begin({ recordingId, eventStreamId });
  for (const block of eventBlocks) await eventStore.append(eventWriter, block);
  await eventStore.finalize(eventWriter, recordingEvents);
  return recordingEvents;
}

async function archiveCursor(recordingId: string) {
  const trajectoryId = 'b'.repeat(32);
  const cursor = createCursorTrajectoryBlockPacker(recordingId, trajectoryId);
  const cursorBlocks = [];
  let observationSeq = 0;
  const segments = [
    [0, 4, 8.9],
    [9, 10, 11.5, 16.9],
    [17, 18, 19],
  ];
  for (const [segmentId, times] of segments.entries()) {
    cursorBlocks.push(
      ...cursor.append({
        kind: 'segment',
        segmentId,
        activeTimeUs: times[0]! * 1_000_000,
        width: source.width,
        height: source.height,
        clock,
        reason: segmentId === 0 ? 'start' : 'clock-discontinuity',
      })
    );
    for (const time of times)
      cursorBlocks.push(
        ...cursor.append({
          kind: 'sample',
          segmentId,
          observationSeq: observationSeq++,
          activeTimeUs: Math.round(time * 1_000_000),
          // The idle signal and click refer to the same stationary native observations.
          xQ8: segmentId === 1 ? 112 * 256 : Math.round((24 + time * 5.4) * 256),
          yQ8: (segmentId === 1 ? 27 : 30) * 256,
          observed: true,
          visible: true,
          event: 'move',
          button: 'none',
          relatedObservationSeq: null,
          anchors: [],
        })
      );
    cursorBlocks.push(
      ...cursor.append({
        kind: 'boundary',
        segmentId,
        activeTimeUs: Math.round([9, 17, 19.1][segmentId]! * 1_000_000),
        reason: segmentId === 2 ? 'stop' : 'clock-discontinuity',
      })
    );
  }
  cursorBlocks.push(...cursor.finish());
  const cursorTrajectory = {
    format: 'cursor-trajectory-v1' as const,
    formatVersion: 1 as const,
    algorithm: 'sed-window-v1' as const,
    encoding: 'json-ascii-int-v1' as const,
    trajectoryId,
    state: 'complete' as const,
    finalized: true,
    ...cursor.summary(),
  };
  const cursorStore = createRecordingCursorTrajectoryStore(dependencies);
  const cursorWriter = await cursorStore.begin(
    { recordingId, trajectoryId },
    { width: source.width, height: source.height }
  );
  for (const block of cursorBlocks) await cursorStore.append(cursorWriter, block);
  await cursorStore.finalize(cursorWriter, cursorTrajectory, 'complete');
  return cursorTrajectory;
}

async function archive() {
  const recordingId = 'compact-desktop';
  const recordingEvents = await archiveEvents(recordingId);
  const cursorTrajectory = await archiveCursor(recordingId);
  const telemetry: RecordingTelemetryEntry = {
    recordingId,
    createdAt: 1,
    updatedAt: 2,
    captureMode: null,
    viewport: null,
    cursorTrack: null,
    actionEvents: [],
    signals: [],
    cursorTrajectory,
    recordingEvents,
  };
  const actual = await vi.importActual<
    typeof import('../../workflows/video-review/recording-review')
  >('../../workflows/video-review/recording-review');
  const historyProject = actual.createReviewRecordingHistoryProject(
    telemetry,
    source,
    'desktop.mp4'
  );
  if (!historyProject) throw new Error('Expected archived history project');
  const reader = actual.createReviewRecordingHistorySource(historyProject, telemetry, dependencies);
  const prepared = await reader.read(10, { start: 9, end: 11 });
  const read = vi.fn(reader.read).mockResolvedValueOnce(prepared);
  io.create.mockReturnValue({ ...reader, read });
  return { input: { historyProject, telemetry, source }, prepared, reader, read };
}
function pose(facts: RecordingTelemetryEntry, time = 11.1) {
  const advanced = createQuickEditAdvancedState();
  advanced.ui.mode = 'advanced';
  advanced.ui.tracks.zoom = true;
  advanced.zoom = {
    enabled: true,
    regions: [
      {
        id: 'zoom',
        start: 8,
        end: 17,
        followCursor: true,
        transform: { scale: 1.5, centerX: 0.5, centerY: 0.5 },
        cursorComposition: { mode: 'orbit', amount: 0.5, smoothness: 0.6 },
        enter: { type: 'ease-in-out', duration: 0.3 },
        exit: { type: 'ease-in-out', duration: 0.3 },
      },
    ],
  };
  const effective = resolveQuickEditEffectiveState(advanced, { facts, source });
  return evaluateQuickEditCameraAtTime(effective.zoomRegions, time, {
    source,
    background: effective.background,
    output: source,
  });
}

it('keeps proved archive cursor and auto3D while only the event window refresh is pending', async () => {
  const fixture = await archive();
  const refresh = Promise.withResolvers<typeof fixture.prepared>();
  fixture.read.mockReturnValueOnce(refresh.promise);
  await act(async () => root.render(<Probe input={fixture.input} />));
  expect(current.pending).toBe(false);
  expect(current.telemetry!.signals.length).toBeGreaterThan(0);
  const expected = pose(current.telemetry!);
  expect(Math.abs(expected.spatial?.rotation?.[1] ?? 0)).toBeGreaterThan(0.01);
  expect(expected).not.toEqual(
    pose({ ...current.telemetry!, cursorTrack: null, actionEvents: [], signals: [] })
  );
  expect(cursorTrajectoryProjectCoversTime(fixture.prepared.project, 11.1)).toBe(true);
  expect(recordingEventsProjectCoversTime(fixture.prepared.project, 11.1)).toBe(false);
  const serialized = JSON.stringify(fixture.input.historyProject);
  const end = reviewRecordingWindow(current.telemetry!)?.cursorEndSeconds;
  await act(async () => root.render(<Probe input={fixture.input} time={11.1} />));
  expect(current.pending).toBe(true);
  expect(current.failed).toBe(false);
  expect(current.telemetry!.actionEvents).toEqual([]);
  expect(current.telemetry!.signals).toEqual([]);
  expect(pose(current.telemetry!)).toEqual(expected);
  expect(current.telemetry!.cursorTrack?.samples).toEqual(
    fixture.prepared.telemetry.cursorTrack!.samples
  );
  expect(reviewRecordingWindow(current.telemetry!)?.cursorEndSeconds).toBe(end);
  expect(end).toBeLessThan(source.duration);
  expect(
    deriveReviewCursorFocusPath(current.telemetry!, source, true).segments.every(
      (segment) => segment.end <= end!
    )
  ).toBe(true);
  const completed = await fixture.reader.read(11.1);
  await act(async () => refresh.resolve(completed));
  expect(current.pending).toBe(false);
  expect(current.telemetry!.actionEvents.some((event) => event.id === 'click')).toBe(true);
  expect(pose(current.telemetry!)).toEqual(expected);
  expect(JSON.stringify(fixture.input.historyProject)).toBe(serialized);
});

it('drops the retained cursor when its real window expires during a pending event read', async () => {
  const fixture = await archive();
  const refresh = Promise.withResolvers<typeof fixture.prepared>();
  fixture.read.mockReturnValueOnce(refresh.promise);
  await act(async () => root.render(<Probe input={fixture.input} />));
  await act(async () => root.render(<Probe input={fixture.input} time={11.1} />));
  expect(current.telemetry!.cursorTrack?.samples.length).toBeGreaterThan(0);
  expect(cursorTrajectoryProjectCoversTime(fixture.prepared.project, 17)).toBe(false);
  await act(async () => root.render(<Probe input={fixture.input} time={17} />));
  expect(current.pending).toBe(true);
  expect(current.telemetry!.cursorTrack?.samples ?? []).toEqual([]);
  expect(reviewRecordingWindow(current.telemetry!)?.cursorEndSeconds).toBeUndefined();
});

it.each(['source', 'includeCursor'] as const)(
  'does not reuse a prior owner cursor after changing %s',
  async (change) => {
    const fixture = await archive();
    await act(async () => root.render(<Probe input={fixture.input} />));
    expect(current.telemetry!.cursorTrack?.samples.length).toBeGreaterThan(0);
    const next = Promise.withResolvers<typeof fixture.prepared>();
    io.create.mockReturnValue({
      read: vi.fn(() => next.promise),
      covers: fixture.reader.covers,
      dispose: vi.fn(),
    });
    const input =
      change === 'source'
        ? { ...fixture.input, historyProject: structuredClone(fixture.input.historyProject) }
        : fixture.input;
    await act(async () =>
      root.render(
        <Probe
          input={input}
          time={11.1}
          options={change === 'includeCursor' ? { includeCursor: false } : undefined}
        />
      )
    );
    expect(current.pending).toBe(true);
    expect(current.telemetry!.cursorTrack?.samples ?? []).toEqual([]);
    expect(reviewRecordingWindow(current.telemetry!)?.cursorEndSeconds).toBeUndefined();
  }
);

it('clears cursor facts on a failed event read and recovers only from the retried read', async () => {
  const fixture = await archive();
  const refresh = Promise.withResolvers<typeof fixture.prepared>();
  fixture.read.mockReturnValueOnce(refresh.promise);
  await act(async () => root.render(<Probe input={fixture.input} />));
  await act(async () => root.render(<Probe input={fixture.input} time={11.1} />));
  expect(current.telemetry!.cursorTrack?.samples.length).toBeGreaterThan(0);
  await act(async () => refresh.reject(new Error('Read failed')));
  expect(current.failed).toBe(true);
  expect(current.pending).toBe(false);
  expect(current.telemetry!.cursorTrack?.samples ?? []).toEqual([]);
  const completed = await fixture.reader.read(11.1);
  fixture.read.mockResolvedValueOnce(completed);
  await act(async () => current.retry());
  expect(current.failed).toBe(false);
  expect(current.pending).toBe(false);
  expect(current.telemetry!.cursorTrack?.samples).toEqual(completed.telemetry.cursorTrack!.samples);
});

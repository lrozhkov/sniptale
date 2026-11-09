import { createReviewRecordingRenderSource } from './recording-render';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { REVIEW_KEY_DEFAULT } from '../../features/video/project/action-feedback/key-animation';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import '../../composition/persistence/infrastructure/indexed-db/fake-indexed-db.test-support';
import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import { beforeEach, afterEach, expect, it } from 'vitest';
import { DB_VERSION } from '../../composition/persistence/infrastructure/indexed-db/core.stores';
import { handleDatabaseUpgrade } from '../../composition/persistence/infrastructure/indexed-db/upgrade/core';
import { installPersistenceLockManagerForTests } from '../../composition/persistence/infrastructure/mutation-barrier';
import { createRecordingEventsStore } from '../../composition/persistence/recordings/recording-events/store';
import { createRecordingCursorTrajectoryStore } from '../../composition/persistence/recordings/cursor-trajectory/store';
import type { RecordingTelemetryEntry } from '../../composition/persistence/recordings/contracts';
import fixture from '../../features/video/project/recording-events/fixtures.json';
import { isRecordingEventsDescriptor } from '../../features/video/project/recording-events/records';
import { createRecordingEventsBlockPacker } from '../../features/video/project/recording-events/blocks';
import { createCursorTrajectoryBlockPacker } from '../../features/video/project/cursor-trajectory/blocks';
import {
  projectReviewTelemetry,
  reviewRecordingWindow,
} from '../../features/video/review/telemetry';
import { deriveReviewCursorFocusPath } from '../../features/video/review/advanced/cursor-focus-path';
import {
  buildReviewActionAudioPlan,
  iterateReviewActionAudioCues,
} from '../../features/video/review/action-audio';
import {
  createReviewRecordingHistoryProject,
  createReviewRecordingHistorySource,
} from './recording-review';

let db: IDBPDatabase;
let databaseName: string;
const dependencies = { database: async () => db, mintGeneration: () => crypto.randomUUID() };
const source = { width: 160, height: 90, duration: 20, mimeType: 'video/webm', size: 100 };
beforeEach(async () => {
  installPersistenceLockManagerForTests({ request: async (_name, _options, work) => work({}) });
  databaseName = `recording-review-${crypto.randomUUID()}`;
  db = await openDB(databaseName, DB_VERSION, { upgrade: handleDatabaseUpgrade });
});
afterEach(async () => {
  db.close();
  await deleteDB(databaseName);
  installPersistenceLockManagerForTests(null);
});
async function original(withCursor = true) {
  if (!isRecordingEventsDescriptor(fixture.descriptor)) throw new Error('Invalid fixture.');
  const events = createRecordingEventsStore(dependencies);
  const eventWriter = await events.begin({
    recordingId: fixture.recordingId,
    eventStreamId: fixture.eventStreamId,
  });
  for (let index = 0; index < fixture.blocks.length; index++)
    await events.append(eventWriter, {
      bytes: new TextEncoder().encode(fixture.blocks[index]!.utf8),
      entry: fixture.manifest[index]!,
    });
  await events.finalize(eventWriter, fixture.descriptor);
  const telemetry: RecordingTelemetryEntry = {
    recordingId: fixture.recordingId,
    createdAt: 1,
    updatedAt: 2,
    captureMode: null,
    viewport: null,
    cursorTrack: null,
    actionEvents: [],
    signals: [],
    recordingEvents: fixture.descriptor,
  };
  if (withCursor) {
    const trajectoryId = 'a'.repeat(32);
    const packer = createCursorTrajectoryBlockPacker(fixture.recordingId, trajectoryId);
    const blocks = packer.append({
      kind: 'segment',
      segmentId: 0,
      activeTimeUs: 0,
      width: 160,
      height: 90,
      reason: 'start',
      clock: {
        source: 'dom-event-time',
        timestampQuantumUs: null,
        resolutionBoundUs: null,
        mappingUncertaintyUs: null,
      },
    });
    for (let index = 0; index < 6000; index++)
      blocks.push(
        ...packer.append({
          kind: 'sample',
          segmentId: 0,
          observationSeq: index,
          activeTimeUs: index * 2000,
          xQ8: Math.floor((16 + (index * 128) / 5999) * 256 + 0.5),
          yQ8: 45 * 256,
          observed: true,
          visible: true,
          event: 'move',
          button: 'none',
          relatedObservationSeq: null,
          anchors: [],
        })
      );
    blocks.push(
      ...packer.append({ kind: 'boundary', segmentId: 0, activeTimeUs: 12010000, reason: 'stop' }),
      ...packer.finish()
    );
    const cursor = createRecordingCursorTrajectoryStore(dependencies);
    const writer = await cursor.begin(
      { recordingId: fixture.recordingId, trajectoryId },
      { width: 160, height: 90 }
    );
    for (const block of blocks) await cursor.append(writer, block);
    await cursor.finalize(writer, packer.summary(), 'complete');
    telemetry.cursorTrajectory = {
      format: 'cursor-trajectory-v1',
      formatVersion: 1,
      algorithm: 'sed-window-v1',
      encoding: 'json-ascii-int-v1',
      trajectoryId,
      state: 'complete',
      finalized: true,
      ...packer.summary(),
    };
  }
  const project = createReviewRecordingHistoryProject(telemetry, source, 'recording.webm');
  if (!project) throw new Error('Expected compact source.');
  return { telemetry, project, events, eventWriter };
}
it(
  'reads a late cursor window beyond 4096 observations without expanding project JSON or ' +
    'claiming the video tail',
  async () => {
    const { telemetry, project } = await original();
    const before = JSON.stringify(project);
    const reader = createReviewRecordingHistorySource(project, telemetry, dependencies);
    try {
      const result = await reader.read(11);
      const points = result.telemetry.cursorTrack!.samples;
      expect(points.length).toBeLessThanOrEqual(1536);
      expect(points.some((point) => point.id.includes('5500'))).toBe(true);
      expect(points.filter((point) => point.visible).at(-1)?.recordingPoint?.x).toBeGreaterThan(
        0.8
      );
      expect(JSON.stringify(result.project)).toBe(before);
      expect(JSON.stringify(project)).toBe(before);
      const end = reviewRecordingWindow(result.telemetry)?.cursorEndSeconds;
      expect(end).toBeLessThan(13);
      expect(
        deriveReviewCursorFocusPath(result.telemetry, source, true).segments.every(
          (segment) => segment.end <= end!
        )
      ).toBe(true);
      expect(reader.covers(result.project, 11)).toBe(true);
      expect(reader.covers(result.project, 19)).toBe(false);
    } finally {
      reader.dispose();
    }
  }
);
it('adapts original action updates and exact cadence to the existing Review marker consumer', async () => {
  const { telemetry, project } = await original(false);
  const reader = createReviewRecordingHistorySource(project, telemetry, dependencies);
  try {
    const result = await reader.read(0.1);
    const markers = projectReviewTelemetry(result.telemetry, source.duration).markers;
    const key = markers.find((marker) => marker.ref.id === 'key-1');
    const typing = markers.find((marker) => marker.ref.id === 'typing-1');
    expect(key).toMatchObject({ observed: true, keyboardAttack: { id: 'attack-key-1', time: 0 } });
    expect(key?.recordingCadence?.repeats[0]).toMatchObject({
      quantumUs: 1,
      count: 3,
      ticks: [0, 10000, 10000],
    });
    expect(typing?.recordingCadence?.onsets[0]).toMatchObject({ quantumUs: 1, count: 3 });
    expect(
      result.telemetry.actionEvents.find((event) => event.id === 'key-1')?.data['upTime']
    ).toBe(0.04);
    expect(result.project.actionEvents).toEqual([]);
    expect(JSON.stringify(result.project)).not.toContain('key-1');
    expect(JSON.stringify(result.telemetry)).not.toContain('review-recording-history-window');
  } finally {
    reader.dispose();
  }
});
it('refuses a retired source on a later read and cancels after disposal', async () => {
  const { telemetry, project, events, eventWriter } = await original(false);
  const reader = createReviewRecordingHistorySource(project, telemetry, dependencies);
  await reader.read(0.1);
  await events.retire(eventWriter, eventWriter.writerGeneration);
  await expect(reader.read(0.1)).rejects.toThrow();
  reader.dispose();
  await expect(reader.read(0.1)).rejects.toThrow();
});
it('does not request absent zero-block archives', async () => {
  if (!isRecordingEventsDescriptor(fixture.descriptor)) throw new Error('Invalid fixture.');
  const telemetry: RecordingTelemetryEntry = {
    recordingId: fixture.recordingId,
    createdAt: 1,
    updatedAt: 2,
    captureMode: null,
    viewport: null,
    cursorTrack: null,
    actionEvents: [],
    signals: [],
    recordingEvents: {
      ...fixture.descriptor,
      state: 'unavailable',
      totalBlocks: 0,
      totalRecords: 0,
      totalBytes: 0,
      streamSha256: fixture.emptyStreamSha256,
    },
  };
  const project = createReviewRecordingHistoryProject(telemetry, source, 'unavailable.webm');
  if (!project) throw new Error('Expected unavailable metadata.');
  const reader = createReviewRecordingHistorySource(project, telemetry, {
    ...dependencies,
    database: async () => {
      throw new Error('absent-archive-read');
    },
  });
  try {
    expect(
      projectReviewTelemetry((await reader.read(1)).telemetry, source.duration).markers
    ).toEqual([]);
  } finally {
    reader.dispose();
  }
});
it('does not invent an attack for a canonical command with an unknown onset', async () => {
  const eventStreamId = 'd'.repeat(32);
  const packer = createRecordingEventsBlockPacker('unknown-onset', eventStreamId);
  const blocks = packer.append({
    kind: 'segment',
    recordSeq: 0,
    segmentId: 0,
    activeTimeUs: 0,
    reason: 'start',
    clock: {
      source: 'windows-message-time',
      timestampQuantumUs: null,
      resolutionBoundUs: null,
      mappingUncertaintyUs: null,
    },
  });
  blocks.push(
    ...packer.append({
      kind: 'action',
      recordSeq: 1,
      segmentId: 0,
      activeTimeUs: 1000,
      action: {
        id: 'command',
        kind: 'KEY',
        timeUs: 1000,
        durationUs: 0,
        point: null,
        label: 'Ctrl+S',
        preset: 'NONE',
        data: {
          ctrlKey: true,
          altKey: false,
          shiftKey: false,
          metaKey: false,
          downTimeUs: null,
          upTimeUs: 1000,
          pressDurationUs: null,
          lastObservedTimeUs: 1000,
          repeatCount: 0,
          completion: 'released',
          groupId: null,
          continuationOf: null,
          keyboardAttackId: null,
          keyboardOnsetTimeUs: null,
        },
      },
    }),
    ...packer.append({
      kind: 'boundary',
      recordSeq: 2,
      segmentId: 0,
      activeTimeUs: 2000,
      reason: 'stop',
    }),
    ...packer.finish()
  );
  const descriptor = {
    format: 'recording-events-v1' as const,
    formatVersion: 1 as const,
    algorithm: 'lossless-v1' as const,
    encoding: 'json-utf8-v1' as const,
    eventStreamId,
    state: 'complete' as const,
    finalized: true,
    ...packer.summary(),
  };
  const store = createRecordingEventsStore(dependencies);
  const writer = await store.begin({ recordingId: 'unknown-onset', eventStreamId });
  for (const block of blocks) await store.append(writer, block);
  await store.finalize(writer, descriptor);
  const telemetry: RecordingTelemetryEntry = {
    recordingId: 'unknown-onset',
    createdAt: 1,
    updatedAt: 2,
    captureMode: null,
    viewport: null,
    cursorTrack: null,
    actionEvents: [],
    signals: [],
    recordingEvents: descriptor,
  };
  const project = createReviewRecordingHistoryProject(telemetry, source, 'unknown.webm');
  if (!project) throw new Error('Expected compact source.');
  const reader = createReviewRecordingHistorySource(project, telemetry, dependencies);
  try {
    const markers = projectReviewTelemetry(
      (await reader.read(0.001)).telemetry,
      source.duration
    ).markers;
    expect(markers).toEqual([
      expect.objectContaining({ ref: { kind: 'action', id: 'command' }, observed: true }),
    ]);
    const plan = buildReviewActionAudioPlan({
      markers,
      applied: true,
      segments: buildReviewTimeMap(source.duration, []),
      settings: [
        {
          ref: { kind: 'action', id: 'command' },
          enabled: true,
          presetId: 'keyboard-recorded-v2',
          includeRepeats: true,
          volume: 0.5,
          offset: 0,
        },
      ],
    });
    expect(
      [...iterateReviewActionAudioCues(plan, { start: 0, end: source.duration })].flat()
    ).toEqual([]);
  } finally {
    reader.dispose();
  }
});

it(
  'feeds actual archived key cues and a late cursor window into frame consumers without ' +
    'expanding the source project',
  async () => {
    const { telemetry, project } = await original();
    const advanced = createQuickEditAdvancedState();
    advanced.ui.mode = 'advanced';
    advanced.keyAnimations = [{ ...REVIEW_KEY_DEFAULT, id: 'key-1', enabled: true }];
    const before = JSON.stringify(project);
    const reader = createReviewRecordingRenderSource(
      { project, telemetry, source, advanced, edits: [] },
      {
        createReader: (project, telemetry) =>
          createReviewRecordingHistorySource(project, telemetry, dependencies),
      }
    );
    try {
      const first = await reader.read(0.01, 0.01, {
        width: 1920,
        height: 900,
        frameDuration: 1 / 30,
      });
      expect(first.keyCues).toEqual([
        expect.objectContaining({ start: 0, end: 1.2, label: expect.any(String) }),
      ]);
      const late = await reader.read(11, 11, { width: 1920, height: 900, frameDuration: 1 / 30 });
      expect(late.telemetry.cursorTrack!.samples.length).toBeLessThanOrEqual(1536);
      expect(late.telemetry.cursorTrack!.samples.some((point) => point.id.includes('5500'))).toBe(
        true
      );
      expect(JSON.stringify(project)).toBe(before);
    } finally {
      reader.dispose();
    }
  }
);

it('reads the complete requested event viewport without depending on an unavailable cursor archive', async () => {
  const { telemetry, project } = await original();
  await createRecordingCursorTrajectoryStore(dependencies).retire({
    recordingId: telemetry.recordingId,
    trajectoryId: telemetry.cursorTrajectory!.trajectoryId,
  });
  const reader = createReviewRecordingHistorySource(project, telemetry, dependencies, {
    includeCursor: false,
  });
  try {
    const result = await reader.read(10, { start: 0, end: 20 });
    expect(result.telemetry.cursorTrack).toBeNull();
    expect(result.telemetry.actionEvents.some((event) => event.id === 'key-1')).toBe(true);
    expect(reader.covers(result.project, 10)).toBe(true);
    expect(result.project.actionEvents).toEqual([]);
  } finally {
    reader.dispose();
  }
});

it('accepts exact project EOF while rejecting rounded-overrun and invalid direct history requests', async () => {
  const { telemetry, project } = await original(false);
  project.duration = 26.283316666666664;
  const reader = createReviewRecordingHistorySource(project, telemetry, dependencies);
  try {
    await expect(reader.read(project.duration)).resolves.toBeDefined();
    for (const time of [26.283317, -0.000001, NaN, Infinity])
      await expect(reader.read(time)).rejects.toThrow('Review recording history range is invalid.');
    await expect(reader.read(1, { start: 2, end: 1 })).rejects.toThrow(
      'Review recording history range is invalid.'
    );
    await expect(reader.read(1)).resolves.toBeDefined();
  } finally {
    reader.dispose();
  }
});

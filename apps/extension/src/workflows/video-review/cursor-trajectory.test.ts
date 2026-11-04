import '../../composition/persistence/infrastructure/indexed-db/fake-indexed-db.test-support';
import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { installPersistenceLockManagerForTests } from '../../composition/persistence/infrastructure/mutation-barrier';
import { handleDatabaseUpgrade } from '../../composition/persistence/infrastructure/indexed-db/upgrade/core';
import {
  DB_VERSION,
  RECORDING_CURSOR_TRAJECTORIES_STORE,
} from '../../composition/persistence/infrastructure/indexed-db/core.stores';
import { createRecordingCursorTrajectoryStore } from '../../composition/persistence/recordings/cursor-trajectory/store';
import { createCursorTrajectoryBlockPacker } from '../../features/video/project/cursor-trajectory/blocks';
import type { CursorTrajectoryDescriptor } from '../../features/video/project/cursor-trajectory/types';
import { createVideoProjectFromRecording } from '../../features/video/project/factories/creation';
import { createVideoProjectMotionRegion } from '../../features/video/project/motion';
import { normalizeVideoProjectCursorSkin } from '../../features/video/project/cursor';
import { createRecordingCursorAvailabilityReader } from './cursor-trajectory';

const databases: { name: string; db: IDBPDatabase }[] = [];
let sequence = 0;
beforeEach(() =>
  installPersistenceLockManagerForTests({
    request: async (_name, _options, operation) => operation({}),
  })
);
afterEach(async () => {
  installPersistenceLockManagerForTests(null);
  vi.restoreAllMocks();
  for (const { name, db } of databases.splice(0)) {
    db.close();
    await deleteDB(name);
  }
});
async function fixture() {
  const name = `cursor-availability-${++sequence}`;
  const db = await openDB(name, DB_VERSION, { upgrade: handleDatabaseUpgrade });
  databases.push({ name, db });
  const dependencies = {
    database: vi.fn(async () => db),
    mintGeneration: vi.fn(() => `generation-${sequence}`),
  };
  const identity = { recordingId: 'recording', trajectoryId: 'b'.repeat(32) },
    geometry = { width: 100, height: 100 };
  const store = createRecordingCursorTrajectoryStore(dependencies),
    writer = await store.begin(identity, geometry);
  const packer = createCursorTrajectoryBlockPacker(identity.recordingId, identity.trajectoryId);
  const blocks = packer.append({
    kind: 'segment',
    segmentId: 0,
    activeTimeUs: 0,
    ...geometry,
    reason: 'start',
    clock: {
      source: 'dom-event-time',
      timestampQuantumUs: null,
      resolutionBoundUs: null,
      mappingUncertaintyUs: null,
    },
  });
  blocks.push(
    ...packer.append({
      kind: 'sample',
      segmentId: 0,
      observationSeq: 0,
      activeTimeUs: 1000000,
      xQ8: 2560,
      yQ8: 5120,
      visible: true,
      observed: true,
      event: 'move',
      button: 'none',
      relatedObservationSeq: null,
      anchors: [],
    }),
    ...packer.append({ kind: 'boundary', segmentId: 0, activeTimeUs: 3000000, reason: 'stop' }),
    ...packer.finish()
  );
  for (const block of blocks) await store.append(writer, block);
  await store.finalize(writer, packer.summary(), 'complete');
  const descriptor: CursorTrajectoryDescriptor = {
    format: 'cursor-trajectory-v1',
    formatVersion: 1,
    algorithm: 'sed-window-v1',
    encoding: 'json-ascii-int-v1',
    trajectoryId: identity.trajectoryId,
    state: 'complete',
    finalized: true,
    ...packer.summary(),
  };
  const project = createVideoProjectFromRecording({
    recordingId: identity.recordingId,
    filename: 'capture.webm',
    ...geometry,
    duration: 4,
    mimeType: 'video/webm',
    size: 10,
  });
  const clip = project.clips.find((item) => item.type === 'VIDEO');
  if (!clip) throw new Error('Missing source.');
  project.cursorTrack = {
    captureMode: 'separate',
    skin: normalizeVideoProjectCursorSkin(undefined),
    samples: [],
    sourceObservations: [
      {
        recordingId: identity.recordingId,
        sourceInstanceId: clip.sourceInstanceId!,
        samples: [],
        trajectory: descriptor,
      },
    ],
  };
  const region = {
    ...createVideoProjectMotionRegion(project, 0),
    duration: 3,
    sourceBinding: {
      clipId: clip.id,
      coordinateSpace: 'source-window' as const,
      sourceStart: 0,
      sourceEnd: 3,
      animation: { start: 0, end: 3, duration: 3 },
    },
  };
  dependencies.database.mockClear();
  dependencies.mintGeneration.mockClear();
  return { db, dependencies, identity, store, project, region };
}

it('uses finalized packed DB history without mutating or hydrating the saved project', async () => {
  const { dependencies, project, region, store, identity } = await fixture();
  const before = JSON.stringify(project),
    head = await store.getHead(identity);
  const reader = createRecordingCursorAvailabilityReader(dependencies);
  expect(await reader.available(project, region)).toBe(true);
  expect(JSON.stringify(project)).toBe(before);
  expect(await store.getHead(identity)).toEqual(head);
  expect(dependencies.mintGeneration).not.toHaveBeenCalled();
  reader.clear();
});

it('rechecks retirement and missing heads even when a positive window was cached', async () => {
  const { dependencies, project, region, store, identity, db } = await fixture();
  const reader = createRecordingCursorAvailabilityReader(dependencies);
  expect(await reader.available(project, region)).toBe(true);
  await store.retire(identity);
  expect(await reader.available(project, region)).toBe(false);
  await db.delete(RECORDING_CURSOR_TRAJECTORIES_STORE, [
    identity.recordingId,
    identity.trajectoryId,
  ]);
  expect(await reader.available(project, region)).toBe(false);
  expect(project.cursorTrack?.samples).toEqual([]);
});

it('propagates descriptor integrity refusal and recovers after a fresh valid request', async () => {
  const { dependencies, project, region } = await fixture();
  const reader = createRecordingCursorAvailabilityReader(dependencies);
  const track = project.cursorTrack!,
    group = track.sourceObservations![0]!;
  const wrong = {
    ...project,
    cursorTrack: {
      ...track,
      sourceObservations: [
        {
          ...group,
          trajectory: { ...group.trajectory!, totalSamples: group.trajectory!.totalSamples + 1 },
        },
      ],
    },
  };
  await expect(reader.available(wrong, region)).rejects.toMatchObject({ code: 'integrity' });
  expect(await reader.available(project, region)).toBe(true);
});

it('clears the bounded reader instead of reusing its completed window', async () => {
  const { dependencies, project, region } = await fixture();
  const reader = createRecordingCursorAvailabilityReader(dependencies);
  expect(await reader.available(project, region)).toBe(true);
  dependencies.database.mockClear();
  expect(await reader.available(project, region)).toBe(true);
  const cachedReads = dependencies.database.mock.calls.length;
  reader.clear();
  dependencies.database.mockClear();
  expect(await reader.available(project, region)).toBe(true);
  expect(dependencies.database.mock.calls.length).toBeGreaterThan(cachedReads);
});

it('refuses a generation change between head admission and window acquisition', async () => {
  const { dependencies, project, region, db, identity } = await fixture();
  const key = [identity.recordingId, identity.trajectoryId];
  dependencies.database
    .mockImplementationOnce(async () => db)
    .mockImplementationOnce(async () => {
      const head = await db.get(RECORDING_CURSOR_TRAJECTORIES_STORE, key);
      await db.put(RECORDING_CURSOR_TRAJECTORIES_STORE, {
        ...head,
        writerGeneration: 'replacement-generation',
      });
      return db;
    });
  const reader = createRecordingCursorAvailabilityReader(dependencies);
  await expect(reader.available(project, region)).rejects.toMatchObject({ code: 'conflict' });
  reader.clear();
  expect(await reader.available(project, region)).toBe(true);
});

it('uses the same bounded reader for a standalone selected source interval without a camera pose', async () => {
  const { dependencies, project, region } = await fixture();
  const reader = createRecordingCursorAvailabilityReader(dependencies);
  const before = JSON.stringify(project);
  expect(
    await reader.available(project, { startTime: region.startTime, duration: region.duration })
  ).toBe(true);
  expect(JSON.stringify(project)).toBe(before);
  reader.clear();
});

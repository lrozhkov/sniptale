import {
  preparedProjectCamera,
  withoutPreparedProjectCamera,
} from '../../features/video/composition/motion/prepared-project-camera';
import { resolveProjectCameraConflicts } from '../../features/video/composition/motion/project-follow';
import { VideoMotionFocusMode } from '../../features/video/project/types';
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
import {
  createRecordingCursorAvailabilityReader,
  createRecordingCursorTrajectoryRenderer,
} from './cursor-trajectory';

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

it('reuses numeric camera preparation across event presentation, FPS and project-label clones', async () => {
  const { project, region, dependencies } = await fixture();
  project.motionRegions = [{ ...region, focusMode: VideoMotionFocusMode.CURSOR }];
  const eventDescriptor = {
    format: 'recording-events-v1',
    formatVersion: 1,
    algorithm: 'lossless-v1',
    encoding: 'json-utf8-v1',
    eventStreamId: 'c'.repeat(32),
    state: 'complete',
    finalized: true,
    totalBlocks: 0,
    totalRecords: 0,
    totalActions: 0,
    totalSignals: 0,
    totalBytes: 0,
    streamSha256: 'd'.repeat(64),
  } as const;
  project.actionFeedback = [
    {
      recordingId: 'recording',
      sourceInstanceId: project.cursorTrack!.sourceObservations![0]!.sourceInstanceId,
      settings: [],
      signals: [],
      events: eventDescriptor,
    },
  ];
  const renderer = createRecordingCursorTrajectoryRenderer(dependencies);
  const prepared = await renderer.prepareCamera(project);
  const bundle = preparedProjectCamera(prepared);
  dependencies.database.mockClear();
  const clone = {
    ...project,
    fps: 60,
    name: 'Renamed',
    updatedAt: project.updatedAt + 1,
    actionFeedback: project.actionFeedback.map((group) => ({
      ...group,
      settings: [],
      signals: [
        {
          id: 'loaded-window',
          kind: 'cursor-idle' as const,
          startTime: 2,
          endTime: 3,
          point: { x: 0.5, y: 0.5 },
          data: {},
        },
      ],
    })),
  };
  expect(preparedProjectCamera(await renderer.prepareCamera(clone))).toBe(bundle);
  expect(dependencies.database).not.toHaveBeenCalled();
  expect(JSON.stringify(prepared)).toBe(JSON.stringify(project));
  const resized = await renderer.prepareCamera(project, { width: 50, height: 50 });
  expect(preparedProjectCamera(resized)).not.toBe(bundle);
  const skin = {
    ...project,
    cursorTrack: { ...project.cursorTrack!, skin: { ...project.cursorTrack!.skin, hidden: true } },
  };
  expect(preparedProjectCamera(await renderer.prepareCamera(skin))).not.toBe(bundle);
  renderer.clear();
});

it('keeps shared camera acquisition alive when one caller aborts or a frame read completes', async () => {
  const { project, region, dependencies, db } = await fixture();
  project.motionRegions = [{ ...region, focusMode: VideoMotionFocusMode.CURSOR }];
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  dependencies.database.mockImplementationOnce(async () => {
    entered.resolve();
    await release.promise;
    return db;
  });
  const renderer = createRecordingCursorTrajectoryRenderer(dependencies);
  const controller = new AbortController();
  const first = renderer.prepareCamera(project, undefined, controller.signal);
  const refused = expect(first).rejects.toMatchObject({ name: 'AbortError' });
  await entered.promise;
  const second = renderer.prepareCamera(project);
  controller.abort();
  await refused;
  await renderer.prepare(project, 1);
  release.resolve();
  expect(preparedProjectCamera(await second)).toBeDefined();
  renderer.clear();
});

it.each(['clear', 'source replacement'] as const)(
  'prevents publication after %s and permits a fresh retry',
  async (operation) => {
    const { project, region, dependencies, db } = await fixture();
    project.motionRegions = [{ ...region, focusMode: VideoMotionFocusMode.CURSOR }];
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    dependencies.database.mockImplementationOnce(async () => {
      entered.resolve();
      await release.promise;
      return db;
    });
    const renderer = createRecordingCursorTrajectoryRenderer(dependencies);
    const first = renderer.prepareCamera(project);
    const refused = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await entered.promise;
    if (operation === 'clear') renderer.clear();
    const replacement = { ...project, width: 200 };
    const fresh = await renderer.prepareCamera(replacement);
    release.resolve();
    await refused;
    expect(preparedProjectCamera(await renderer.prepareCamera(replacement))).toBe(
      preparedProjectCamera(fresh)
    );
    expect(preparedProjectCamera(await renderer.prepareCamera(project))).not.toBe(
      preparedProjectCamera(fresh)
    );
    renderer.clear();
  }
);

it('does not acquire archives for bare, manual, hidden, or unsupported legacy retained cameras', async () => {
  const { project, region, dependencies } = await fixture();
  const renderer = createRecordingCursorTrajectoryRenderer(dependencies);
  expect(await renderer.prepareCamera(project)).toBe(project);
  const manual = {
    ...project,
    motionRegions: [{ ...region, focusMode: VideoMotionFocusMode.MANUAL }],
  };
  expect(await renderer.prepareCamera(manual)).toBe(manual);
  const hidden = {
    ...project,
    motionRegions: [{ ...region, focusMode: VideoMotionFocusMode.CURSOR }],
    utilityLanes: {
      camera: { visible: false, locked: false },
      actions: { visible: true, locked: false },
    },
  };
  expect(await renderer.prepareCamera(hidden)).toBe(hidden);
  const legacy = {
    ...project,
    motionRegions: [{ ...region, focusMode: VideoMotionFocusMode.CURSOR }],
    clips: project.clips.map((clip) => ({ ...clip, playbackWindow: { offset: 0 } })),
    cursorTrack: {
      ...project.cursorTrack!,
      samples: [{ id: 'legacy', time: 0, x: 0, y: 0, visible: true }],
    },
  };
  expect(await renderer.prepareCamera(legacy)).toBe(legacy);
  expect(dependencies.database).not.toHaveBeenCalled();
  renderer.clear();
});

it('reuses a valid attached bundle in another renderer owner without rereading its archives', async () => {
  const { project, region, dependencies } = await fixture();
  project.motionRegions = [{ ...region, focusMode: VideoMotionFocusMode.CURSOR }];
  const preview = createRecordingCursorTrajectoryRenderer(dependencies);
  const prepared = await preview.prepareCamera(project);
  const materializer = createRecordingCursorTrajectoryRenderer(dependencies);
  dependencies.database.mockClear();
  expect(await materializer.prepareCamera(prepared)).toBe(prepared);
  expect(preparedProjectCamera(await materializer.prepareCamera(project))).toBe(
    preparedProjectCamera(prepared)
  );
  expect(dependencies.database).not.toHaveBeenCalled();
  const resized = await materializer.prepareCamera(prepared, { width: 50, height: 50 });
  expect(preparedProjectCamera(resized)).not.toBe(preparedProjectCamera(prepared));
  expect(dependencies.database).toHaveBeenCalled();
  dependencies.database.mockClear();
  const changed = await materializer.prepareCamera({ ...prepared, width: 200 });
  expect(preparedProjectCamera(changed)).not.toBe(preparedProjectCamera(prepared));
  expect(dependencies.database).toHaveBeenCalled();
  preview.clear();
  materializer.clear();
});

it.each(['hidden', 'unsupported legacy', 'removed'] as const)(
  'removes a prior prepared camera when its authored flow becomes %s',
  async (transition) => {
    const { project, region, dependencies } = await fixture();
    project.motionRegions = [{ ...region, focusMode: VideoMotionFocusMode.CURSOR }];
    const renderer = createRecordingCursorTrajectoryRenderer(dependencies);
    const prepared = await renderer.prepareCamera(project);
    expect(preparedProjectCamera(prepared)).toBeDefined();
    const changed =
      transition === 'hidden'
        ? {
            ...prepared,
            utilityLanes: {
              camera: { visible: false, locked: false },
              actions: { visible: true, locked: false },
            },
          }
        : transition === 'removed'
          ? { ...prepared, motionRegions: [] }
          : {
              ...prepared,
              clips: prepared.clips.map((clip) => ({ ...clip, playbackWindow: { offset: 0 } })),
              cursorTrack: {
                ...prepared.cursorTrack!,
                samples: [{ id: 'legacy', time: 0, x: 0, y: 0, visible: true }],
              },
            };
    dependencies.database.mockClear();
    const restored = await renderer.prepareCamera(changed);
    expect(preparedProjectCamera(restored)).toBeUndefined();
    expect(resolveProjectCameraConflicts(restored)).toEqual(
      resolveProjectCameraConflicts(withoutPreparedProjectCamera(changed))
    );
    expect(JSON.stringify(restored)).toBe(JSON.stringify(changed));
    expect(dependencies.database).not.toHaveBeenCalled();
    renderer.clear();
  }
);

import { expect, it, vi } from 'vitest';
import { motionRegionHasAvailableCursor, sameCursorAvailabilitySource } from './availability';
import { createCursorTrajectoryBlockPacker, decodeCursorTrajectoryBlock } from './blocks';
import { createRecordingCursorTrajectoryReader } from '../../../../composition/persistence/recordings/cursor-trajectory/reader';
import type { RecordingCursorTrajectoryHead } from '../../../../composition/persistence/recordings/cursor-trajectory/contracts';
import { createVideoProjectFromRecording } from '../factories/creation';
import { createVideoProjectMotionRegion } from '../motion';
import { normalizeVideoProjectCursorSkin } from '../cursor';
import type {
  CursorTrajectoryDescriptor,
  CursorTrajectoryRecord,
  CursorTrajectorySegment,
} from './types';
import type { ReadCursorTrajectoryWindow } from './project-window';

const identity = { recordingId: 'recording', trajectoryId: 'a'.repeat(32) };
function sample(time: number, visible = true): CursorTrajectoryRecord {
  return {
    kind: 'sample',
    segmentId: 0,
    observationSeq: time,
    activeTimeUs: time,
    xQ8: visible ? 2560 : null,
    yQ8: visible ? 5120 : null,
    observed: visible,
    visible,
    event: 'move',
    button: 'none',
    relatedObservationSeq: null,
    anchors: [],
  };
}
function fixture(records: CursorTrajectoryRecord[] = [sample(1000000), sample(2000000)]) {
  const segment: CursorTrajectorySegment = {
    kind: 'segment',
    segmentId: 0,
    activeTimeUs: 0,
    reason: 'start',
    width: 100,
    height: 100,
    clock: {
      source: 'dom-event-time',
      timestampQuantumUs: null,
      resolutionBoundUs: null,
      mappingUncertaintyUs: null,
    },
  };
  const writer = createCursorTrajectoryBlockPacker(identity.recordingId, identity.trajectoryId);
  const packed = writer.append(segment);
  for (const record of records) packed.push(...writer.append(record));
  packed.push(...writer.finish());
  const descriptor: CursorTrajectoryDescriptor = {
    format: 'cursor-trajectory-v1',
    formatVersion: 1,
    algorithm: 'sed-window-v1',
    encoding: 'json-ascii-int-v1',
    trajectoryId: identity.trajectoryId,
    state: 'complete',
    finalized: true,
    ...writer.summary(),
  };
  const head: RecordingCursorTrajectoryHead = {
    ...identity,
    ...writer.summary(),
    sourceRecordingId: identity.recordingId,
    writerGeneration: 'generation',
    revision: 1,
    width: 100,
    height: 100,
    retired: false,
    finalized: true,
    state: 'complete',
    activeSegment: segment,
    lastObservationSeq: null,
    lastSegmentId: 0,
    lastTimeUs: 2000000,
  };
  let initial: CursorTrajectorySegment | null = null;
  const rows = packed.map((block) => {
    const row = {
      ...identity,
      sequence: block.entry.sequence,
      startTimeUs: block.entry.startTimeUs,
      entry: block.entry,
      initialSegment: initial,
      bytes: block.bytes,
    };
    const decoded = decodeCursorTrajectoryBlock(block.bytes, initial);
    if (!decoded) throw new Error('Invalid packed fixture.');
    for (const record of decoded.records) {
      if (record.kind === 'segment') initial = record;
      if (record.kind === 'boundary' || record.kind === 'gap') initial = null;
    }
    return row;
  });
  const readWindow = vi.fn(async (_identity: typeof identity, time: number) => {
    const current = Math.max(
      0,
      rows.findLastIndex((row) => row.startTimeUs <= time)
    );
    return {
      head,
      blocks: rows.slice(Math.max(0, current - 1), current + 2),
      fromTimeUs: rows[current]?.startTimeUs ?? 0,
      toTimeUs: rows[current + 1]?.startTimeUs ?? null,
    };
  });
  const reader = createRecordingCursorTrajectoryReader({ getHead: async () => head, readWindow });
  const read = vi.fn<ReadCursorTrajectoryWindow>((...args) => reader.read(...args));
  const project = createVideoProjectFromRecording({
    recordingId: identity.recordingId,
    filename: 'capture.webm',
    width: 100,
    height: 100,
    duration: 10,
    mimeType: 'video/webm',
    size: 100,
  });
  const clip = project.clips.find((item) => item.type === 'VIDEO');
  if (!clip || clip.type !== 'VIDEO') throw new Error('Missing source.');
  clip.sourceInstanceId = 'instance';
  project.cursorTrack = {
    captureMode: 'separate',
    skin: normalizeVideoProjectCursorSkin(undefined),
    samples: [],
    sourceObservations: [
      { ...identity, sourceInstanceId: 'instance', samples: [], trajectory: descriptor },
    ],
  };
  const region = {
    ...createVideoProjectMotionRegion(project, 0),
    startTime: 0,
    duration: 3,
    sourceBinding: {
      clipId: clip.id,
      coordinateSpace: 'source-window' as const,
      sourceStart: 0,
      sourceEnd: 3,
      animation: { start: 0, end: 3, duration: 3 },
    },
  };
  return { project, clip, region, read, reader, readWindow };
}

it('admits a real packed archived observation without hydrating either inline sample array', async () => {
  const { project, region, read } = fixture();
  const before = JSON.stringify(project);
  expect(await motionRegionHasAvailableCursor(project, region, read)).toBe(true);
  expect(project.cursorTrack?.samples).toEqual([]);
  expect(project.cursorTrack?.sourceObservations?.[0]?.samples).toEqual([]);
  expect(JSON.stringify(project)).toBe(before);
});

it('finds a short visible run beyond three probes with bounded sequential windows', async () => {
  const { project, region, read, reader } = fixture(
    Array.from({ length: 6000 }, (_, index) => sample(index * 2000, index === 3567))
  );
  region.duration = 10;
  expect(await motionRegionHasAvailableCursor(project, region, read)).toBe(true);
  expect(read.mock.calls.length).toBeGreaterThan(3);
  expect(read.mock.calls.map((call) => call[2])).toEqual(
    [...read.mock.calls.map((call) => call[2])].sort((a, b) => a - b)
  );
  expect(reader.cachedWindowCount).toBeLessThanOrEqual(4);
});

it.each(['missing-clip', 'other-instance', 'outside-interval'] as const)(
  'rejects %s before reading another source',
  async (kind) => {
    const { project, region, clip, read } = fixture();
    if (kind === 'missing-clip') region.sourceBinding.clipId = 'missing';
    if (kind === 'other-instance') clip.sourceInstanceId = 'other';
    if (kind === 'outside-interval') region.startTime = 20;
    expect(await motionRegionHasAvailableCursor(project, region, read)).toBe(false);
    expect(read).not.toHaveBeenCalled();
  }
);

it('uses the canonical trim and playback-rate mapping', async () => {
  const { project, region, clip, read } = fixture([sample(7250000), sample(8000000)]);
  Object.assign(clip, {
    startTime: 2,
    sourceStart: 5,
    sourceDuration: 8,
    playbackRate: 2,
    duration: 4,
  });
  region.startTime = 3;
  region.duration = 1;
  expect(await motionRegionHasAvailableCursor(project, region, read)).toBe(true);
  expect(read.mock.calls[0]?.[2]).toBe(7000000);
});

it.each([-1, 0, 1])(
  'keeps the increasing source right boundary half-open at end%+dus',
  async (delta) => {
    const { project, region, read } = fixture([sample(2000000 + delta)]);
    region.startTime = 1;
    region.duration = 1;
    expect(await motionRegionHasAvailableCursor(project, region, read)).toBe(delta < 0);
  }
);

it('admits a held point only when the plateau begins before the excluded project end', async () => {
  const { project, region, clip, read } = fixture([sample(4000000)]);
  Object.assign(clip, {
    startTime: 2,
    sourceStart: 0,
    sourceDuration: 10,
    playbackRate: 2,
    duration: 4,
    playbackWindow: { offset: 1, holdAt: 2 },
  });
  region.startTime = 2;
  region.duration = 1;
  expect(await motionRegionHasAvailableCursor(project, region, read)).toBe(false);
  region.duration = 2;
  expect(await motionRegionHasAvailableCursor(project, region, read)).toBe(true);
  region.startTime = 3.2;
  region.duration = 1;
  expect(await motionRegionHasAvailableCursor(project, region, read)).toBe(true);
});

it('includes a source-duration clamp plateau through the same clip mapping', async () => {
  const { project, region, clip, read } = fixture([sample(2000000)]);
  Object.assign(clip, { sourceDuration: 2, duration: 4, playbackWindow: { offset: 0 } });
  region.startTime = 3;
  region.duration = 0.5;
  expect(await motionRegionHasAvailableCursor(project, region, read)).toBe(true);
});

it('checks interpolation at the interval entrance but never extends an unfinished prefix', async () => {
  const interpolated = fixture();
  interpolated.region.startTime = 1.2;
  interpolated.region.duration = 0.5;
  expect(
    await motionRegionHasAvailableCursor(
      interpolated.project,
      interpolated.region,
      interpolated.read
    )
  ).toBe(true);
  const prefix = fixture([sample(1000000)]);
  prefix.region.startTime = 2;
  prefix.region.duration = 1;
  expect(await motionRegionHasAvailableCursor(prefix.project, prefix.region, prefix.read)).toBe(
    false
  );
});

it('rejects gaps and unobserved facts without treating descriptor totals as evidence', async () => {
  const gap = fixture([
    sample(1000000),
    {
      kind: 'gap',
      segmentId: 0,
      fromTimeUs: 1100000,
      toTimeUs: 3000000,
      firstLostObservationSeq: null,
      lastLostObservationSeq: null,
      reason: 'source-unavailable',
    },
  ]);
  gap.region.startTime = 1.2;
  gap.region.duration = 0.5;
  expect(await motionRegionHasAvailableCursor(gap.project, gap.region, gap.read)).toBe(false);
  const blur = fixture([sample(0, false), sample(2000000, false)]);
  expect(await motionRegionHasAvailableCursor(blur.project, blur.region, blur.read)).toBe(false);
});

it('does not admit a visible neighboring record outside the returned coverage', async () => {
  const { project, region } = fixture();
  const records: CursorTrajectoryRecord[] = [
    {
      kind: 'segment',
      segmentId: 0,
      activeTimeUs: 0,
      reason: 'start',
      width: 100,
      height: 100,
      clock: {
        source: 'dom-event-time',
        timestampQuantumUs: null,
        resolutionBoundUs: null,
        mappingUncertaintyUs: null,
      },
    },
    sample(1000000),
  ];
  const read = vi
    .fn<ReadCursorTrajectoryWindow>()
    .mockResolvedValueOnce({ fromTimeUs: 0, toTimeUs: 500000, initialSegment: null, records })
    .mockResolvedValue(null);
  expect(await motionRegionHasAvailableCursor(project, region, read)).toBe(false);
  expect(read.mock.calls.map((call) => call[2])).toEqual([0, 500000]);
});

it('stops nonprogress and aborts an in-flight scan before the next window', async () => {
  const { project, region } = fixture();
  const stalled = vi.fn<ReadCursorTrajectoryWindow>(async () => ({
    fromTimeUs: 0,
    toTimeUs: 0,
    records: [],
    initialSegment: null,
  }));
  expect(await motionRegionHasAvailableCursor(project, region, stalled)).toBe(false);
  expect(stalled).toHaveBeenCalledOnce();
  let resolve!: (value: Awaited<ReturnType<ReadCursorTrajectoryWindow>>) => void;
  const pending = new Promise<Awaited<ReturnType<ReadCursorTrajectoryWindow>>>((yes) => {
    resolve = yes;
  });
  const read = vi.fn<ReadCursorTrajectoryWindow>(() => pending),
    controller = new AbortController();
  const scan = motionRegionHasAvailableCursor(project, region, read, controller.signal);
  controller.abort();
  resolve({ fromTimeUs: 0, toTimeUs: 500000, records: [], initialSegment: null });
  await expect(scan).rejects.toMatchObject({ name: 'AbortError' });
  expect(read).toHaveBeenCalledOnce();
});

it('retains authored short segments but rejects another source instance for a bound region', async () => {
  const { project, region } = fixture();
  const key = {
    id: 'key',
    time: 1.1,
    x: 0.2,
    y: 0.4,
    anchor: 'manual' as const,
    interpolation: 'hold' as const,
  };
  project.cursorFocusPath = {
    version: 1,
    smoothing: 0.5,
    sensitivity: 0.5,
    mode: 'follow',
    gapPolicy: 'hold',
    segments: [{ id: 'authored', binding: { kind: 'project' }, start: 1.1, end: 1.2, keys: [key] }],
  };
  const read = vi.fn<ReadCursorTrajectoryWindow>(async () => null);
  expect(await motionRegionHasAvailableCursor(project, region, read)).toBe(true);
  expect(read).not.toHaveBeenCalled();
  const foreign = {
    ...project,
    cursorFocusPath: {
      ...project.cursorFocusPath,
      segments: project.cursorFocusPath.segments.map((segment) => ({
        ...segment,
        binding: {
          kind: 'recording-source' as const,
          recordingId: identity.recordingId,
          sourceInstanceId: 'other',
        },
      })),
    },
  };
  expect(await motionRegionHasAvailableCursor(foreign, region, read)).toBe(false);
});

it('checks only matching intersecting video sources for an unbound region', async () => {
  const { project, region, clip, read } = fixture();
  project.clips.push({ ...clip, id: 'other-clip', sourceInstanceId: 'other', startTime: 1 });
  project.cursorTrack!.sourceObservations![0]!.sourceInstanceId = 'other';
  const { sourceBinding: _binding, ...unbound } = region;
  expect(await motionRegionHasAvailableCursor(project, unbound, read)).toBe(true);
  expect(read.mock.calls[0]?.[0]).toEqual(identity);
  expect(await motionRegionHasAvailableCursor(project, region, read)).toBe(false);
});

it('rejects a collapsed canonical interval and missing windows without invented points', async () => {
  const { project, region, read } = fixture();
  const collapsed = { ...region, startTime: 0.0000001, duration: 0.0000002 };
  expect(await motionRegionHasAvailableCursor(project, collapsed, read)).toBe(false);
  expect(read).not.toHaveBeenCalled();
  const missing = vi.fn<ReadCursorTrajectoryWindow>(async () => null);
  expect(await motionRegionHasAvailableCursor(project, region, missing)).toBe(false);
});

it('accepts a plain selected interval while preserving source and clip ownership checks', async () => {
  const { project, region, read } = fixture();
  expect(
    await motionRegionHasAvailableCursor(
      project,
      { startTime: region.startTime, duration: region.duration },
      read
    )
  ).toBe(true);
  expect(
    await motionRegionHasAvailableCursor(
      project,
      {
        startTime: region.startTime,
        duration: region.duration,
        sourceBinding: { ...region.sourceBinding!, clipId: 'missing' },
      },
      read
    )
  ).toBe(false);
});

it('keeps camera-only updates separate from recording and source-time admission', () => {
  const { project, region, clip } = fixture();
  const before = JSON.stringify(project);
  expect(sameCursorAvailabilitySource(project, project)).toBe(true);
  expect(
    sameCursorAvailabilitySource(project, {
      ...project,
      updatedAt: project.updatedAt + 1,
      motionRegions: [{ ...region, scale: 2 }],
    })
  ).toBe(true);
  expect(
    sameCursorAvailabilitySource(project, {
      ...project,
      clips: [{ ...clip, sourceStart: clip.sourceStart + 1 }],
    })
  ).toBe(false);
  const group = project.cursorTrack!.sourceObservations![0]!;
  expect(
    sameCursorAvailabilitySource(project, {
      ...project,
      cursorTrack: {
        ...project.cursorTrack!,
        sourceObservations: [{ ...group, recordingId: 'another-recording' }],
      },
    })
  ).toBe(false);
  expect(sameCursorAvailabilitySource(undefined, project)).toBe(false);
  expect(sameCursorAvailabilitySource(undefined, undefined)).toBe(true);
  expect(JSON.stringify(project)).toBe(before);
});

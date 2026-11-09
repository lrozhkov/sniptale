import { expect, it, vi } from 'vitest';
import {
  resolveCursorSample,
  resolveObservedCursorPosition,
} from '../../composition/timeline/frame/cursor';
import { createVideoProjectFromRecording } from '../factories/creation';
import { normalizeVideoProjectCursorSkin } from '../cursor';
import { applyVideoProjectMutationPatch } from '../mutation';
import { isExportReadyVideoProject } from '../validation/root';
import { resolveProjectSourceCursorObservation } from '../cursor-focus-path/projection';
import {
  prepareCameraCursorTrajectoryProject,
  prepareCursorTrajectoryProject,
  preparedCursorTrajectorySourceWindow,
  cursorTrajectoryProjectCoversTime,
  cursorTrajectoryProjectHasPreparedPosition,
  type ReadCursorTrajectoryWindow,
} from './project-window';
import type {
  CursorTrajectoryDescriptor,
  CursorTrajectoryRecord,
  CursorTrajectorySegment,
} from './types';

const descriptor: CursorTrajectoryDescriptor = {
  format: 'cursor-trajectory-v1',
  formatVersion: 1,
  algorithm: 'sed-window-v1',
  encoding: 'json-ascii-int-v1',
  trajectoryId: '0123456789abcdef0123456789abcdef',
  state: 'complete',
  finalized: true,
  totalBlocks: 10000,
  totalRecords: 1000000,
  totalSamples: 900000,
  totalBytes: 50000000,
  streamSha256: 'a'.repeat(64),
};
function fixture() {
  const project = createVideoProjectFromRecording({
    recordingId: 'recording',
    filename: 'capture.webm',
    width: 100,
    height: 100,
    duration: 20,
    mimeType: 'video/webm',
    size: 100,
  });
  const clip = project.clips[0];
  if (!clip || clip.type !== 'VIDEO') throw new Error('Missing source.');
  clip.sourceInstanceId = 'instance';
  clip.startTime = 2;
  clip.sourceStart = 0;
  clip.sourceDuration = 1;
  clip.playbackRate = 2;
  clip.duration = 0.5;
  return applyVideoProjectMutationPatch(project, {
    cursorTrack: {
      captureMode: 'separate',
      skin: normalizeVideoProjectCursorSkin(undefined),
      samples: [],
      sourceObservations: [
        {
          recordingId: 'recording',
          sourceInstanceId: 'instance',
          trajectory: descriptor,
          samples: [],
        },
      ],
    },
  });
}
function window(from = 0, segmentId = 0) {
  const segment: CursorTrajectorySegment = {
    kind: 'segment',
    segmentId,
    activeTimeUs: from,
    width: 100,
    height: 100,
    reason: segmentId ? 'resume' : 'start',
    clock: {
      source: 'dom-event-time',
      timestampQuantumUs: null,
      resolutionBoundUs: null,
      mappingUncertaintyUs: null,
    },
  };
  const records: CursorTrajectoryRecord[] = [segment];
  for (const [i, x] of [10, 90].entries())
    records.push({
      kind: 'sample',
      segmentId,
      observationSeq: segmentId * 2 + i,
      activeTimeUs: from + i * 1000000,
      xQ8: x * 256,
      yQ8: 20 * 256,
      observed: true,
      visible: true,
      event: 'move',
      button: 'none',
      relatedObservationSeq: null,
      anchors: [],
    });
  records.push({ kind: 'boundary', segmentId, activeTimeUs: from + 1500000, reason: 'stop' });
  return { fromTimeUs: from, toTimeUs: from + 2000000, records, initialSegment: null };
}

it('proves retained adjacent positions without extending the active read or render window', async () => {
  const project = fixture();
  const read = vi.fn<ReadCursorTrajectoryWindow>(async () => ({ ...window(), toTimeUs: 500000 }));
  const prepared = await prepareCursorTrajectoryProject(project, 2.1, read);
  const before = JSON.stringify(prepared);
  expect(cursorTrajectoryProjectCoversTime(prepared, 2.4)).toBe(false);
  expect(cursorTrajectoryProjectHasPreparedPosition(prepared, 2.4)).toBe(true);
  expect(resolveCursorSample(prepared, 2.4)).toBeNull();
  expect(cursorTrajectoryProjectHasPreparedPosition(project, 2.4)).toBe(false);
  expect(cursorTrajectoryProjectHasPreparedPosition(prepared, 1.9)).toBe(false);
  expect(cursorTrajectoryProjectHasPreparedPosition(prepared, 2.6)).toBe(false);
  expect(JSON.stringify(prepared)).toBe(before);
  expect(read).toHaveBeenCalledOnce();
  const track = prepared.cursorTrack;
  const group = track?.sourceObservations?.[0];
  if (!track || !group) throw new Error('Missing trajectory source.');
  for (const changed of [
    { ...group, sourceInstanceId: 'other-instance' },
    { ...group, recordingId: 'other-recording' },
    { ...group, trajectory: { ...descriptor, trajectoryId: 'f'.repeat(32) } },
  ])
    expect(
      cursorTrajectoryProjectHasPreparedPosition(
        { ...prepared, cursorTrack: { ...track, sourceObservations: [changed] } },
        2.4
      )
    ).toBe(false);
});

it.each(['gap', 'outside', 'unfinished'] as const)(
  'does not retain a position across %s source facts',
  async (kind) => {
    const data = window();
    if (kind === 'gap')
      data.records = [
        ...data.records.slice(0, 2),
        { kind: 'boundary', segmentId: 0, activeTimeUs: 500000, reason: 'visibility' },
        ...window(1000000, 1).records,
      ];
    if (kind === 'outside')
      data.records = data.records.map((record) =>
        record.kind === 'sample' ? { ...record, visible: false } : record
      );
    if (kind === 'unfinished') data.records = data.records.slice(0, 2);
    const prepared = await prepareCursorTrajectoryProject(fixture(), 2.1, async () => ({
      ...data,
      toTimeUs: 500000,
    }));
    expect(cursorTrajectoryProjectHasPreparedPosition(prepared, 2.4)).toBe(false);
  }
);

it('renders the requested bounded source window at the clip rate without expanding saved facts', async () => {
  const project = fixture();
  const before = JSON.stringify(project);
  const read = vi.fn<ReadCursorTrajectoryWindow>(async () => window());
  const prepared = await prepareCursorTrajectoryProject(project, 2.25, read);
  expect(read).toHaveBeenCalledExactlyOnceWith(
    { recordingId: 'recording', trajectoryId: descriptor.trajectoryId },
    descriptor,
    500000
  );
  expect(resolveCursorSample(prepared, 2.25)).toMatchObject({
    x: 50,
    y: 20,
    recordingPoint: { x: 0.5, y: 0.2 },
  });
  expect(resolveObservedCursorPosition(prepared, 2.25)?.recordingPoint).toEqual({ x: 0.5, y: 0.2 });
  expect(resolveCursorSample(project, 2.25)).toBeNull();
  expect(JSON.stringify(project)).toBe(before);
  expect(JSON.stringify(prepared)).toBe(before);
  expect(isExportReadyVideoProject(prepared)).toBe(true);
  expect(prepared.cursorTrack?.sourceObservations?.[0]?.samples).toEqual([]);
});

it('keeps disjoint windows separate for simultaneous uses of one source instance', async () => {
  const project = fixture();
  const clip = project.clips[0];
  if (!clip || clip.type !== 'VIDEO') throw new Error('Missing source.');
  project.clips.push({
    ...clip,
    id: 'other',
    sourceStart: 10,
    sourceDuration: 1,
    playbackRate: 1,
    duration: 1,
  });
  const read = vi.fn<ReadCursorTrajectoryWindow>(async (_identity, _descriptor, timeUs: number) =>
    timeUs < 2000000 ? window() : window(10000000, 1)
  );
  const prepared = await prepareCursorTrajectoryProject(project, 2.25, read);
  expect(read.mock.calls.map((call) => call[2])).toEqual([500000, 10250000]);
  expect(cursorTrajectoryProjectHasPreparedPosition(prepared, 2.25)).toBe(true);
  const partial = await prepareCursorTrajectoryProject(
    project,
    2.25,
    async (_identity, _descriptor, timeUs) => (timeUs < 2000000 ? window() : null)
  );
  expect(cursorTrajectoryProjectHasPreparedPosition(partial, 2.25)).toBe(false);
  expect(resolveProjectSourceCursorObservation(prepared, 2.25, clip.id)?.recordingPoint?.x).toBe(
    0.5
  );
  expect(resolveProjectSourceCursorObservation(prepared, 2.25, 'other')?.recordingPoint?.x).toBe(
    0.3
  );
  expect(resolveProjectSourceCursorObservation(prepared, 2.75, 'other')?.recordingPoint?.x).toBe(
    0.7
  );
  expect(cursorTrajectoryProjectHasPreparedPosition(prepared, 2.75)).toBe(true);
});

it('does not load inactive sources or repeat a range read for an already loaded window', async () => {
  const project = fixture();
  const clip = project.clips[0];
  if (!clip || clip.type !== 'VIDEO') throw new Error('Missing source.');
  const read = vi.fn<ReadCursorTrajectoryWindow>(async () => window());
  expect(await prepareCursorTrajectoryProject(project, 1, read)).not.toBe(project);
  expect(read).not.toHaveBeenCalled();
  project.clips.push({ ...clip, id: 'same-window', sourceStart: 0.1 });
  await prepareCursorTrajectoryProject(project, 2.25, read);
  expect(read).toHaveBeenCalledTimes(1);
});

it('preserves gaps, unavailable ranges, exact endpoints and unfinished prefix limits', async () => {
  const project = fixture();
  const gap = window();
  gap.records = gap.records.slice(0, 2);
  gap.records.push({
    kind: 'gap',
    segmentId: 0,
    fromTimeUs: 600000,
    toTimeUs: 900000,
    firstLostObservationSeq: null,
    lastLostObservationSeq: null,
    reason: 'source-unavailable',
  });
  const prepared = await prepareCursorTrajectoryProject(project, 2.4, async () => gap);
  expect(resolveObservedCursorPosition(prepared, 2.25)?.recordingPoint?.x).toBe(0.1);
  expect(resolveObservedCursorPosition(prepared, 2.4)).toBeNull();
  const unfinished = window();
  unfinished.records.pop();
  const prefix = await prepareCursorTrajectoryProject(project, 2.5, async () => unfinished);
  const clipId = project.clips[0]?.id;
  expect(resolveObservedCursorPosition(prefix, 2.5, clipId)).toBeNull();
  expect(
    resolveObservedCursorPosition(prefix, 2.5, clipId, { includeSourceEnd: true })?.recordingPoint
      ?.x
  ).toBe(0.9);
  expect(resolveProjectSourceCursorObservation(prefix, 2.499)?.recordingPoint?.x).toBeCloseTo(
    0.8984
  );
  const missing = await prepareCursorTrajectoryProject(project, 2.25, async () => null);
  expect(resolveCursorSample(missing, 2.25)).toBeNull();
});

it('keeps authored cursor placement separate from the original observed geometry', async () => {
  const project = fixture();
  if (!project.cursorTrack) throw new Error('Missing track.');
  project.cursorTrack.samples = [{ id: 'manual', time: 2, x: 20, y: 80, visible: true }];
  const prepared = await prepareCursorTrajectoryProject(project, 2.25, async () => window());
  expect(resolveCursorSample(prepared, 2.25)).toMatchObject({ x: 20, y: 80 });
  expect(resolveObservedCursorPosition(prepared, 2.25)).toMatchObject({ x: 50, y: 20 });
});

it('preserves saved media and references when a reader refuses a window', async () => {
  const project = fixture();
  const before = structuredClone(project);
  await expect(
    prepareCursorTrajectoryProject(project, 2.25, async () => {
      throw new Error('Refused');
    })
  ).rejects.toThrow('Refused');
  expect(project).toEqual(before);
});

it('reuses only the same source project and validated windows, and checks moving playhead coverage', async () => {
  const project = fixture();
  const facts = window();
  const read = vi.fn<ReadCursorTrajectoryWindow>(async () => facts);
  const prepared = await prepareCursorTrajectoryProject(project, 2.1, read);
  expect(cursorTrajectoryProjectCoversTime(prepared, 2.3)).toBe(true);
  expect(cursorTrajectoryProjectCoversTime(project, 2.3)).toBe(false);
  expect(await prepareCursorTrajectoryProject(project, 2.3, read, prepared)).toBe(prepared);
  expect(read).toHaveBeenCalledTimes(2);
  const changed = { ...project, name: 'Changed' };
  expect(await prepareCursorTrajectoryProject(changed, 2.3, read, prepared)).not.toBe(prepared);
  const retired = await prepareCursorTrajectoryProject(project, 2.3, async () => null, prepared);
  expect(retired).not.toBe(prepared);
  expect(cursorTrajectoryProjectCoversTime(retired, 2.3)).toBe(false);
  expect(resolveCursorSample(retired, 2.3)).toBeNull();
});

it('does not read a raw archive for an explicitly unavailable zero-block trajectory', async () => {
  const project = fixture();
  project.cursorTrack!.sourceObservations![0]!.trajectory = {
    ...descriptor,
    state: 'unavailable',
    totalBlocks: 0,
    totalRecords: 0,
    totalSamples: 0,
    totalBytes: 0,
    streamSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  };
  const read = vi.fn(async () => {
    throw new Error('no-archive-must-be-requested');
  });
  const prepared = await prepareCursorTrajectoryProject(project, 2.25, read);
  expect(cursorTrajectoryProjectCoversTime(prepared, 2.25)).toBe(true);
  expect(read).not.toHaveBeenCalled();
});

it('adapts only prepared source points and the actual known end without changing project JSON', async () => {
  const project = fixture();
  const prepared = await prepareCursorTrajectoryProject(project, 2.25, async () => window());
  const source = preparedCursorTrajectorySourceWindow(
    prepared,
    'recording',
    descriptor.trajectoryId
  );
  expect(source?.samples[0]).toMatchObject({
    time: 0,
    x: 10,
    y: 20,
    visible: true,
    recordingPoint: { x: 0.1, y: 0.2 },
    captureSegment: 0,
  });
  expect(source?.samples.at(-1)).toMatchObject({ time: 1.5, visible: false, recordingPoint: null });
  expect(source?.knownEndSeconds).toBe(1.5);
  expect(JSON.stringify(prepared)).toBe(JSON.stringify(project));
  expect(
    preparedCursorTrajectorySourceWindow(prepared, 'another-recording', descriptor.trajectoryId)
  ).toBeUndefined();
});

it('acquires separate covering windows through the retained source endpoint without changing saved data', async () => {
  const project = fixture();
  const before = JSON.stringify(project);
  const read = vi.fn<ReadCursorTrajectoryWindow>(async (_identity, _descriptor, time) => ({
    ...window(),
    fromTimeUs: time < 500000 ? 0 : 500000,
    toTimeUs: time < 500000 ? 500000 : null,
  }));
  const scratch = await prepareCameraCursorTrajectoryProject(project, read);
  expect(read.mock.calls.map((call) => call[2])).toEqual([0, 500000]);
  expect(resolveCursorSample(scratch, 2.25)?.recordingPoint).toEqual({ x: 0.5, y: 0.2 });
  expect(JSON.stringify(scratch)).toBe(before);
  expect(JSON.stringify(project)).toBe(before);
});

it('refuses missing or noncovering camera support and stops a cancelled scan before its next read', async () => {
  const project = fixture();
  await expect(prepareCameraCursorTrajectoryProject(project, async () => null)).rejects.toThrow(
    'coverage'
  );
  await expect(
    prepareCameraCursorTrajectoryProject(project, async () => ({
      ...window(),
      fromTimeUs: 1,
      toTimeUs: 2,
    }))
  ).rejects.toThrow('coverage');
  const controller = new AbortController();
  const read = vi.fn<ReadCursorTrajectoryWindow>(async () => {
    controller.abort();
    return { ...window(), toTimeUs: 500000 };
  });
  await expect(
    prepareCameraCursorTrajectoryProject(project, read, controller.signal)
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(read).toHaveBeenCalledOnce();
});

import { expect, it } from 'vitest';
import { createVideoProjectFromRecording } from '../../project/factories/creation';
import { normalizeVideoProjectCursorSkin } from '../../project/cursor';
import { createVideoProjectMotionRegion } from '../../project/motion';
import { createCameraFollowSettings } from '../../project/camera/cursor-policy';
import { DEFAULT_CURSOR_COMPOSITION } from '../../project/motion/spatial';
import {
  prepareCameraCursorTrajectoryProject,
  prepareCursorTrajectoryProject,
} from '../../project/cursor-trajectory/project-window';
import type { CursorTrajectoryRecord } from '../../project/cursor-trajectory/types';
import { resolveCursorSample } from '../timeline/frame/cursor';
import { compileProjectCameraBundle } from './project-camera-preparation';
import {
  resolveProjectFollowingCamera,
  resolveProjectCursorCameraPlan,
  resolveProjectCameraConflicts,
} from './project-follow';
import { resolveProjectCursorOrientation, evaluateCursorOrientation } from './cursor-orientation';
import { bindMotionRegionToClip } from '../../project/motion/source-binding';
import { resolveVideoCompositionCamera } from './index';
import {
  attachPreparedProjectCamera,
  preparedProjectCamera,
  projectCameraInputSignature,
} from './prepared-project-camera';

function archive() {
  const project = createVideoProjectFromRecording({
    recordingId: 'synthetic',
    filename: 'synthetic.webm',
    width: 1000,
    height: 600,
    duration: 4,
    mimeType: 'video/webm',
    size: 10,
  });
  const clip = project.clips[0]!;
  if (clip.type !== 'VIDEO') throw new Error('Missing source.');
  const records: CursorTrajectoryRecord[] = [
    {
      kind: 'segment',
      segmentId: 0,
      activeTimeUs: 0,
      reason: 'start',
      width: 1000,
      height: 600,
      clock: {
        source: 'dom-event-time',
        timestampQuantumUs: null,
        resolutionBoundUs: null,
        mappingUncertaintyUs: null,
      },
    },
  ];
  for (let index = 0; index <= 40; index++) {
    const time = index / 10;
    records.push({
      kind: 'sample',
      segmentId: 0,
      observationSeq: index,
      activeTimeUs: Math.round(time * 1e6),
      xQ8: Math.round((500 + 300 * Math.sin(time * 1.7)) * 256),
      yQ8: Math.round((300 + 170 * Math.sin(time * 2.3)) * 256),
      visible: true,
      observed: true,
      event: 'move',
      button: 'none',
      relatedObservationSeq: null,
      anchors: [],
    });
  }
  project.cursorTrack = {
    captureMode: 'separate',
    samples: [],
    skin: normalizeVideoProjectCursorSkin(undefined),
    sourceObservations: [
      {
        recordingId: 'synthetic',
        sourceInstanceId: clip.sourceInstanceId!,
        samples: [],
        trajectory: {
          format: 'cursor-trajectory-v1',
          formatVersion: 1,
          algorithm: 'sed-window-v1',
          encoding: 'json-ascii-int-v1',
          trajectoryId: 'a'.repeat(32),
          state: 'complete',
          finalized: true,
          totalBlocks: 1,
          totalRecords: records.length,
          totalSamples: 41,
          totalBytes: 1000,
          streamSha256: 'b'.repeat(64),
        },
      },
    ],
  };
  const region = {
    ...createVideoProjectMotionRegion(project, 0),
    startTime: 0,
    duration: 4,
    focusMode: 'CURSOR' as const,
    scale: 1.5,
    zoomInDuration: 0,
    zoomOutDuration: 0,
    cameraFollow: {
      ...createCameraFollowSettings(),
      preservePointer: false,
      allowExpansion: false,
    },
    cursorComposition: { ...DEFAULT_CURSOR_COMPOSITION, smoothness: 0.5 },
  };
  project.motionRegions = [region];
  return { project, region, records };
}

it('keeps the camera independent of administrative windows with identical current canonical facts', async () => {
  const { project, region, records } = archive();
  const left = await prepareCursorTrajectoryProject(project, 2, async () => ({
    fromTimeUs: 0,
    toTimeUs: 2500000,
    records,
    initialSegment: null,
  }));
  const right = await prepareCursorTrajectoryProject(project, 2, async () => ({
    fromTimeUs: 1500000,
    toTimeUs: null,
    records,
    initialSegment: null,
  }));
  expect(resolveCursorSample(left, 2)?.recordingPoint).toEqual(
    resolveCursorSample(right, 2)?.recordingPoint
  );
  const scratch = await prepareCameraCursorTrajectoryProject(project, async () => ({
    fromTimeUs: 0,
    toTimeUs: null,
    records,
    initialSegment: null,
  }));
  const bundle = compileProjectCameraBundle(scratch);
  const preparedLeft = attachPreparedProjectCamera(left, bundle);
  const preparedRight = attachPreparedProjectCamera(right, bundle);
  expect(resolveProjectFollowingCamera(preparedLeft, region, 2).pan).toEqual(
    resolveProjectFollowingCamera(preparedRight, region, 2).pan
  );
  expect(resolveProjectCursorOrientation(preparedLeft, region)).toEqual(
    resolveProjectCursorOrientation(preparedRight, region)
  );
});

it('matches complete canonical reference with different record partitions and reverse evaluation order', async () => {
  const { project, region, records } = archive();
  const complete = await prepareCameraCursorTrajectoryProject(project, async () => ({
    fromTimeUs: 0,
    toTimeUs: null,
    records,
    initialSegment: null,
  }));
  const partitioned = await prepareCameraCursorTrajectoryProject(
    project,
    async (_identity, _descriptor, time) => {
      const from = Math.floor(time / 1000000) * 1000000;
      return {
        fromTimeUs: from,
        toTimeUs: from < 4000000 ? from + 1000000 : null,
        records: records.filter(
          (record) =>
            record.kind === 'segment' ||
            (record.kind !== 'gap' &&
              record.activeTimeUs >= from &&
              record.activeTimeUs <= from + 1000000)
        ),
        initialSegment: null,
      };
    }
  );
  const bundle = compileProjectCameraBundle(partitioned);
  const render = attachPreparedProjectCamera(project, bundle);
  for (const time of [4, 2.5, 2, 1.5, 0]) {
    expect(resolveProjectFollowingCamera(render, region, time).pan).toEqual(
      resolveProjectFollowingCamera(complete, region, time).pan
    );
    expect(
      evaluateCursorOrientation(resolveProjectCursorOrientation(render, region), time)
    ).toEqual(evaluateCursorOrientation(resolveProjectCursorOrientation(complete, region), time));
  }
  expect(bundle.conflicts).toEqual(compileProjectCameraBundle(complete).conflicts);
  const before = JSON.stringify(project);
  expect(JSON.stringify(render)).toBe(before);
  expect(render.cursorTrack?.sourceObservations?.[0]?.samples).toEqual([]);
  expect(Object.isFrozen(bundle.cameras[0]?.plan)).toBe(true);
  const visit = (value: unknown) => {
    expect(typeof value).not.toBe('function');
    if (value && typeof value === 'object') {
      expect(Object.isFrozen(value)).toBe(true);
      for (const key of Object.keys(value))
        expect(['records', 'initialSegment', 'project', 'input', 'bindings']).not.toContain(key);
      for (const child of Object.values(value)) visit(child);
    }
  };
  visit(bundle);
  expect(bundle.signature.length).toBeLessThan(500);
  expect(preparedProjectCamera(render)).toBe(bundle);
});

it('keeps retained source-window camera mapping equal to complete canonical reference', async () => {
  const { project, region, records } = archive();
  const clip = project.clips[0]!;
  if (clip.type !== 'VIDEO') throw new Error('Missing source.');
  const bound = bindMotionRegionToClip(region, clip);
  project.clips = [{ ...clip, duration: 2, playbackWindow: { offset: 1, extent: 4, holdAt: 2 } }];
  project.motionRegions = [
    {
      ...bound,
      duration: 2,
      sourceBinding: { ...bound.sourceBinding!, coordinateSpace: 'source-window' },
    },
  ];
  const scratch = await prepareCameraCursorTrajectoryProject(project, async () => ({
    fromTimeUs: 0,
    toTimeUs: null,
    records,
    initialSegment: null,
  }));
  const prepared = attachPreparedProjectCamera(project, compileProjectCameraBundle(scratch));
  const saved = project.motionRegions[0]!;
  for (const time of [1.8, 1, 0.1]) {
    expect(resolveProjectFollowingCamera(prepared, saved, time).pan).toEqual(
      resolveProjectFollowingCamera(scratch, saved, time).pan
    );
  }
  expect(
    projectCameraInputSignature({
      ...project,
      fps: 60,
      updatedAt: project.updatedAt + 1,
      name: 'renamed',
    })
  ).toBe(projectCameraInputSignature(project));
});

it('distinguishes selected retained split representatives with different crop and hold geometry', async () => {
  const { project, region, records } = archive();
  const original = project.clips[0]!;
  if (original.type !== 'VIDEO') throw new Error('Missing source.');
  const left = { ...original, duration: 2, playbackWindow: { offset: 0, extent: 4 } };
  const right = {
    ...original,
    id: 'split-right',
    startTime: 2,
    duration: 2,
    playbackWindow: { offset: 2, extent: 4, holdAt: 3 },
    sourceCrop: { x: 100, y: 50, width: 800, height: 500 },
  };
  project.clips = [left, right];
  project.motionRegions = [left, right].map((clip, index) => {
    const bound = bindMotionRegionToClip(
      { ...region, id: `part-${index}`, startTime: clip.startTime, duration: clip.duration },
      clip
    );
    return {
      ...bound,
      sourceBinding: { ...bound.sourceBinding!, coordinateSpace: 'source-window' as const },
    };
  });
  const scratch = await prepareCameraCursorTrajectoryProject(project, async () => ({
    fromTimeUs: 0,
    toTimeUs: null,
    records,
    initialSegment: null,
  }));
  const bundle = compileProjectCameraBundle(scratch);
  const prepared = attachPreparedProjectCamera(project, bundle);
  for (const [index, time] of [
    [1, 3.5],
    [0, 1],
    [1, 2.5],
  ] as const) {
    const part = project.motionRegions[index]!;
    const actual = resolveProjectFollowingCamera(prepared, part, time);
    expect(actual.pan).toEqual(resolveProjectFollowingCamera(scratch, part, time).pan);
    expect(bundle.cameras.some((entry) => entry.plan === actual.plan)).toBe(true);
    const camera = (view: typeof project) =>
      resolveVideoCompositionCamera({
        project: view,
        currentTime: time,
        actions: [],
        cursorSample: resolveCursorSample(view, time),
      });
    expect(camera(prepared)).toEqual(camera(scratch));
  }
});

it('returns the prepared public plan and canonical conflicts for the requested output and interval', async () => {
  const { project, region, records } = archive();
  project.cursorTrack!.skin = { ...project.cursorTrack!.skin, scale: 20 };
  project.motionRegions = [
    { ...region, scale: 4, cameraFollow: { ...region.cameraFollow, preservePointer: true } },
  ];
  const active = project.motionRegions[0]!;
  const output = { width: 160, height: 96 };
  const scratch = await prepareCameraCursorTrajectoryProject(project, async () => ({
    fromTimeUs: 0,
    toTimeUs: null,
    records,
    initialSegment: null,
  }));
  const bundle = compileProjectCameraBundle(scratch, output);
  const prepared = attachPreparedProjectCamera(project, bundle);
  expect(resolveProjectCursorCameraPlan(prepared, active, output)).toBe(bundle.cameras[0]!.plan);
  expect(resolveProjectCursorCameraPlan(prepared, active, output)).toEqual(
    resolveProjectCursorCameraPlan(scratch, active, output)
  );
  const conflicts = resolveProjectCameraConflicts(scratch, output);
  expect(conflicts).not.toEqual([]);
  expect(resolveProjectCameraConflicts(prepared, output)).toEqual(conflicts);
  expect(resolveProjectCameraConflicts(prepared, output, { start: 5, end: 6 })).toEqual([]);
  expect(() =>
    resolveProjectCursorCameraPlan(prepared, active, { width: 320, height: 192 })
  ).toThrow('geometry is unavailable');
});

it('refuses a stale region in a prepared snapshot instead of planning from its narrow frame facts', async () => {
  const { project, region, records } = archive();
  const scratch = await prepareCameraCursorTrajectoryProject(project, async () => ({
    fromTimeUs: 0,
    toTimeUs: null,
    records,
    initialSegment: null,
  }));
  const prepared = attachPreparedProjectCamera(project, compileProjectCameraBundle(scratch));
  const edited = { ...region, id: 'replacement-camera' };
  expect(() => resolveProjectFollowingCamera(prepared, edited, 2)).toThrow(
    'geometry is unavailable'
  );
  expect(() => resolveProjectCursorCameraPlan(prepared, edited)).toThrow('geometry is unavailable');
  expect(() => resolveProjectCursorOrientation(prepared, edited)).toThrow(
    'orientation is unavailable'
  );
});

it('omits dormant and trimmed-out source cameras while retaining the active camera', async () => {
  const { project, region, records } = archive();
  const clip = project.clips[0]!;
  if (clip.type !== 'VIDEO') throw new Error('Missing source.');
  const bound = bindMotionRegionToClip({ ...region, id: 'trimmed-out', duration: 1 }, clip);
  project.motionRegions = [
    region,
    {
      ...bound,
      sourceBinding: {
        ...bound.sourceBinding!,
        sourceStart: 5,
        sourceEnd: 6,
        phaseProjection: 'retained-result',
      },
    },
    { ...bound, id: 'dormant', sourceBinding: { ...bound.sourceBinding!, dormant: true } },
    { ...region, id: 'zero-length', duration: 0 },
  ];
  const scratch = await prepareCameraCursorTrajectoryProject(project, async () => ({
    fromTimeUs: 0,
    toTimeUs: null,
    records,
    initialSegment: null,
  }));
  const bundle = compileProjectCameraBundle(scratch);
  expect(bundle.cameras).toHaveLength(1);
  const prepared = attachPreparedProjectCamera(project, bundle);
  expect(resolveProjectCursorCameraPlan(prepared, region)).toEqual(
    resolveProjectCursorCameraPlan(scratch, region)
  );
  expect(resolveProjectCameraConflicts(prepared)).toEqual(resolveProjectCameraConflicts(scratch));
});

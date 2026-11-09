import { expect, it } from 'vitest';
import { canRenderPreparedCursorFrame } from './cursor-readiness';
import {
  createProject,
  createVideoClip,
} from '../../../../features/video/project/timeline/project-meta.test.helpers';
import { normalizeVideoProjectCursorSkin } from '../../../../features/video/project/cursor';
import { createVideoProjectMotionRegion } from '../../../../features/video/project/motion';
import {
  VideoCursorCaptureMode,
  VideoMotionFocusMode,
} from '../../../../features/video/project/types';
import { prepareCursorTrajectoryProject } from '../../../../features/video/project/cursor-trajectory/project-window';

function fixture() {
  const clip = createVideoClip({ sourceInstanceId: 'archive', duration: 4 });
  const project = createProject([clip]);
  project.cursorTrack = {
    captureMode: VideoCursorCaptureMode.SEPARATE,
    samples: [],
    skin: normalizeVideoProjectCursorSkin({ hidden: true }),
    sourceObservations: [
      {
        recordingId: 'recording',
        sourceInstanceId: 'archive',
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
          totalRecords: 0,
          totalSamples: 0,
          totalBytes: 0,
          streamSha256: 'b'.repeat(64),
        },
      },
    ],
  };
  return project;
}
function follow(project: ReturnType<typeof fixture>) {
  project.motionRegions = [
    {
      ...createVideoProjectMotionRegion(project, 0),
      startTime: 0,
      duration: 4,
      focusMode: VideoMotionFocusMode.CURSOR,
    },
  ];
}

it('permits bare video, hidden unused cursor, manual camera and hidden camera', () => {
  expect(canRenderPreparedCursorFrame(createProject([createVideoClip()]), 1)).toBe(true);
  const project = fixture();
  expect(canRenderPreparedCursorFrame(project, 1)).toBe(true);
  follow(project);
  project.motionRegions![0]!.focusMode = VideoMotionFocusMode.MANUAL;
  expect(canRenderPreparedCursorFrame(project, 1)).toBe(true);
  follow(project);
  project.utilityLanes = {
    camera: { visible: false, locked: false },
    actions: { visible: true, locked: false },
  };
  expect(canRenderPreparedCursorFrame(project, 1)).toBe(true);
});

it('requires archive facts for a visible cursor or active follow camera despite hidden cursor skin', () => {
  const project = fixture();
  project.cursorTrack!.skin.hidden = false;
  expect(canRenderPreparedCursorFrame(project, 1)).toBe(false);
  project.cursorTrack!.skin.hidden = true;
  follow(project);
  expect(canRenderPreparedCursorFrame(project, 1)).toBe(false);
});

it('does not let an unrelated archive source block a bound camera', () => {
  const project = fixture();
  const clip = createVideoClip({ id: 'plain', sourceInstanceId: 'plain', duration: 4 });
  project.clips.push(clip);
  follow(project);
  project.motionRegions![0]!.sourceBinding = {
    clipId: clip.id,
    sourceStart: 0,
    sourceEnd: 4,
    animation: { start: 0, end: 4, duration: 4 },
  };
  expect(canRenderPreparedCursorFrame(project, 1)).toBe(true);
});

it('keeps covered gaps ready and refuses the administrative window boundary', async () => {
  const project = fixture();
  project.cursorTrack!.skin.hidden = false;
  const prepared = await prepareCursorTrajectoryProject(project, 1, async () => ({
    fromTimeUs: 0,
    toTimeUs: 2000000,
    records: [],
    initialSegment: null,
  }));
  expect(canRenderPreparedCursorFrame(prepared, 1)).toBe(true);
  expect(canRenderPreparedCursorFrame(prepared, 2)).toBe(false);
});

it('checks every unbound archive dependency when an inline source precedes it', () => {
  const project = fixture();
  project.clips.unshift(createVideoClip({ id: 'inline', sourceInstanceId: 'inline' }));
  project.cursorTrack!.sourceObservations!.unshift({
    recordingId: 'inline',
    sourceInstanceId: 'inline',
    samples: [],
  });
  project.cursorTrack!.skin.hidden = false;
  expect(canRenderPreparedCursorFrame(project, 1)).toBe(false);
});

it('selects canonical connecting camera regions while the cursor is hidden', () => {
  const project = fixture();
  const first = {
    ...createVideoProjectMotionRegion(project, 0),
    id: 'first',
    startTime: 0,
    duration: 1,
    focusMode: VideoMotionFocusMode.CURSOR,
    sourceBinding: {
      clipId: project.clips[0]!.id,
      sourceStart: 0,
      sourceEnd: 1,
      animation: { start: 0, end: 1, duration: 1 },
      coordinateSpace: 'source-window' as const,
    },
  };
  const second = {
    ...first,
    id: 'second',
    startTime: 3,
    sourceBinding: { ...first.sourceBinding, sourceStart: 3, sourceEnd: 4 },
    incomingConnection: { fromRegionId: first.id, easing: 'LINEAR' as const },
  };
  project.motionRegions = [first, second];
  expect(canRenderPreparedCursorFrame(project, 2)).toBe(false);
  project.motionRegions = [first, { ...second, incomingConnection: null }];
  expect(canRenderPreparedCursorFrame(project, 2)).toBe(true);
});

it('does not require an ended archive clip at the half-open clip boundary', () => {
  const project = fixture();
  project.cursorTrack!.skin.hidden = false;
  project.clips.push(createVideoClip({ id: 'plain', startTime: 4, duration: 4 }));
  expect(canRenderPreparedCursorFrame(project, 4)).toBe(true);
});

it('uses retained source playback mapping and excludes dormant follow regions', () => {
  const project = fixture();
  const clip = project.clips[0];
  if (!clip || clip.type !== 'VIDEO') throw new Error('Missing source.');
  follow(project);
  const region = project.motionRegions![0]!;
  region.sourceBinding = {
    clipId: clip.id,
    sourceStart: 0,
    sourceEnd: 4,
    animation: { start: 0, end: 4, duration: 4 },
    coordinateSpace: 'source-window',
    phaseProjection: 'retained-result',
  };
  region.sourceBinding.dormant = true;
  expect(canRenderPreparedCursorFrame(project, 1)).toBe(true);
  const active = {
    ...project,
    clips: [{ ...clip, playbackWindow: { offset: 0, extent: 4, holdAt: 2.5 } }],
    motionRegions: [{ ...region, sourceBinding: { ...region.sourceBinding, dormant: false } }],
  };
  expect(canRenderPreparedCursorFrame(active, 1)).toBe(false);
});

it('requires a camera bundle independently from covered or unavailable frame cursor data', async () => {
  const project = fixture();
  follow(project);
  const covered = await prepareCursorTrajectoryProject(project, 1, async () => ({
    fromTimeUs: 0,
    toTimeUs: null,
    records: [],
    initialSegment: null,
  }));
  expect(canRenderPreparedCursorFrame(covered, 1)).toBe(false);
  expect(canRenderPreparedCursorFrame(project, 1, true)).toBe(false);
  const { attachPreparedProjectCamera, projectCameraInputSignature, projectCameraOutputKey } =
    await import('../../../../features/video/composition/motion/prepared-project-camera');
  const ready = attachPreparedProjectCamera(project, {
    signature: projectCameraInputSignature(project),
    output: projectCameraOutputKey(project),
    cameras: [],
    orientations: [],
    conflicts: [],
  });
  expect(canRenderPreparedCursorFrame(ready, 1)).toBe(true);
  expect(canRenderPreparedCursorFrame({ ...ready, width: ready.width + 1 }, 1)).toBe(false);
});

import { expect, it } from 'vitest';
import { createVideoProjectFromRecording } from '../project/factories/creation';
import { hasCameraMediaAt, resolveCameraVisualClip } from '../project/camera/animation';
import { getMediaClipSourceTime } from '../project/timeline/rate';
import { isExportReadyVideoProject, parseHydratableVideoProject } from '../project/validation/root';
import type { VideoProject, VideoProjectVideoClip } from '../project/types/model';
import { createQuickEditWebcam, quickEditWebcamFrameAt } from './advanced/webcam';
import { planReviewProjectConversion } from './project-conversion';
import { fixture } from './project-conversion.test-support';
import type { ReviewProjectCameraResource } from './project-camera';

function cameraFixture() {
  const input = fixture();
  const camera: ReviewProjectCameraResource = {
    reviewAssetId: 'project-asset:camera-owned',
    asset: {
      id: 'camera-asset',
      type: 'VIDEO',
      name: 'Camera.webm',
      source: { kind: 'project-asset', projectAssetId: 'camera-owned' },
      metadata: {
        width: 320,
        height: 240,
        duration: 6,
        size: 50,
        mimeType: 'video/webm',
        hasAudio: true,
        audioPeaks: null,
      },
      createdAt: input.seed.createdAt,
    },
    track: {
      id: 'camera-track',
      name: 'Camera',
      kind: 'PRIMARY',
      role: 'CAMERA',
      order: -1,
      visible: true,
      locked: false,
    },
  };
  const webcam = createQuickEditWebcam(camera.reviewAssetId, camera.asset.metadata, input.source);
  webcam.appearance = { shape: 'circle', roundness: 35, zoom: 1.5, panX: -0.2, panY: 0.3 };
  webcam.mirrored = true;
  webcam.shadow = { intensity: 45, color: '#123456' };
  webcam.positions = [
    {
      id: 'move',
      time: 1,
      placement: { x: 0.1, y: 0.1, width: 0.3, height: 0.4 },
      crop: { zoom: 2, panX: 0.5, panY: -0.5 },
      transition: { type: 'ease-in-out', duration: 4 },
    },
    {
      id: 'removed-key',
      time: 3.5,
      placement: { x: 0.5, y: 0.2, width: 0.3, height: 0.4 },
      transition: { type: 'shrink', duration: 3 },
    },
    {
      id: 'last',
      time: 5,
      placement: { x: 0.2, y: 0.5, width: 0.3, height: 0.4 },
      crop: { zoom: 3, panX: -0.5, panY: 0.5 },
      transition: { type: 'none', duration: 2 },
    },
  ];
  webcam.hiddenRanges = [{ id: 'hidden', start: 4.2, end: 4.5 }];
  input.document.advancedContent.webcam = webcam;
  input.document.edits.push({
    id: 'speed',
    kind: 'speed',
    start: 4,
    end: 6,
    requestedStart: 4,
    requestedEnd: 6,
    rate: 2,
    audio: 'speed',
  });
  return { ...input, camera };
}

function prepared(input: ReturnType<typeof cameraFixture>) {
  const plan = planReviewProjectConversion(input);
  if (plan.status !== 'prepared') throw new Error(JSON.stringify(plan));
  return plan;
}

function cameras(project: VideoProject): VideoProjectVideoClip[] {
  return project.clips.filter(
    (clip): clip is VideoProjectVideoClip =>
      clip.type === 'VIDEO' &&
      project.tracks.some((track) => track.id === clip.trackId && track.role === 'CAMERA')
  );
}

it.each([-2, 0, 2, 20, -20])(
  'matches actual Gallery frame clock, visibility, placement and crop at offset %s across cuts and rates',
  (offset) => {
    const input = cameraFixture();
    const webcam = input.document.advancedContent.webcam!;
    webcam.offsetSeconds = offset;
    const before = structuredClone(input);
    const plan = prepared(input);
    expect(input).toEqual(before);
    expect(plan.project.version).toBe(37);
    expect(isExportReadyVideoProject(plan.project)).toBe(true);
    const reopened = parseHydratableVideoProject(JSON.parse(JSON.stringify(plan.project)));
    expect(reopened).not.toBeNull();
    if (!reopened) throw new Error('Project did not reopen');
    for (const project of [plan.project, reopened]) {
      for (const clip of cameras(project)) {
        for (const fraction of [0, 0.1, 0.3, 0.5, 0.75, 0.95]) {
          const time = clip.startTime + clip.duration * fraction;
          const sourceTime = clip.sourceStart + clip.sourceDuration * fraction;
          const gallery = quickEditWebcamFrameAt(
            webcam,
            sourceTime,
            input.camera.asset.metadata.duration!
          );
          const native = resolveCameraVisualClip(project, clip, time);
          const visible = hasCameraMediaAt(project, clip, time) && native.transform.opacity > 0;
          expect(visible).toBe(gallery !== null);
          expect(getMediaClipSourceTime(clip, time)).toBeCloseTo(sourceTime - offset, 7);
          if (!gallery || native.type !== 'VIDEO') continue;
          for (const key of ['x', 'width'] as const)
            expect(native.transform[key]).toBeCloseTo(gallery.placement[key] * project.width, 7);
          for (const key of ['y', 'height'] as const)
            expect(native.transform[key]).toBeCloseTo(gallery.placement[key] * project.height, 7);
          expect(native.cameraAppearance?.zoom).toBeCloseTo(gallery.crop!.zoom, 7);
          expect(native.cameraAppearance?.panX).toBeCloseTo(gallery.crop!.panX, 7);
          expect(native.cameraAppearance?.panY).toBeCloseTo(gallery.crop!.panY, 7);
        }
      }
    }
  }
);

it('retains every authored setting and removed anchor on each linked retained slice', () => {
  const input = cameraFixture();
  const plan = prepared(input);
  const webcam = input.document.advancedContent.webcam!;
  expect(cameras(plan.project)).toHaveLength(plan.timeline.videoClips.length);
  for (const [index, clip] of cameras(plan.project).entries()) {
    expect(clip.cameraPositions?.map((position) => position.sourceTime)).toEqual([1, 3.5, 5]);
    expect(clip.cameraPositions?.map((position) => position.transition)).toEqual([
      { kind: 'smooth', duration: 4 },
      { kind: 'shrink', duration: 3 },
      { kind: 'instant', duration: 2 },
    ]);
    expect(clip.cameraAppearance).toEqual(webcam.appearance);
    expect(clip.cameraHiddenRanges).toEqual(webcam.hiddenRanges);
    expect(clip.cameraMirrored).toBe(true);
    expect(clip).toMatchObject({
      fitMode: 'COVER',
      shadowIntensity: 45,
      shadowColor: '#123456ff',
      shadowMode: 'BACKDROP',
      muted: true,
    });
    expect(clip.sourceInstanceId).not.toBe(plan.timeline.sourceInstanceId);
    expect(clip.groupId).toBe(plan.timeline.videoClips[index]!.groupId);
    expect(clip.cameraPositions).not.toBe(
      cameras(plan.project)[(index + 1) % cameras(plan.project).length]!.cameraPositions
    );
  }
});

it.each(['disabled', 'basic', 'track-hidden'] as const)(
  'preserves camera data and suppresses the track for %s',
  (mode) => {
    const input = cameraFixture();
    if (mode === 'disabled') input.document.advancedContent.webcam!.enabled = false;
    if (mode === 'basic') input.ui.mode = 'basic';
    if (mode === 'track-hidden') input.ui.tracks.webcam = false;
    const { project } = prepared(input);
    expect(project.tracks.find((track) => track.role === 'CAMERA')?.visible).toBe(false);
    expect(cameras(project)).toHaveLength(3);
    expect(cameras(project)[0]!.cameraPositions).toHaveLength(3);
  }
);

it('assigns deterministic linked groups when the source has no separate audio', () => {
  const input = cameraFixture();
  input.seed.clips = input.seed.clips.filter((clip) => clip.type === 'VIDEO');
  const { project, timeline } = prepared(input);
  for (const [index, camera] of cameras(project).entries()) {
    expect(camera.groupId).toBe(`conversion-1:group:${index}`);
    expect(timeline.videoClips[index]).toMatchObject({
      groupId: camera.groupId,
      linkMode: 'LINKED',
    });
  }
});

it('refuses a missing or mismatched resource and admits a fresh correct retry', () => {
  const input = cameraFixture();
  const before = structuredClone(input);
  const withoutCamera: Parameters<typeof planReviewProjectConversion>[0] = { ...input };
  delete withoutCamera.camera;
  expect(planReviewProjectConversion(withoutCamera)).toMatchObject({
    status: 'blocked',
    issues: [{ kind: 'camera-resources' }],
  });
  expect(
    planReviewProjectConversion({
      ...input,
      camera: { ...input.camera, reviewAssetId: 'project-asset:wrong' },
    })
  ).toMatchObject({ status: 'blocked', issues: [{ kind: 'camera-resources' }] });
  expect(input).toEqual(before);
  expect(prepared(input).status).toBe('prepared');
  delete input.document.advancedContent.webcam;
  expect(planReviewProjectConversion(input)).toMatchObject({
    status: 'blocked',
    issues: [{ kind: 'camera-resources' }],
  });
});

it.each([
  'type',
  'locator',
  'dimensions',
  'duration',
  'track-kind',
  'track-role',
  'asset-id',
  'track-id',
] as const)('refuses invalid camera %s before producing a root', (field) => {
  const input = cameraFixture();
  if (field === 'type') input.camera.asset.type = 'AUDIO';
  if (field === 'locator')
    input.camera.asset.source = { kind: 'project-asset', projectAssetId: 'wrong' };
  if (field === 'dimensions') input.camera.asset.metadata.width = 0;
  if (field === 'duration') input.camera.asset.metadata.duration = 0;
  if (field === 'track-kind') input.camera.track.kind = 'AUDIO';
  if (field === 'track-role') delete input.camera.track.role;
  if (field === 'asset-id') input.camera.asset.id = input.seed.assets[0]!.id;
  if (field === 'track-id') input.camera.track.id = input.seed.tracks[0]!.id;
  expect(planReviewProjectConversion(input)).toMatchObject({
    status: 'blocked',
    issues: [{ kind: 'camera-resources' }],
  });
});

it('admits only neutral seed camera sidecars and does not apply them without Gallery content', () => {
  const input = cameraFixture();
  input.seed = createVideoProjectFromRecording({
    ...input.source,
    recordingId: 'recording',
    filename: 'Original.webm',
    hasAudio: true,
    sidecarVideos: [
      {
        recordingId: 'camera-recording',
        filename: 'Sidecar.webm',
        width: 320,
        height: 240,
        duration: 6,
        mimeType: 'video/webm',
        size: 50,
        trackRole: 'CAMERA',
      },
    ],
  });
  input.seed.id = 'conversion-1';
  const sidecarTrack = input.seed.tracks.find((track) => track.role === 'CAMERA')!;
  const result = prepared(input);
  expect(result.project.assets).toHaveLength(3);
  expect(result.project.tracks.some((track) => track.id === sidecarTrack.id)).toBe(false);
  expect(cameras(result.project)[0]!.assetId).toBe('camera-asset');
  delete input.document.advancedContent.webcam;
  const withoutCamera: Parameters<typeof planReviewProjectConversion>[0] = { ...input };
  delete withoutCamera.camera;
  const without = planReviewProjectConversion(withoutCamera);
  if (without.status !== 'prepared') throw new Error(JSON.stringify(without));
  expect(cameras(without.project)).toEqual([]);
  const seedCamera = input.seed.clips.find((clip) => clip.trackId === sidecarTrack.id)!;
  seedCamera.transform.x += 1;
  expect(planReviewProjectConversion(withoutCamera)).toMatchObject({
    status: 'blocked',
    issues: [{ kind: 'invalid-seed' }],
  });
});

it('requires the schema 32 fence for retained camera timing', () => {
  const { project } = prepared(cameraFixture());
  expect(isExportReadyVideoProject({ ...project, version: 31 })).toBe(false);
  expect(parseHydratableVideoProject({ ...project, version: 31 })).toBeNull();
});

it.each(['rounded', 'soft', 'ellipse', 'circle'] as const)(
  'keeps the %s camera shape without rewriting the authored container',
  (shape) => {
    const input = cameraFixture();
    input.document.advancedContent.webcam!.appearance.shape = shape;
    const { project } = prepared(input);
    const camera = cameras(project)[0]!;
    expect(camera.cameraAppearance?.shape).toBe(shape);
    expect(camera.transform.width).toBe(
      input.document.advancedContent.webcam!.placement.width * project.width
    );
    expect(camera.transform.height).toBe(
      input.document.advancedContent.webcam!.placement.height * project.height
    );
  }
);

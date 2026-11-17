import { expect, it } from 'vitest';
import { createVideoProjectFromRecording } from '../project/factories/creation';
import { hasCameraMediaAt, resolveCameraVisualClip } from '../project/camera/animation';
import { getMediaClipSourceTime, getVideoClipSourceTime } from '../project/timeline/rate';
import { isExportReadyVideoProject, parseHydratableVideoProject } from '../project/validation/root';
import type { VideoProject, VideoProjectVideoClip } from '../project/types/model';
import { quickEditWebcamFrameAt } from './advanced/webcam';
import { quickEditWebcamScreenPlacementAt } from './advanced/webcam';
import { resolveCameraSplitPresentation } from '../project/camera/split';
import { cameraPositionSeekTime, editCameraPosition } from '../project/camera/editing';
import { planReviewProjectConversion } from './project-conversion';
import { cameraFixture } from './project-conversion.test-support';

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

it('requires Native 56 and bounded layout origins before admitting retained camera clocks', () => {
  const input = cameraFixture();
  input.document.edits = [
    {
      id: 'hold',
      kind: 'freeze',
      start: 2,
      end: 2,
      requestedStart: 2,
      requestedEnd: 2,
      duration: 2,
      frameTime: 1.98,
      frameDuration: 0.04,
    },
  ];
  const project = prepared(input).project;
  const camera = cameras(project).find((clip) => clip.startTime === 4)!;
  expect(project.version).toBe(56);
  expect(parseHydratableVideoProject({ ...project, version: 55 })).toBeNull();
  expect(parseHydratableVideoProject({ ...project, version: 57 })).toBeNull();
  for (const patch of [
    { time: Number.NaN },
    { time: -86401 },
    { sourceTime: -1 },
    { sourceTime: 86401 },
    { rate: 0 },
    { rate: Number.POSITIVE_INFINITY },
    { unexpected: true },
  ]) {
    const invalid = structuredClone(project);
    const candidate = cameras(invalid).find((clip) => clip.id === camera.id)!;
    Object.assign(candidate.cameraTiming!.layoutClock!, patch);
    expect(parseHydratableVideoProject(invalid)).toBeNull();
  }
  const missing = structuredClone(project);
  Reflect.deleteProperty(cameras(missing)[0]!.cameraTiming!, 'layoutClock');
  expect(parseHydratableVideoProject(missing)).toBeNull();
  const orphan = structuredClone(project);
  Reflect.deleteProperty(cameras(orphan)[0]!.cameraTiming!, 'timeDomain');
  expect(parseHydratableVideoProject(orphan)).toBeNull();
  expect(parseHydratableVideoProject(JSON.parse(JSON.stringify(project)))).not.toBeNull();
});

it('retains the camera clock schema when Gallery also converts a spatial focus effect', async () => {
  const { createQuickEditZoomRegion } = await import('./advanced/zoom');
  const input = cameraFixture();
  input.document.edits = [
    {
      id: 'hold',
      kind: 'freeze',
      start: 2,
      end: 2,
      requestedStart: 2,
      requestedEnd: 2,
      duration: 2,
      frameTime: 1.98,
      frameDuration: 0.04,
    },
  ];
  input.ui.tracks.zoom = true;
  input.document.advancedContent.zoom = {
    enabled: true,
    regions: [
      {
        ...createQuickEditZoomRegion({
          id: 'spatial',
          at: 0,
          duration: 1,
          endMax: input.source.duration,
        }),
        effect: '3d',
        perspective: { enabled: true, rotateX: -12, rotateY: 24, rotateZ: 5, strength: 0.7 },
      },
    ],
  };
  const result = prepared(input).project;
  expect(result.version).toBe(56);
  expect(parseHydratableVideoProject(JSON.parse(JSON.stringify(result)))).not.toBeNull();
});

it('preserves split panes and docked returns at sampled frames through Gallery migration and reload', () => {
  const input = cameraFixture();
  const webcam = input.document.advancedContent.webcam!;
  webcam.split = 'right';
  webcam.positions[0]!.split = 'left';
  webcam.positions[1]!.split = null;
  webcam.positions[2]!.split = 'top';
  const converted = prepared(input).project;
  const reopened = parseHydratableVideoProject(JSON.parse(JSON.stringify(converted)));
  expect(reopened).not.toBeNull();
  for (const project of [converted, reopened!]) {
    for (const clip of cameras(project)) {
      for (const fraction of [0, 0.08, 0.17, 0.32, 0.53, 0.71, 0.94]) {
        const time = clip.startTime + clip.duration * fraction;
        const sourceTime = clip.sourceStart + clip.sourceDuration * fraction;
        const gallery = quickEditWebcamFrameAt(
          webcam,
          sourceTime,
          input.camera.asset.metadata.duration!
        );
        if (!gallery) continue;
        const screen = quickEditWebcamScreenPlacementAt(webcam, sourceTime);
        const native = resolveCameraSplitPresentation(project, clip, time);
        if (!native) {
          expect(screen).toEqual({ x: 0, y: 0, width: 1, height: 1 });
          continue;
        }
        for (const key of ['x', 'y', 'width', 'height'] as const) {
          expect(native.screen[key]).toBeCloseTo(screen[key], 6);
          expect(
            native.camera[key] / (key === 'x' || key === 'width' ? project.width : project.height)
          ).toBeCloseTo(gallery.placement[key], 6);
        }
      }
    }
  }
});

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

it.each(['shrink', 'shift', 'overlay'] as const)(
  'transfers %s geometry, crop and source-clock transitions without weakening schema',
  (behavior) => {
    const input = cameraFixture();
    const webcam = input.document.advancedContent.webcam!;
    webcam.split = 'left';
    webcam.screenBehavior = behavior;
    webcam.positions = [
      {
        id: 'split-move',
        time: 1,
        placement: webcam.placement,
        split: 'top',
        screenBehavior: behavior,
        crop: { zoom: 2, panX: 0.5, panY: -0.5 },
        transition: { type: 'ease-in-out', duration: 1 },
      },
    ];
    const { project } = prepared(input);
    expect(project.version).toBe(46);
    expect(parseHydratableVideoProject({ ...project, version: 45 })).toBeNull();
    const revived = parseHydratableVideoProject(project);
    expect(revived).not.toBeNull();
    for (const camera of cameras(project)) {
      expect(camera.cameraScreenBehavior).toBe(behavior);
      expect(camera.cameraPositions?.[0]?.cameraScreenBehavior).toBe(behavior);
      for (const time of [camera.startTime, camera.startTime + camera.duration / 2]) {
        const sourceTime = getMediaClipSourceTime(camera, time);
        expect(resolveCameraSplitPresentation(project, camera, time)?.screen).toEqual(
          quickEditWebcamScreenPlacementAt(webcam, sourceTime)
        );
      }
    }
  }
);

it.each(['classic', 'angle', 'center', 'nearest-edge'] as const)(
  'transfers %s camera shadow direction with strict Native 47 admission',
  (mode) => {
    const input = cameraFixture();
    input.document.advancedContent.webcam!.shadowDirection = { mode, angle: 225 };
    const { project } = prepared(input);
    expect(project.version).toBe(47);
    for (const camera of cameras(project))
      expect(camera.cameraShadowDirection).toEqual({ mode, angle: 225 });
    expect(parseHydratableVideoProject(project)).not.toBeNull();
    expect(parseHydratableVideoProject({ ...project, version: 46 })).toBeNull();
  }
);

it('holds webcam media with the original video during inserted time and keeps the authored offset', () => {
  const input = cameraFixture();
  input.document.edits = [
    {
      id: 'hold',
      kind: 'freeze',
      start: 2,
      end: 2,
      requestedStart: 2,
      requestedEnd: 2,
      duration: 2,
      frameTime: 1.98,
      frameDuration: 0.04,
    },
  ];
  const plan = prepared(input);
  const camera = cameras(plan.project).find((clip) => clip.startTime === 2)!;
  expect(camera.playbackWindow).toEqual({ offset: 0, extent: 2, holdAt: 0 });
  for (const time of [2, 3, 3.99])
    expect(getVideoClipSourceTime(camera, time)).toBeCloseTo(
      1.98 - (camera.cameraTiming?.offsetSeconds ?? 0)
    );
  expect(cameras(plan.project).find((clip) => clip.startTime === 4)?.sourceStart).toBe(2);
  expect(isExportReadyVideoProject(plan.project)).toBe(true);
});

it('keeps split and docked camera panes on result time after an inserted video section', () => {
  const input = cameraFixture();
  const webcam = input.document.advancedContent.webcam!;
  webcam.split = 'right';
  webcam.hiddenRanges = [];
  webcam.positions = [
    {
      id: 'split',
      time: 3,
      placement: webcam.placement,
      split: 'top',
      transition: { type: 'ease-in-out', duration: 1 },
    },
    {
      id: 'dock',
      time: 5,
      placement: webcam.placement,
      split: null,
      transition: { type: 'none', duration: 0 },
    },
  ];
  input.document.edits = [
    {
      id: 'hold',
      kind: 'freeze',
      start: 2,
      end: 2,
      requestedStart: 2,
      requestedEnd: 2,
      duration: 2,
      frameTime: 1.98,
      frameDuration: 0.04,
    },
  ];
  const expected = {
    ...webcam,
    positions: webcam.positions.map((position) => ({ ...position, time: position.time + 2 })),
  };
  const converted = prepared(input).project;
  const reopened = parseHydratableVideoProject(JSON.parse(JSON.stringify(converted)))!;
  expect(reopened).not.toBeNull();
  for (const project of [converted, reopened]) {
    for (const time of [2.5, 4.5, 5, 5.5, 6.5, 7, 7.5]) {
      const clip = cameras(project).find(
        (item) => item.startTime <= time && time < item.startTime + item.duration
      )!;
      expect(clip).toBeDefined();
      const split = resolveCameraSplitPresentation(project, clip, time);
      expect(split?.screen).toEqual(quickEditWebcamScreenPlacementAt(expected, time));
      const frame = quickEditWebcamFrameAt(expected, time, 20)!;
      for (const key of ['x', 'y', 'width', 'height'] as const)
        expect(
          split!.camera[key] / (key === 'x' || key === 'width' ? project.width : project.height)
        ).toBeCloseTo(frame.placement[key], 6);
    }
  }
});

it('selects, retimes, adds and hides converted camera destinations on their result clock', () => {
  const input = cameraFixture();
  const webcam = input.document.advancedContent.webcam!;
  webcam.hiddenRanges = [];
  webcam.positions = [
    {
      id: 'after-hold',
      time: 3,
      placement: webcam.placement,
      transition: { type: 'none', duration: 0 },
    },
    {
      id: 'rate',
      time: 5,
      placement: webcam.placement,
      transition: { type: 'ease-in-out', duration: 0.25 },
    },
  ];
  input.document.edits = [
    {
      id: 'hold',
      kind: 'freeze',
      start: 2,
      end: 2,
      requestedStart: 2,
      requestedEnd: 2,
      duration: 2,
      frameTime: 1.98,
      frameDuration: 0.04,
    },
    {
      id: 'rate',
      kind: 'speed',
      start: 4,
      end: 6,
      requestedStart: 4,
      requestedEnd: 6,
      rate: 2,
      audio: 'speed',
    },
  ];
  const project = prepared(input).project;
  const ordinary = cameras(project).find((clip) => clip.startTime === 4)!;
  const fast = cameras(project).find((clip) => clip.startTime === 6)!;
  expect(cameraPositionSeekTime(project, ordinary.id, 4, 'after-hold')).toBe(5);
  expect(cameraPositionSeekTime(project, fast.id, 6, 'rate')).toBeCloseTo(6.625);
  const changed = editCameraPosition(project, fast.id, 6.5, {
    kind: 'update',
    id: 'rate',
    sourceTime: 6.25,
    transition: { kind: 'smooth', duration: 0.2 },
  });
  expect(
    cameras(changed)
      .find((clip) => clip.id === fast.id)
      ?.cameraPositions?.find((item) => item.id === 'rate')
  ).toMatchObject({ sourceTime: 6.25 });
  expect(cameraPositionSeekTime(changed, fast.id, 6.5, 'rate')).toBeCloseTo(6.45);
  const added = editCameraPosition(changed, fast.id, 6.3, { kind: 'add' });
  expect(
    cameras(added)
      .find((clip) => clip.id === fast.id)
      ?.cameraPositions?.find((item) => Math.abs(item.sourceTime - 6.3) < 1e-7)?.transition.duration
  ).toBe(0.5);
  const hidden = editCameraPosition(added, fast.id, 6.5, { kind: 'hide', start: 6.5, end: 6.9 });
  expect(cameras(hidden).find((clip) => clip.id === fast.id)?.cameraHiddenRanges).toMatchObject([
    { start: 6.5, end: 6.9 },
  ]);
  expect(parseHydratableVideoProject(JSON.parse(JSON.stringify(hidden)))).not.toBeNull();
});

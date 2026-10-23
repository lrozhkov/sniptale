import { describe, expect, it } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
  createVideoProjectTrack,
} from '../factories/creation';
import { createVideoClipFromAsset } from '../factories/clip';
import { VideoProjectAssetType, VideoTrackKind, VideoProjectTrackRole } from '../types';
import { isVideoProjectClip } from '../validation/clips';
import { resolveVideoCompositionVisualLayers } from '../../composition/timeline/frame/layers';
import {
  resolveCameraClip,
  canAddCameraPosition,
  cameraSourceTime,
  hasCameraMediaAt,
  resolveCameraVisualClip,
  resolveCameraDestinationTransform,
} from './animation';
import { getMediaClipSourceTime } from '../timeline/rate';
import { cameraPositionSeekTime } from './editing';
import { isHydratableVideoProject } from '../validation/root';
import { editCameraPosition } from './editing';

function fixture() {
  const project = createEmptyVideoProject('Camera');
  const track = createVideoProjectTrack('Camera', 0, VideoTrackKind.PRIMARY);
  const asset = createVideoProjectAsset(
    'Camera',
    VideoProjectAssetType.VIDEO,
    { kind: 'project-asset', projectAssetId: 'camera' },
    {
      width: 640,
      height: 360,
      duration: 8,
      mimeType: 'video/mp4',
      size: 10,
      hasAudio: false,
      audioPeaks: null,
    }
  );
  const clip = createVideoClipFromAsset(track.id, asset, 640, 360, 0);
  if (clip.type !== 'VIDEO') throw new Error('video expected');
  clip.transform = { x: 0, y: 0, width: 640, height: 360, rotation: 0, opacity: 1 };
  clip.cameraPositions = [
    {
      id: 'corner',
      sourceTime: 2,
      fitMode: clip.fitMode,
      transform: { x: 400, y: 200, width: 160, height: 90, rotation: 0, opacity: 1 },
      transition: { kind: 'smooth', duration: 2 },
    },
  ];
  project.tracks = [{ ...track, role: VideoProjectTrackRole.CAMERA }];
  project.clips = [clip];
  project.assets = [asset];
  return { project, clip };
}

describe('camera position trajectory', () => {
  it('starts at the playhead, eases toward the destination and shares geometry with composition', () => {
    const { project, clip } = fixture();
    expect(resolveCameraClip(clip, 2).transform).toEqual(clip.transform);
    expect(resolveCameraClip(clip, 3).transform).toMatchObject({
      x: 200,
      y: 100,
      width: 400,
      height: 225,
    });
    expect(resolveCameraClip(clip, 4).transform).toEqual(clip.cameraPositions![0]!.transform);
    expect(resolveVideoCompositionVisualLayers(project, 3)[0]).toMatchObject({
      x: 200,
      y: 100,
      width: 400,
      height: 225,
      trackRole: 'CAMERA',
    });
  });
  it('preserves phase after splitting in flight, trimming, moving and changing speed', () => {
    const { clip } = fixture();
    const right = {
      ...clip,
      id: 'right',
      sourceStart: 3,
      sourceDuration: 5,
      startTime: 10,
      duration: 5,
    };
    expect(resolveCameraClip(right, 10).transform).toEqual(resolveCameraClip(clip, 3).transform);
    expect(
      resolveCameraClip({ ...right, playbackRate: 2, duration: 2.5 }, 10.25).transform
    ).toEqual(resolveCameraClip(clip, 3.5).transform);
    expect(resolveCameraClip(JSON.parse(JSON.stringify(right)), 10.5).transform).toEqual(
      resolveCameraClip(clip, 3.5).transform
    );
  });
  it('interrupts an ongoing movement continuously when adding another position', () => {
    const { project, clip } = fixture();
    const edited = editCameraPosition(project, clip.id, 3, { kind: 'add' });
    const next = edited.clips[0];
    if (next?.type !== 'VIDEO') throw new Error('video expected');
    expect(resolveCameraClip(next, 3).transform).toEqual(resolveCameraClip(clip, 3).transform);
    expect(resolveCameraClip(next, 3.5).transform).toEqual(resolveCameraClip(clip, 3).transform);
    expect(canAddCameraPosition(edited, clip.id, 3)).toBe(false);
    expect(edited.clips).toHaveLength(1);
    expect(clip.cameraPositions).toHaveLength(1);
  });
  it('supports instant and shrink transitions without a zero-size frame', () => {
    const { clip } = fixture();
    const point = clip.cameraPositions![0]!;
    const shrink = {
      ...clip,
      cameraPositions: [{ ...point, transition: { kind: 'shrink' as const, duration: 2 } }],
    };
    expect(resolveCameraClip(shrink, 3).transform.width).toBeCloseTo(180);
    expect(resolveCameraClip(shrink, 4).transform).toEqual(point.transform);
    const instant = {
      ...clip,
      cameraPositions: [{ ...point, transition: { kind: 'instant' as const, duration: 2 } }],
    };
    expect(resolveCameraClip(instant, 2).transform).toEqual(point.transform);
  });
  it('rejects malformed persisted curves, duplicate times and unbounded geometry', () => {
    const { clip } = fixture();
    expect(isVideoProjectClip(clip)).toBe(true);
    const point = clip.cameraPositions![0]!;
    for (const cameraPositions of [
      [point, { ...point, id: 'duplicate' }],
      [{ ...point, sourceTime: NaN }],
      [{ ...point, transform: { ...point.transform, width: 0 } }],
      [{ ...point, transition: { kind: 'unknown', duration: 1 } }],
      [{ ...point, transition: { kind: { toString: null }, duration: 1 } }],
    ]) {
      expect(isVideoProjectClip({ ...clip, cameraPositions })).toBe(false);
    }
  });
});

it('uses an instant destination on the last visible frame', () => {
  const { project, clip } = fixture();
  const time = clip.startTime + clip.duration - 1 / project.fps;
  const edited = editCameraPosition(project, clip.id, time, { kind: 'add' });
  const camera = edited.clips[0];
  if (camera?.type !== 'VIDEO') throw new Error('video expected');
  expect(camera.cameraPositions?.at(-1)?.transition.kind).toBe('instant');
});

it('admits FX bypass on a camera clip without weakening its position validation', () => {
  const { clip } = fixture();
  expect(isVideoProjectClip({ ...clip, effectsBypassed: true })).toBe(true);
  expect(isVideoProjectClip({ ...clip, effectsBypassed: false })).toBe(true);
  expect(isVideoProjectClip({ ...clip, effectsBypassed: 'true' })).toBe(false);
  expect(isVideoProjectClip({ ...clip, effectsBypassed: true, cameraPositions: null })).toBe(false);
});

it('evaluates positional source crop with layout time while retaining shape and inherited destinations', () => {
  const { project, clip } = fixture();
  clip.cameraAppearance = { shape: 'circle', roundness: 61, zoom: 1.2, panX: 0.2, panY: -0.2 };
  clip.cameraPositions![0]!.crop = { zoom: 3, panX: 0.8, panY: 0.6 };
  expect(resolveCameraClip(clip, 2).cameraAppearance).toEqual(clip.cameraAppearance);
  expect(resolveCameraClip(clip, 3).cameraAppearance).toMatchObject({
    shape: 'circle',
    roundness: 61,
    zoom: 2.1,
    panX: 0.5,
    panY: 0.2,
  });
  const rendered = resolveVideoCompositionVisualLayers(project, 3)[0];
  if (rendered?.kind !== 'video') throw new Error('Expected camera layer');
  expect(rendered.clip.cameraAppearance?.zoom).toBeCloseTo(2.1);
  for (const field of ['zoom', 'panX', 'panY'] as const)
    expect(resolveCameraClip(clip, 4).cameraAppearance![field]).toBeCloseTo(
      clip.cameraPositions![0]!.crop![field],
      9
    );
  const defaults = { ...clip };
  delete defaults.cameraAppearance;
  expect(resolveCameraClip(defaults, 3).cameraAppearance).toEqual({
    shape: 'rounded',
    roundness: 0,
    zoom: 2,
    panX: 0.4,
    panY: 0.3,
  });
  expect(defaults).not.toHaveProperty('cameraAppearance');
  const noOverride = {
    ...clip.cameraPositions![0]!,
    id: 'inherited',
    sourceTime: 5,
    transition: { kind: 'instant' as const, duration: 0 },
  };
  delete noOverride.crop;
  clip.cameraPositions!.push(noOverride);
  for (const field of ['zoom', 'panX', 'panY'] as const)
    expect(resolveCameraClip(clip, 5).cameraAppearance![field]).toBeCloseTo(
      clip.cameraAppearance[field],
      9
    );
  expect(clip.cameraPositions![1]).not.toHaveProperty('crop');
  expect(clip.cameraAppearance.zoom).toBe(1.2);
});

it('keeps interrupted crops continuous and retains source phase for partial rate-two instances', () => {
  const { project, clip } = fixture();
  clip.cameraAppearance = { shape: 'rounded', roundness: 20, zoom: 1, panX: 0, panY: 0 };
  clip.cameraPositions![0]!.crop = { zoom: 3, panX: 1, panY: -1 };
  const added = editCameraPosition(project, clip.id, 3, { kind: 'add' }).clips[0];
  if (added?.type !== 'VIDEO') throw new Error('Expected camera');
  expect(added.cameraPositions![1]!.crop).toEqual({ zoom: 2, panX: 0.5, panY: -0.5 });
  expect(resolveCameraClip(added, 3).cameraAppearance).toEqual(
    resolveCameraClip(clip, 3).cameraAppearance
  );
  expect(resolveCameraClip(added, 3.25).cameraAppearance).toEqual(
    resolveCameraClip(clip, 3).cameraAppearance
  );
  const partial = {
    ...clip,
    id: 'partial',
    sourceStart: 3,
    sourceDuration: 5,
    startTime: 10,
    duration: 2.5,
    playbackRate: 2,
  };
  expect(resolveCameraClip(partial, 10.25).cameraAppearance).toEqual(
    resolveCameraClip(clip, 3.5).cameraAppearance
  );
  const shrink = {
    ...partial,
    cameraPositions: clip.cameraPositions!.map((position) => ({
      ...position,
      transition: { kind: 'shrink' as const, duration: 2 },
    })),
  };
  expect(resolveCameraClip(shrink, 10).cameraAppearance?.zoom).toBe(2);
  expect(resolveCameraClip(JSON.parse(JSON.stringify(partial)), 10.25).cameraAppearance).toEqual(
    resolveCameraClip(partial, 10.25).cameraAppearance
  );
  const second = editCameraPosition({ ...project, clips: [clip, partial] }, partial.id, 10.25, {
    kind: 'crop',
    crop: { zoom: 4, panX: -1, panY: 1 },
  });
  expect(second.clips[0]).toBe(clip);
  expect(clip.cameraPositions![0]!.crop!.zoom).toBe(3);
});

it('edits only active destination crop and supports inherited reset, refusal and retry', () => {
  const { project, clip } = fixture();
  clip.cameraAppearance = { shape: 'circle', roundness: 61, zoom: 1.2, panX: 0, panY: 0 };
  const crop = { zoom: 2, panX: 0.4, panY: -0.2 };
  const later = {
    ...clip.cameraPositions![0]!,
    id: 'later',
    sourceTime: 5,
    crop: { zoom: 3, panX: -0.5, panY: 0.5 },
  };
  clip.cameraPositions!.push(later);
  const edited = editCameraPosition(project, clip.id, 3, { kind: 'crop', crop });
  const camera = edited.clips[0];
  if (camera?.type !== 'VIDEO') throw new Error('Expected camera');
  expect(camera.cameraAppearance).toEqual(clip.cameraAppearance);
  expect(camera.cameraPositions![0]).toEqual({ ...clip.cameraPositions![0], crop });
  expect(camera.cameraPositions![1]).toBe(later);
  expect(camera.transform).toBe(clip.transform);
  expect(edited.version).toBe(11);
  expect(editCameraPosition(edited, clip.id, 3, { kind: 'crop', crop })).toBe(edited);
  expect(
    editCameraPosition(edited, clip.id, 3, { kind: 'crop', crop: { ...crop, zoom: NaN } })
  ).toBe(edited);
  expect(editCameraPosition(edited, clip.id, 0, { kind: 'crop', crop: null })).toBe(edited);
  const locked = { ...edited, tracks: edited.tracks.map((track) => ({ ...track, locked: true })) };
  expect(editCameraPosition(locked, clip.id, 3, { kind: 'crop', crop: null })).toBe(locked);
  const baseEdit = editCameraPosition(edited, clip.id, 0, {
    kind: 'crop',
    crop: Object.assign({ zoom: 1.5, panX: 0, panY: 0 }, { shape: 'ellipse', roundness: 90 }),
  });
  const changed = baseEdit.clips[0];
  if (changed?.type !== 'VIDEO') throw new Error('Expected camera');
  expect(changed.cameraAppearance).toMatchObject({ shape: 'circle', roundness: 61, zoom: 1.5 });
  expect(changed.cameraPositions![0]!.crop).toEqual(crop);
  const reset = editCameraPosition(baseEdit, clip.id, 3, { kind: 'crop', crop: null });
  const inherited = reset.clips[0];
  if (inherited?.type !== 'VIDEO') throw new Error('Expected camera');
  expect(inherited.cameraPositions![0]).not.toHaveProperty('crop');
  expect(resolveCameraClip(inherited, 4).cameraAppearance?.zoom).toBe(1.5);
  expect(editCameraPosition(reset, clip.id, 3, { kind: 'crop', crop: null })).toBe(reset);
  expect(
    editCameraPosition(project, clip.id, 0, { kind: 'crop', crop: { zoom: 1.2, panX: 0, panY: 0 } })
  ).toBe(project);
});

it('retains authored camera time while offset media coverage stays half-open', () => {
  const { project, clip } = fixture();
  clip.cameraTiming = { offsetSeconds: 2, transitions: 'bounded' };
  expect(cameraSourceTime(clip, 1)).toBe(1);
  expect(getMediaClipSourceTime(clip, 1)).toBe(-1);
  expect(hasCameraMediaAt(project, clip, 1)).toBe(false);
  expect(resolveCameraVisualClip(project, clip, 1).transform.opacity).toBe(0);
  expect(hasCameraMediaAt(project, clip, 2)).toBe(true);
  clip.cameraTiming.offsetSeconds = -2;
  expect(getMediaClipSourceTime(clip, 1)).toBe(3);
  expect(hasCameraMediaAt(project, clip, 5.999)).toBe(true);
  expect(hasCameraMediaAt(project, clip, 6)).toBe(false);
  const partial = {
    ...clip,
    sourceStart: 3,
    sourceDuration: 4,
    startTime: 10,
    duration: 2,
    playbackRate: 2,
  };
  expect(getMediaClipSourceTime(partial, 10.5)).toBe(6);
  expect(hasCameraMediaAt(project, partial, 11)).toBe(true);
  expect(hasCameraMediaAt(project, partial, 11.5)).toBe(false);
  for (const offsetSeconds of [-100, 100]) {
    clip.cameraTiming.offsetSeconds = offsetSeconds;
    expect(hasCameraMediaAt(project, clip, 4)).toBe(false);
  }
  delete clip.cameraTiming;
  expect(hasCameraMediaAt({ ...project, assets: [] }, clip, 4)).toBe(true);
});

it('fences timing at schema 32 and admits video timing on compatible ordinary tracks', () => {
  const { project, clip } = fixture();
  clip.cameraTiming = { offsetSeconds: 2, transitions: 'bounded' };
  for (let version = 2; version < 32; version++)
    expect(isHydratableVideoProject({ ...project, version })).toBe(false);
  for (const version of [32, 33, 34, 35, 36, 37, 38, 39, 40])
    expect(isHydratableVideoProject({ ...project, version })).toBe(true);
  expect(isHydratableVideoProject({ ...project, version: 44 })).toBe(false);
  expect(
    isHydratableVideoProject({
      ...project,
      version: 32,
      tracks: project.tracks.map(({ role: _role, ...track }) => track),
    })
  ).toBe(true);
  for (const cameraTiming of [
    null,
    {},
    { offsetSeconds: NaN, transitions: 'bounded' },
    { offsetSeconds: 86401, transitions: 'bounded' },
    { offsetSeconds: -86401, transitions: 'bounded' },
    { offsetSeconds: 0, transitions: 'continuous' },
    { offsetSeconds: 0, transitions: 'bounded', extra: true },
  ])
    expect(isVideoProjectClip({ ...clip, cameraTiming })).toBe(false);
  expect(isVideoProjectClip({ ...clip, type: 'AUDIO' })).toBe(false);
  for (const offsetSeconds of [-86400, 86400])
    expect(
      isVideoProjectClip({ ...clip, cameraTiming: { offsetSeconds, transitions: 'bounded' } })
    ).toBe(true);
});

it('caps overlapping transitions at the next authored key and uses authored crop destinations', () => {
  const { project, clip } = fixture();
  clip.cameraTiming = { offsetSeconds: 0, transitions: 'bounded' };
  clip.cameraAppearance = { shape: 'rounded', roundness: 0, zoom: 1, panX: 0, panY: 0 };
  const first = clip.cameraPositions![0]!;
  first.transition.duration = 6;
  first.crop = { zoom: 3, panX: 1, panY: -1 };
  clip.cameraPositions!.push({
    ...first,
    id: 'second',
    sourceTime: 3,
    transform: { ...first.transform, x: 0 },
    crop: { zoom: 1, panX: 0, panY: 0 },
    transition: { kind: 'smooth', duration: 2 },
  });
  expect(resolveCameraClip(clip, 2.5).transform.x).toBe(200);
  expect(resolveCameraClip(clip, 3).transform).toEqual(first.transform);
  expect(resolveCameraClip(clip, 3).cameraAppearance?.zoom).toBe(3);
  expect(resolveCameraClip(clip, 4).transform.x).toBe(200);
  expect(resolveCameraClip(clip, 4).cameraAppearance?.zoom).toBe(2);
  const desired = resolveCameraDestinationTransform(clip, 2.5, { x: 220 });
  expect(desired?.x).toBe(440);
  expect(cameraPositionSeekTime(project, clip.id, 0, first.id)).toBeCloseTo(3 - 1 / project.fps);
  expect(first.transition.duration).toBe(6);
  const partial = {
    ...clip,
    sourceStart: 2,
    sourceDuration: 4,
    startTime: 10,
    duration: 2,
    playbackRate: 2,
  };
  expect(resolveCameraClip(partial, 10.25).transform).toEqual(
    resolveCameraClip(clip, 2.5).transform
  );
  delete clip.cameraPositions![1]!.crop;
  expect(resolveCameraClip(clip, 4).cameraAppearance?.zoom).toBe(2);
  expect(resolveCameraClip(clip, 5).cameraAppearance?.zoom).toBe(1);
});

it('edits bounded camera offsets through the mutation owner and refuses invalid or locked edits', () => {
  const { project, clip } = fixture();
  clip.cameraTiming = { offsetSeconds: 2, transitions: 'bounded' };
  const changed = editCameraPosition(project, clip.id, 0, { kind: 'offset', offsetSeconds: -3 });
  expect(changed.version).toBe(32);
  expect(changed.clips[0]).toEqual({
    ...clip,
    cameraTiming: { offsetSeconds: -3, transitions: 'bounded' },
  });
  expect(clip.cameraTiming.offsetSeconds).toBe(2);
  for (const offsetSeconds of [NaN, Infinity, 86401, -86401, 2])
    expect(editCameraPosition(project, clip.id, 0, { kind: 'offset', offsetSeconds })).toBe(
      project
    );
  project.tracks[0]!.locked = true;
  expect(editCameraPosition(project, clip.id, 0, { kind: 'offset', offsetSeconds: 0 })).toBe(
    project
  );
});

it('edits dormant timing-camera visibility in retained main-source bounds and preserves long authored moves', () => {
  const { project, clip } = fixture();
  clip.cameraTiming = { offsetSeconds: -2, transitions: 'bounded' };
  project.assets[0]!.metadata.duration = 1;
  const hidden = editCameraPosition(project, clip.id, 0, { kind: 'hide', start: 6, end: 7 });
  expect(hidden.clips[0]).toMatchObject({ cameraHiddenRanges: [{ start: 6, end: 7 }] });
  const changed = editCameraPosition(project, clip.id, 0, {
    kind: 'update',
    id: 'corner',
    transition: { kind: 'smooth', duration: 20 },
  });
  expect(changed.clips[0]).toMatchObject({ cameraPositions: [{ transition: { duration: 20 } }] });
});

import { describe, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
  createVideoProjectTrack,
} from '../factories/creation';
import { createVideoClipFromAsset } from '../factories/clip';
import { isHydratableVideoProject } from '../validation/root';
import { resolveVideoCompositionVisualLayers } from '../../composition/timeline/frame/layers';
import { editCameraPosition } from './editing';
import { resolveCameraClip, resolveCameraVisualClip, type CameraPositionEdit } from './animation';
import { isCameraHiddenAt, parseCameraHiddenRanges, MAX_CAMERA_HIDDEN_RANGES } from './visibility';

function fixture() {
  const project = createEmptyVideoProject('Visibility');
  const track = { ...createVideoProjectTrack('Camera', 0, 'PRIMARY'), role: 'CAMERA' as const };
  const asset = createVideoProjectAsset(
    'Camera',
    'VIDEO',
    { kind: 'project-asset', projectAssetId: 'camera' },
    {
      width: 640,
      height: 360,
      duration: 8,
      mimeType: 'video/mp4',
      size: 10,
      hasAudio: true,
      audioPeaks: null,
    }
  );
  const clip = createVideoClipFromAsset(track.id, asset, project.width, project.height, 0);
  if (clip.type !== 'VIDEO') throw new Error('Expected camera video');
  clip.cameraAppearance = { shape: 'circle', roundness: 30, zoom: 1.5, panX: 0.2, panY: 0 };
  clip.cameraPositions = [
    {
      id: 'move',
      sourceTime: 2,
      fitMode: clip.fitMode,
      transform: { ...clip.transform, x: 100 },
      transition: { kind: 'smooth', duration: 2 },
      crop: { zoom: 3, panX: 0, panY: 0.5 },
    },
  ];
  project.assets = [asset];
  project.tracks = [track];
  project.clips = [clip];
  project.duration = 8;
  return { project, clip, track, asset };
}

function hiddenProject() {
  const { project, clip, track, asset } = fixture();
  clip.cameraHiddenRanges = [{ id: 'hidden', start: 2, end: 3 }];
  project.version = 12;
  return { project, clip, track, asset };
}

describe('camera source visibility boundary', () => {
  it('copies bounded ordered ranges, preserves adjacent IDs and uses half-open membership', () => {
    const ranges = [
      { id: 'a', start: 0, end: 1 },
      { id: 'b', start: 1, end: 86400 },
    ];
    const parsed = parseCameraHiddenRanges(ranges)!;
    expect(parsed).toEqual(ranges);
    expect(parsed).not.toBe(ranges);
    expect(parsed[0]).not.toBe(ranges[0]);
    expect(parseCameraHiddenRanges([])).toEqual([]);
    expect(isCameraHiddenAt(parsed, -1)).toBe(false);
    expect(isCameraHiddenAt(parsed, 0)).toBe(true);
    expect(isCameraHiddenAt([parsed[0]!], 1)).toBe(false);
    expect(isCameraHiddenAt(parsed, 1)).toBe(true);
    expect(isCameraHiddenAt(parsed, 86400)).toBe(false);
    expect(isCameraHiddenAt(parsed, NaN)).toBe(false);
    const maximum = Array.from({ length: MAX_CAMERA_HIDDEN_RANGES }, (_, i) => ({
      id: String(i),
      start: i,
      end: i + 1,
    }));
    expect(parseCameraHiddenRanges(maximum)).toEqual(maximum);
    expect(parseCameraHiddenRanges([...maximum, { id: 'extra', start: 512, end: 513 }])).toBeNull();
  });
  it.each([
    null,
    {},
    'ranges',
    [{ id: ' ', start: 0, end: 1 }],
    [{ id: 'x'.repeat(257), start: 0, end: 1 }],
    [{ id: 1, start: 0, end: 1 }],
    [{ id: 'a', start: -1, end: 1 }],
    [{ id: 'a', start: NaN, end: 1 }],
    [{ id: 'a', start: 0, end: Infinity }],
    [{ id: 'a', start: 0, end: 86401 }],
    [{ id: 'a', start: 1, end: 1 }],
    [{ id: 'a', start: 2, end: 1 }],
    [
      { id: 'a', start: 0, end: 2 },
      { id: 'b', start: 1, end: 3 },
    ],
    [
      { id: 'a', start: 2, end: 3 },
      { id: 'b', start: 0, end: 1 },
    ],
    [
      { id: 'a', start: 0, end: 1 },
      { id: 'a', start: 1, end: 2 },
    ],
  ])('refuses malformed source ranges: %j', (value) => {
    expect(parseCameraHiddenRanges(value)).toBeNull();
  });
  it('admits only version twelve when the optional field is present and never writes defaults on opening', () => {
    const { project, clip } = hiddenProject();
    expect(isHydratableVideoProject(project)).toBe(true);
    const serialized = JSON.stringify(project);
    expect(isHydratableVideoProject(JSON.parse(serialized))).toBe(true);
    expect(JSON.stringify(project)).toBe(serialized);
    for (let version = 2; version <= 11; version++) {
      expect(isHydratableVideoProject({ ...project, version })).toBe(false);
      expect(
        isHydratableVideoProject({
          ...project,
          version,
          clips: [{ ...clip, cameraHiddenRanges: [] }],
        })
      ).toBe(false);
    }
    expect(isHydratableVideoProject({ ...project, version: 22 })).toBe(false);
    const legacy = fixture();
    delete legacy.clip.cameraAppearance;
    delete legacy.clip.cameraPositions;
    for (let version = 2; version <= 13; version++) {
      const candidate = { ...legacy.project, version };
      const before = JSON.stringify(candidate);
      expect(isHydratableVideoProject(candidate)).toBe(true);
      expect(JSON.stringify(candidate)).toBe(before);
      expect(legacy.clip).not.toHaveProperty('cameraHiddenRanges');
    }
    expect(isHydratableVideoProject({ ...project, clips: [{ ...clip, type: 'AUDIO' }] })).toBe(
      false
    );
    expect(
      isHydratableVideoProject({
        ...project,
        clips: [{ ...clip, cameraHiddenRanges: [{ id: 'bad', start: 3, end: 2 }] }],
      })
    ).toBe(false);
  });
});

describe('camera visibility commands', () => {
  it('retains independent layout, crop, source, audio and subsequent edits; removal keeps schema twelve', () => {
    const { project, clip, asset } = fixture();
    const before = structuredClone(project);
    const changed = editCameraPosition(project, clip.id, 2, { kind: 'hide', start: 2, end: 3 });
    expect(changed.version).toBe(12);
    const camera = changed.clips[0];
    if (camera?.type !== 'VIDEO') throw new Error('Expected video');
    expect(camera).toEqual({
      ...clip,
      cameraHiddenRanges: [{ id: expect.any(String), start: 2, end: 3 }],
    });
    expect(changed.assets[0]).toBe(asset);
    expect(project).toEqual(before);
    const id = camera.cameraHiddenRanges![0]!.id;
    const cropped = editCameraPosition(changed, clip.id, 3, {
      kind: 'crop',
      crop: { zoom: 2, panX: 0, panY: 0 },
    });
    const updated = editCameraPosition(cropped, clip.id, 3, { kind: 'hide', id, start: 1, end: 4 });
    expect(updated.clips[0]).toMatchObject({
      cameraHiddenRanges: [{ id, start: 1, end: 4 }],
      cameraPositions: [{ crop: { zoom: 2 } }],
    });
    const removed = editCameraPosition(updated, clip.id, 3, { kind: 'show', id });
    expect(removed.version).toBe(12);
    expect(removed.clips[0]).not.toHaveProperty('cameraHiddenRanges');
    expect(editCameraPosition(removed, clip.id, 3, { kind: 'show', id })).toBe(removed);
    expect(isHydratableVideoProject(removed)).toBe(true);
  });
  it('updates one ID, preserves touching neighbors and retains dormant intervals beyond resolved metadata', () => {
    const { project, clip } = hiddenProject();
    clip.cameraHiddenRanges!.push({ id: 'dormant', start: 9, end: 12 });
    const changed = editCameraPosition(project, clip.id, 2, {
      kind: 'hide',
      id: 'hidden',
      start: 1,
      end: 9,
    });
    expect(changed.clips[0]).toMatchObject({
      cameraHiddenRanges: [
        { id: 'hidden', start: 1, end: 9 },
        { id: 'dormant', start: 9, end: 12 },
      ],
    });
    const retained = editCameraPosition(changed, clip.id, 2, { kind: 'show', id: 'hidden' });
    expect(retained.clips[0]).toMatchObject({
      cameraHiddenRanges: [{ id: 'dormant', start: 9, end: 12 }],
    });
  });
  it('refuses invalid, overlapping, stale, duplicate and locked commands before ID allocation', () => {
    const { project, clip, track } = hiddenProject();
    const edits: CameraPositionEdit[] = [
      { kind: 'hide', start: NaN, end: 2 },
      { kind: 'hide', start: -1, end: 2 },
      { kind: 'hide', start: 1, end: 1 },
      { kind: 'hide', start: 4, end: 9 },
      { kind: 'hide', start: 1, end: 2.5 },
      { kind: 'hide', id: 'missing', start: 4, end: 5 },
      { kind: 'hide', id: 'hidden', start: 2, end: 3 },
      { kind: 'show', id: 'missing' },
    ];
    const uuid = vi.spyOn(crypto, 'randomUUID');
    for (const edit of edits) expect(editCameraPosition(project, clip.id, 2, edit)).toBe(project);
    expect(uuid).not.toHaveBeenCalled();
    expect(editCameraPosition(project, 'missing', 2, { kind: 'hide', start: 4, end: 5 })).toBe(
      project
    );
    track.locked = true;
    expect(editCameraPosition(project, clip.id, 2, { kind: 'hide', start: 4, end: 5 })).toBe(
      project
    );
    track.locked = false;
    track.role = 'CAMERA';
    const ordinary = {
      ...project,
      tracks: project.tracks.map(({ role: _role, ...ordinaryTrack }) => ordinaryTrack),
    };
    expect(editCameraPosition(ordinary, clip.id, 2, { kind: 'show', id: 'hidden' })).toBe(ordinary);
    clip.cameraHiddenRanges![0]!.id = '00000000-0000-4000-8000-000000000000';
    uuid.mockReturnValue('00000000-0000-4000-8000-000000000000');
    expect(editCameraPosition(project, clip.id, 2, { kind: 'hide', start: 4, end: 5 })).toBe(
      project
    );
    uuid.mockRestore();
    const retry = editCameraPosition(project, clip.id, 2, { kind: 'hide', start: 4, end: 5 });
    expect(retry).not.toBe(project);
    expect(editCameraPosition(retry, clip.id, 2, { kind: 'hide', start: 4, end: 5 })).toBe(retry);
  });
  it('uses retained source bounds when camera duration metadata is unavailable', () => {
    const { project, clip, asset } = hiddenProject();
    asset.metadata.duration = null;
    const changed = editCameraPosition(project, clip.id, 2, { kind: 'hide', start: 6, end: 8 });
    expect(changed.clips[0]).toMatchObject({
      cameraHiddenRanges: [
        { id: 'hidden', start: 2, end: 3 },
        { id: expect.any(String), start: 6, end: 8 },
      ],
    });
    expect(changed.assets[0]).toBe(asset);
    expect(editCameraPosition(changed, clip.id, 2, { kind: 'hide', start: 8, end: 9 })).toBe(
      changed
    );
  });
  it('refuses new ranges at the count bound, but permits an existing range to change', () => {
    const { project, clip, asset } = fixture();
    asset.metadata.duration = 2000;
    clip.cameraHiddenRanges = Array.from({ length: 512 }, (_, i) => ({
      id: String(i),
      start: 2 * i,
      end: 2 * i + 1,
    }));
    expect(editCameraPosition(project, clip.id, 0, { kind: 'hide', start: 1100, end: 1101 })).toBe(
      project
    );
    expect(
      editCameraPosition(project, clip.id, 0, { kind: 'hide', id: '0', start: 0.25, end: 1 })
    ).not.toBe(project);
  });
});

it('hides camera pixels on source time across partial clips, movement and rate two', () => {
  const { project, clip } = hiddenProject();
  const partial = {
    ...clip,
    sourceStart: 1,
    sourceDuration: 6,
    startTime: 10,
    duration: 3,
    playbackRate: 2,
  };
  const second = { ...partial, id: 'other-instance', startTime: 20 };
  const montage = { ...project, duration: 23, clips: [partial, second] };
  const original = structuredClone(montage);
  expect(resolveCameraVisualClip(montage, partial, 10.499999).transform.opacity).toBe(1);
  for (const time of [10.5, 10.75, 10.999999]) {
    expect(resolveCameraVisualClip(montage, partial, time).transform.opacity).toBe(0);
    expect(resolveVideoCompositionVisualLayers(montage, time)).toEqual([]);
    expect(resolveCameraClip(partial, time).transform.opacity).toBe(1);
  }
  const endpoint = resolveCameraVisualClip(montage, partial, 11);
  expect(endpoint.transform).toEqual(resolveCameraClip(clip, 3).transform);
  expect(resolveVideoCompositionVisualLayers(montage, 11)).toHaveLength(1);
  expect(resolveCameraVisualClip(montage, second, 20.75).transform.opacity).toBe(0);
  expect(resolveCameraVisualClip({ ...montage, tracks: [] }, partial, 10.75)).toBe(partial);
  const changed = editCameraPosition(montage, second.id, 20.75, {
    kind: 'hide',
    id: 'hidden',
    start: 2,
    end: 4,
  });
  expect(changed.clips[0]).toBe(partial);
  expect(changed.clips[1]).toMatchObject({
    cameraHiddenRanges: [{ id: 'hidden', start: 2, end: 4 }],
  });
  expect(partial.cameraHiddenRanges).toEqual([{ id: 'hidden', start: 2, end: 3 }]);
  expect(montage).toEqual(original);
});

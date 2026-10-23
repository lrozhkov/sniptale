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
import { resolveCameraClip } from './animation';
import { editCameraPosition, cameraPositionSeekTime } from './editing';

import {
  cameraContentFrame,
  cameraSilhouette,
  DEFAULT_CAMERA_APPEARANCE,
  isCameraAppearance,
} from './appearance';
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

describe('camera silhouette and internal crop', () => {
  it('covers the entire window at every pan extreme and keeps framing independent of scene geometry', () => {
    for (const [w, h, sw, sh] of [
      [300, 200, 640, 480],
      [200, 300, 1920, 1080],
      [500, 100, 240, 480],
    ]) {
      for (const zoom of [1, 2, 4])
        for (const panX of [-1, 0, 1])
          for (const panY of [-1, 0, 1]) {
            const frame = cameraContentFrame(w!, h!, sw!, sh!, {
              ...DEFAULT_CAMERA_APPEARANCE,
              zoom,
              panX,
              panY,
            });
            expect(frame.x).toBeLessThanOrEqual(1e-8);
            expect(frame.y).toBeLessThanOrEqual(1e-8);
            expect(frame.x + frame.width).toBeGreaterThanOrEqual(w! - 1e-8);
            expect(frame.y + frame.height).toBeGreaterThanOrEqual(h! - 1e-8);
            expect(frame.width / frame.height).toBeCloseTo(sw! / sh!);
          }
    }
  });
  it('keeps soft and oval silhouettes within exact bounds with symmetric curved sides', () => {
    for (const shape of ['soft', 'ellipse'] as const) {
      const points = cameraSilhouette(300, 200, {
        ...DEFAULT_CAMERA_APPEARANCE,
        shape,
        roundness: 50,
      });
      expect(Math.min(...points.map((p) => p.x))).toBeCloseTo(0);
      expect(Math.max(...points.map((p) => p.x))).toBeCloseTo(300);
      expect(Math.min(...points.map((p) => p.y))).toBeCloseTo(0);
      expect(Math.max(...points.map((p) => p.y))).toBeCloseTo(200);
      expect(points[16]!.x).toBeLessThan(300);
      expect(points[16]!.x + points[80]!.x).toBeCloseTo(300);
    }
  });
  it('persists framing independently of animated positions and rejects invalid mutations', () => {
    const { project, clip } = fixture();
    const appearance = {
      ...DEFAULT_CAMERA_APPEARANCE,
      shape: 'soft' as const,
      zoom: 2,
      panX: -0.5,
      roundness: 40,
    };
    const next = editCameraPosition(project, clip.id, 3, { kind: 'appearance', appearance });
    expect(project.clips[0]).toEqual(clip);
    const updated = next.clips[0]!;
    expect(updated.transform).toEqual(clip.transform);
    expect(isVideoProjectClip(JSON.parse(JSON.stringify(updated)))).toBe(true);
    if (updated.type !== 'VIDEO') throw new Error('video');
    expect(updated.cameraPositions).toEqual(clip.cameraPositions);
    for (const time of [0, 2, 3, 5])
      expect(resolveCameraClip(updated, time).cameraAppearance).toEqual(appearance);
    expect(resolveVideoCompositionVisualLayers(next, 3)[0]?.clip).toMatchObject({
      cameraAppearance: appearance,
    });
    expect(
      editCameraPosition(next, clip.id, 3, {
        kind: 'appearance',
        appearance: { ...appearance, zoom: NaN },
      })
    ).toBe(next);
    const locked = { ...next, tracks: next.tracks.map((t) => ({ ...t, locked: true })) };
    expect(editCameraPosition(locked, clip.id, 3, { kind: 'appearance', appearance })).toBe(locked);
  });
  it('rejects malformed and out of range persisted appearance', () => {
    const { clip } = fixture();
    for (const appearance of [
      null,
      {},
      { ...DEFAULT_CAMERA_APPEARANCE, shape: 'html' },
      { ...DEFAULT_CAMERA_APPEARANCE, zoom: 0 },
      { ...DEFAULT_CAMERA_APPEARANCE, panX: 2 },
      { ...DEFAULT_CAMERA_APPEARANCE, roundness: 101 },
      { ...DEFAULT_CAMERA_APPEARANCE, zoom: Infinity },
    ]) {
      expect(isCameraAppearance(appearance)).toBe(false);
      expect(isVideoProjectClip({ ...clip, cameraAppearance: appearance })).toBe(false);
    }
  });
});

it('edits timing and removes positions without dropping clip-wide framing', () => {
  const { project, clip } = fixture();
  const styled = editCameraPosition(project, clip.id, 0, {
    kind: 'appearance',
    appearance: { ...DEFAULT_CAMERA_APPEARANCE, zoom: 2 },
  });
  const added = editCameraPosition(styled, clip.id, 5, { kind: 'add' });
  const video = added.clips[0]!;
  if (video.type !== 'VIDEO') throw new Error('video');
  const point = video.cameraPositions!.at(-1)!;
  const timed = editCameraPosition(added, clip.id, 5, {
    kind: 'update',
    id: point.id,
    sourceTime: 5.2,
    transition: { kind: 'shrink', duration: 1 },
  });
  expect(timed.clips[0]).toMatchObject({
    cameraAppearance: { zoom: 2 },
    cameraPositions: expect.arrayContaining([expect.objectContaining({ sourceTime: 5.2 })]),
  });
  expect(
    editCameraPosition(timed, clip.id, 5, { kind: 'update', id: point.id, sourceTime: NaN })
  ).toBe(timed);
  expect(
    editCameraPosition(timed, clip.id, 5, {
      kind: 'update',
      id: point.id,
      transition: { kind: 'smooth', duration: -1 },
    })
  ).toBe(timed);
  expect(editCameraPosition(timed, clip.id, 5, { kind: 'update', id: 'missing' })).toBe(timed);
  expect(editCameraPosition(timed, clip.id, 5, { kind: 'select', id: point.id })).toBe(timed);
  expect(editCameraPosition(timed, clip.id, -1, { kind: 'add' })).toBe(timed);
  const removed = editCameraPosition(timed, clip.id, 5, { kind: 'remove', id: point.id });
  expect(removed.clips[0]).toMatchObject({
    cameraAppearance: { zoom: 2 },
    cameraPositions: clip.cameraPositions,
  });
});

it('keeps framing edits scoped to their camera and seeks visible destinations only', () => {
  const { project, clip } = fixture();
  project.clips.push({ ...clip, id: 'other' });
  const updated = editCameraPosition(project, clip.id, 0, {
    kind: 'appearance',
    appearance: DEFAULT_CAMERA_APPEARANCE,
  });
  expect(updated.clips[1]).toBe(project.clips[1]);
  expect(cameraPositionSeekTime(project, clip.id, 3)).toBe(4);
  expect(cameraPositionSeekTime(project, clip.id, 3, null)).toBe(0);
  expect(cameraPositionSeekTime(project, 'missing', 3)).toBe(3);
  expect(editCameraPosition(project, 'missing', 0, { kind: 'add' })).toBe(project);
  const instant = editCameraPosition(project, clip.id, 3, {
    kind: 'update',
    id: 'corner',
    transition: { kind: 'instant', duration: 0 },
  });
  expect(cameraPositionSeekTime(instant, clip.id, 3, 'corner')).toBe(2);
});

it('only stretches source proportions when explicitly requested by custom fitting', () => {
  expect(cameraContentFrame(200, 100, 400, 400, DEFAULT_CAMERA_APPEARANCE, true)).toEqual({
    x: 0,
    y: 0,
    width: 200,
    height: 100,
  });
});

it('reflects only an editable camera without changing positions or unrelated clips', () => {
  const { project, clip } = fixture();
  project.clips.push({ ...clip, id: 'other' });
  const before = structuredClone(project);
  const next = editCameraPosition(project, clip.id, 3, { kind: 'mirror', mirrored: true });
  expect(next.version).toBe(8);
  expect(next.clips[0]).toEqual({ ...clip, cameraMirrored: true });
  expect(next.clips[1]).toBe(project.clips[1]);
  expect(project).toEqual(before);
  expect(editCameraPosition(next, clip.id, 3, { kind: 'mirror', mirrored: true })).toBe(next);
  const locked = { ...next, tracks: next.tracks.map((track) => ({ ...track, locked: true })) };
  expect(editCameraPosition(locked, clip.id, 3, { kind: 'mirror', mirrored: false })).toBe(locked);
  const primary = {
    ...project,
    tracks: project.tracks.map((track) => {
      const primary = { ...track };
      delete primary.role;
      return primary;
    }),
  };
  expect(editCameraPosition(primary, clip.id, 3, { kind: 'mirror', mirrored: true })).toBe(primary);
  const reset = editCameraPosition(next, clip.id, 3, { kind: 'mirror', mirrored: false });
  expect(reset.clips[0]).toMatchObject({
    cameraMirrored: false,
    cameraPositions: clip.cameraPositions,
  });
  for (const cameraMirrored of ['yes', 1, null])
    expect(isVideoProjectClip({ ...clip, cameraMirrored })).toBe(false);
  expect(isVideoProjectClip({ ...clip, type: 'AUDIO', cameraMirrored: true })).toBe(false);
});

it('shares an inscribed circle without rewriting placement and keeps appearance edits idempotent', async () => {
  const { cameraWindowFrame } = await import('./appearance');
  const { project, clip } = fixture();
  expect(cameraWindowFrame({ x: 10, y: 20, width: 200, height: 100 }, 'circle')).toEqual({
    x: 60,
    y: 20,
    width: 100,
    height: 100,
  });
  expect(cameraWindowFrame({ x: 10, y: 20, width: 100, height: 200 }, 'circle')).toEqual({
    x: 10,
    y: 70,
    width: 100,
    height: 100,
  });
  const appearance = {
    ...DEFAULT_CAMERA_APPEARANCE,
    shape: 'circle' as const,
    roundness: 73,
    zoom: 1.5,
    panX: 0.2,
  };
  expect(isCameraAppearance(appearance)).toBe(true);
  const next = editCameraPosition(project, clip.id, 2, { kind: 'appearance', appearance });
  expect(next.version).toBe(10);
  expect(next.clips[0]).toEqual({ ...clip, cameraAppearance: appearance });
  expect(editCameraPosition(next, clip.id, 2, { kind: 'appearance', appearance })).toBe(next);
  const locked = {
    ...project,
    tracks: project.tracks.map((track) => ({ ...track, locked: true })),
  };
  expect(editCameraPosition(locked, clip.id, 2, { kind: 'appearance', appearance })).toBe(locked);
  expect(
    editCameraPosition(project, clip.id, 2, {
      kind: 'appearance',
      appearance: DEFAULT_CAMERA_APPEARANCE,
    })
  ).toBe(project);
  const points = cameraSilhouette(200, 100, appearance);
  expect(points[0]).toEqual({ x: 150, y: 50 });
  for (const point of points) expect(Math.hypot(point.x - 100, point.y - 50)).toBeCloseTo(50, 8);
  expect(clip).not.toHaveProperty('cameraAppearance');
});

it('shares bounded source crop validation and transition arithmetic', async () => {
  const { isCameraCrop, interpolateCameraCrop } = await import('./appearance');
  const from = { zoom: 1, panX: -1, panY: 1 };
  const to = { zoom: 4, panX: 1, panY: -1 };
  expect(isCameraCrop(from)).toBe(true);
  expect(isCameraCrop(to)).toBe(true);
  for (const value of [
    null,
    {},
    { ...from, zoom: 0 },
    { ...from, zoom: Infinity },
    { ...from, panX: NaN },
    { ...from, panY: 2 },
  ])
    expect(isCameraCrop(value)).toBe(false);
  expect(interpolateCameraCrop(from, to, 0)).toEqual(from);
  expect(interpolateCameraCrop(from, to, 0.5)).toEqual({ zoom: 2.5, panX: 0, panY: 0 });
  expect(interpolateCameraCrop(from, to, 1)).toEqual(to);
});

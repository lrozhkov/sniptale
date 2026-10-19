import { undoVideoEditorProjectHistory, redoVideoEditorProjectHistory } from '../../history';
import { isHydratableVideoProject } from '../../../../features/video/project/validation/root';
import { getFittedMediaWindowFrame } from '../../../../features/video/composition/draw/fitted-media';
import { mediaWindowPadding } from '../../../../features/video/project/window-geometry';
import { expect, it } from 'vitest';
import {
  DEFAULT_WINDOW_HEADER,
  windowHeaderGeometry,
} from '@sniptale/runtime-contracts/window-header';
import { createProjectWithMediaTrack } from './content.test-support';
import { createVideoEditorProjectTestStore } from '../test-store.test-support';
import { resolveMediaClipTransformForFitMode } from '../../../../features/video/project/factories/clip';

it.each(['clip-video', 'clip-image'])(
  'fits the entire cropped decorated %s window and preserves opacity',
  (id) => {
    const store = createVideoEditorProjectTestStore();
    const project = createProjectWithMediaTrack();
    const clip = project.clips.find((clip) => clip.id === id)!;
    if (clip.type !== 'VIDEO' && clip.type !== 'IMAGE') throw new Error('Missing media');
    clip.windowHeader = { ...DEFAULT_WINDOW_HEADER };
    clip.sourceCrop = { x: 0.25, y: 0, width: 0.5, height: 1 };
    clip.transform.opacity = 0.37;
    const asset = project.assets.find((asset) => asset.id === clip.assetId)!;
    const width = asset.metadata.width * 0.5,
      height = asset.metadata.height;
    const header = windowHeaderGeometry(clip.windowHeader, { width, height }).height;
    const expected = resolveMediaClipTransformForFitMode(
      width,
      height + header,
      project.width,
      project.height,
      'CONTAIN',
      100
    );
    store.getState().setProject(project);
    store.getState().updateMediaClipFitMode(id, 'CONTAIN', 100);
    const next = store.getState().project!.clips.find((clip) => clip.id === id)!;
    expect(next.transform).toEqual({ ...expected, opacity: 0.37 });
  }
);

it.each(['clip-video', 'clip-image'])(
  'pads current decorated %s in one history operation without changing other authored entities',
  (id) => {
    const store = createVideoEditorProjectTestStore(),
      project = createProjectWithMediaTrack();
    project.version = 16;
    const clip = project.clips.find((clip) => clip.id === id)!;
    if (clip.type !== 'VIDEO' && clip.type !== 'IMAGE') throw new Error('Expected media');
    clip.sourceCrop = { x: 0.1, y: 0.2, width: 0.5, height: 0.6 };
    clip.windowHeader = { ...DEFAULT_WINDOW_HEADER };
    clip.windowCornerRadius = 12;
    clip.transform = { ...clip.transform, x: 123, y: 87, rotation: 21, opacity: 0.37 };
    const original = structuredClone(project);
    store.getState().setProject(project);
    const acceptedBefore = store.getState().project!;
    store.getState().editMediaClip(id, { kind: 'padding', padding: 40.125 });
    const after = store.getState().project!,
      next = after.clips.find((clip) => clip.id === id)!;
    expect(after.version).toBe(16);
    expect(after.assets).toBe(acceptedBefore.assets);
    expect(after.clips.filter((clip) => clip.id !== id)).toEqual(
      acceptedBefore.clips.filter((clip) => clip.id !== id)
    );
    expect(next.transform.opacity).toBe(0.37);
    expect(next.transform.rotation).toBe(0);
    expect(isHydratableVideoProject(after)).toBe(true);
    const strip = (value: typeof clip) => {
      const { transform: _transform, fitMode: _mode, fitScalePercent: _scale, ...rest } = value;
      return rest;
    };
    if (next.type !== 'VIDEO' && next.type !== 'IMAGE') throw new Error('Expected media');
    const canonical = acceptedBefore.clips.find((item) => item.id === id)!;
    if (canonical.type !== 'VIDEO' && canonical.type !== 'IMAGE') throw new Error('Expected media');
    expect(strip(next)).toEqual(strip(canonical));
    const asset = project.assets.find((asset) => asset.id === clip.assetId)!;
    const frame = getFittedMediaWindowFrame({
      frame: next.transform,
      fitMode: next.fitMode,
      sourceWidth: asset.metadata.width,
      sourceHeight: asset.metadata.height,
      ...(next.sourceCrop ? { sourceCrop: next.sourceCrop } : {}),
      ...(next.windowHeader ? { windowHeader: next.windowHeader } : {}),
    });
    expect(mediaWindowPadding(project, frame)).toBeCloseTo(40.125, 10);
    expect(project).toEqual(original);
    const accepted = store.getState();
    store.getState().editMediaClip(id, { kind: 'padding', padding: 40.125 });
    expect(store.getState().project).toBe(accepted.project);
    expect(store.getState().projectHistory).toBe(accepted.projectHistory);
    const undo = undoVideoEditorProjectHistory(accepted.projectHistory, after);
    if (undo?.status !== 'applied') throw new Error('Expected undo');
    expect(undo.project.clips).toEqual(acceptedBefore.clips);
    const redo = redoVideoEditorProjectHistory(undo.history, undo.project);
    if (redo?.status !== 'applied') throw new Error('Expected redo');
    expect(redo.project.clips).toEqual(after.clips);
  }
);

it('refuses invalid, impossible, locked, missing, CAMERA and non-media padding edits without history', () => {
  const store = createVideoEditorProjectTestStore(),
    base = createProjectWithMediaTrack();
  const scenarios = [
    { id: 'clip-video', padding: -1, project: base },
    { id: 'clip-video', padding: NaN, project: base },
    { id: 'clip-video', padding: Infinity, project: base },
    { id: 'clip-video', padding: 4096, project: base },
    { id: 'missing', padding: 40, project: base },
    { id: 'clip-text', padding: 40, project: base },
    { id: 'clip-video', padding: 40, project: { ...base, assets: [] } },
    {
      id: 'clip-video',
      padding: 40,
      project: { ...base, tracks: base.tracks.map((track) => ({ ...track, locked: true })) },
    },
    {
      id: 'clip-video',
      padding: 40,
      project: {
        ...base,
        tracks: base.tracks.map((track) => ({ ...track, role: 'CAMERA' as const })),
      },
    },
  ];
  for (const { id, padding, project } of scenarios) {
    store.getState().setProject(project);
    const before = store.getState();
    store.getState().editMediaClip(id, { kind: 'padding', padding });
    expect(store.getState().project).toBe(before.project);
    expect(store.getState().projectHistory).toBe(before.projectHistory);
  }
});

it('uses the latest crop, header and opacity when a scalar framing action follows independent edits', () => {
  const store = createVideoEditorProjectTestStore();
  store.getState().setProject(createProjectWithMediaTrack());
  store.getState().editMediaClip('clip-video', {
    kind: 'source-crop',
    crop: { x: 0, y: 0, width: 0.5, height: 1 },
  });
  store.getState().updateMediaClipWindowHeader('clip-video', { ...DEFAULT_WINDOW_HEADER });
  store.getState().updateClipTransform('clip-video', { opacity: 0.42 });
  const before = store.getState().project!;
  store.getState().editMediaClip('clip-video', { kind: 'padding', padding: 40 });
  const next = store.getState().project!.clips.find((clip) => clip.id === 'clip-video')!;
  expect(next).toMatchObject({
    sourceCrop: { width: 0.5 },
    windowHeader: DEFAULT_WINDOW_HEADER,
    transform: { opacity: 0.42 },
  });
  expect(next.transform.width / next.transform.height).not.toBeCloseTo(
    before.width / before.height,
    2
  );
});

it('supports small ordinary fit scales while preserving CAMERA scale bounds and dormant header behavior', () => {
  for (const camera of [false, true]) {
    const store = createVideoEditorProjectTestStore(),
      project = createProjectWithMediaTrack();
    if (camera)
      project.tracks = project.tracks.map((track) => ({ ...track, role: 'CAMERA' as const }));
    const clip = project.clips.find((clip) => clip.id === 'clip-video')!;
    if (clip.type !== 'VIDEO') throw new Error('Missing video');
    clip.windowHeader = { ...DEFAULT_WINDOW_HEADER };
    store.getState().setProject(project);
    store.getState().updateMediaClipFitMode('clip-video', 'CONTAIN', 1);
    const fitted = store.getState().project!.clips.find((item) => item.id === clip.id)!;
    expect('fitScalePercent' in fitted && fitted.fitScalePercent).toBe(camera ? 10 : 1);
    if (camera) {
      const asset = project.assets.find((asset) => asset.id === clip.assetId)!;
      const expected = resolveMediaClipTransformForFitMode(
        asset.metadata.width,
        asset.metadata.height,
        project.width,
        project.height,
        'CONTAIN',
        10
      );
      expect(fitted.transform).toEqual(expected);
    }
  }
});

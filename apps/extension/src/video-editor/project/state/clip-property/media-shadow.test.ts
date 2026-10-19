import { undoVideoEditorProjectHistory, redoVideoEditorProjectHistory } from '../../history';
import { expect, it } from 'vitest';
import {
  VideoMediaFitMode,
  VideoMediaShadowMode,
  VideoProjectClipType,
} from '../../../../features/video/project/types';
import { createProjectWithMediaTrack } from './content.test-support';
import { createVideoEditorProjectTestStore } from '../test-store.test-support';

function createContentStore() {
  return createVideoEditorProjectTestStore();
}

it('updates media shadow intensity and mode while preserving transform edits', () => {
  const store = createContentStore();
  store.getState().setProject(createProjectWithMediaTrack());

  store.getState().updateClipTransform('clip-video', { x: 321 });
  store.getState().updateMediaClipShadowIntensity('clip-video', 133);
  store.getState().updateMediaClipShadowMode('clip-video', VideoMediaShadowMode.GLOW);

  const clip = store.getState().project?.clips.find((item) => item.id === 'clip-video');
  expect(clip).toEqual(
    expect.objectContaining({
      shadowIntensity: 100,
      shadowMode: VideoMediaShadowMode.GLOW,
      transform: expect.objectContaining({ x: 321 }),
    })
  );
});

it('applies media visual settings to compatible clips on the same track only', () => {
  const store = createContentStore();
  store.getState().setProject(createProjectWithMediaTrack());

  store.getState().updateMediaClipFitMode('clip-video', VideoMediaFitMode.FIT_LONG_SIDE);
  store.getState().updateMediaClipFitScalePercent('clip-video', 65);
  store.getState().updateMediaClipShadowIntensity('clip-video', 35);
  store.getState().updateMediaClipShadowMode('clip-video', VideoMediaShadowMode.GLOW);
  store.getState().applyMediaClipVisualsToTrack('clip-video');
  store.getState().updateMediaClipFitScalePercent('clip-text', 30);
  store.getState().updateMediaClipShadowIntensity('clip-text', 70);

  const imageClip = store.getState().project?.clips.find((item) => item.id === 'clip-image');
  const textClip = store.getState().project?.clips.find((item) => item.id === 'clip-text');

  expect(imageClip).toEqual(
    expect.objectContaining({
      fitMode: VideoMediaFitMode.FIT_LONG_SIDE,
      fitScalePercent: 65,
      shadowIntensity: 35,
      shadowMode: VideoMediaShadowMode.GLOW,
    })
  );
  expect(textClip?.type).toBe(VideoProjectClipType.TEXT);
});

it('keeps media shadow updates as no-ops when the owning track is locked', () => {
  const store = createContentStore();
  const project = createProjectWithMediaTrack();

  store.getState().setProject({
    ...project,
    tracks: project.tracks.map((track) =>
      track.id === project.tracks[0]!.id ? { ...track, locked: true } : track
    ),
  });
  store.getState().updateMediaClipShadowIntensity('clip-video', 50);
  store.getState().updateMediaClipShadowMode('clip-video', VideoMediaShadowMode.GLOW);

  const clip = store.getState().project?.clips.find((item) => item.id === 'clip-video');
  expect(clip).toEqual(expect.objectContaining({ shadowIntensity: 0 }));
  expect(clip).not.toEqual(expect.objectContaining({ shadowMode: VideoMediaShadowMode.GLOW }));
});

it('does not publish unchanged shadow input after a fit scale edit', () => {
  const store = createContentStore();
  store.getState().setProject(createProjectWithMediaTrack());
  store.getState().updateMediaClipFitScalePercent('clip-video', 50);
  const scaled = store.getState().project;
  const history = store.getState().projectHistory;

  store.getState().updateMediaClipShadowIntensity('clip-video', 0);

  expect(store.getState().project).toBe(scaled);
  expect(store.getState().projectHistory).toBe(history);
});

it('applies active camera size and appearance across its lane without replacing positions or timing', () => {
  const store = createContentStore();
  const project = createProjectWithMediaTrack();
  const source = project.clips.find((clip) => clip.id === 'clip-video');
  if (source?.type !== 'VIDEO') throw new Error('Missing video');
  const appearance = { shape: 'soft' as const, roundness: 70, zoom: 1.5, panX: 0.2, panY: -0.1 };
  const camera = {
    ...source,
    cameraAppearance: appearance,
    shadowColor: '#3399ff',
    shadowIntensity: 80,
    shadowMode: VideoMediaShadowMode.GLOW,
    cameraPositions: [
      {
        id: 'position',
        sourceTime: 1,
        transform: { ...source.transform, x: 100, width: 420, height: 420 },
        fitMode: source.fitMode,
        transition: { kind: 'smooth' as const, duration: 0.5 },
      },
    ],
  };
  const target = {
    ...source,
    id: 'second-camera',
    startTime: 6,
    transform: { ...source.transform, x: 700, y: 200, rotation: 15 },
    cameraPositions: [
      {
        id: 'other-position',
        sourceTime: 2,
        transform: { ...source.transform, x: 900, y: 300 },
        fitMode: source.fitMode,
        transition: { kind: 'shrink' as const, duration: 1 },
      },
    ],
  };
  project.tracks = project.tracks.map((track) =>
    track.id === source.trackId ? { ...track, role: 'CAMERA' as const } : track
  );
  project.clips = [camera, target];
  store.getState().setProject(project);
  store.setState({ currentTime: 2 });
  const before = store.getState().project;
  store.getState().applyMediaClipVisualsToTrack(source.id);
  const updated = store.getState().project?.clips.find((clip) => clip.id === target.id);
  expect(updated).toMatchObject({
    startTime: 6,
    sourceStart: 0,
    sourceDuration: 6,
    cameraAppearance: appearance,
    shadowIntensity: 80,
    shadowMode: 'GLOW',
    shadowColor: '#3399ff',
    transform: { x: 700, y: 200, rotation: 15, width: 420, height: 420 },
    cameraPositions: [
      {
        id: 'other-position',
        sourceTime: 2,
        transform: { x: 900, y: 300, width: 420, height: 420 },
        transition: { kind: 'shrink', duration: 1 },
      },
    ],
  });
  expect(before?.clips[1]).toMatchObject(target);
  const after = store.getState().project!;
  const undo = undoVideoEditorProjectHistory(store.getState().projectHistory, after);
  if (undo?.status !== 'applied') throw new Error('Expected undo');
  expect(undo.project.clips).toEqual(before?.clips);
  const redo = redoVideoEditorProjectHistory(undo.history, undo.project);
  if (redo?.status !== 'applied') throw new Error('Expected redo');
  expect(redo.project.clips).toEqual(after.clips);
  store.setState({
    project: { ...after, tracks: after.tracks.map((track) => ({ ...track, locked: true })) },
  });
  const locked = store.getState().project;
  store.getState().applyMediaClipVisualsToTrack(source.id);
  expect(store.getState().project).toBe(locked);
});

it('makes camera dimensions crop the image immediately and keeps resize atomic', () => {
  const store = createContentStore();
  const project = createProjectWithMediaTrack();
  project.tracks = project.tracks.map((track) => ({ ...track, role: 'CAMERA' }));
  store.getState().setProject(project);
  const before = store.getState().project!;
  store.getState().updateClipTransform('clip-video', { width: 420, height: 420 });
  const after = store.getState().project!;
  expect(after.clips.find((clip) => clip.id === 'clip-video')).toMatchObject({
    transform: { width: 420, height: 420 },
    cameraAppearance: { shape: 'rounded', roundness: 0, zoom: 1, panX: 0, panY: 0 },
  });
  const undo = undoVideoEditorProjectHistory(store.getState().projectHistory, after);
  if (undo?.status !== 'applied') throw new Error('Expected undo');
  expect(undo.project.clips).toEqual(before.clips);
});

it('applies fit mode and preset scale in one undoable change and respects track locking', () => {
  const store = createContentStore();
  store.getState().setProject(createProjectWithMediaTrack());
  const before = store.getState().project!;
  store.getState().updateMediaClipFitMode('clip-video', VideoMediaFitMode.CONTAIN, 88);
  const after = store.getState().project!;
  expect(after.clips.find((clip) => clip.id === 'clip-video')).toMatchObject({
    fitMode: VideoMediaFitMode.CONTAIN,
    fitScalePercent: 88,
  });
  const undo = undoVideoEditorProjectHistory(store.getState().projectHistory, after);
  if (undo?.status !== 'applied') throw new Error('Expected undo');
  expect(undo.project.clips).toEqual(before.clips);
  const redo = redoVideoEditorProjectHistory(undo.history, undo.project);
  if (redo?.status !== 'applied') throw new Error('Expected redo');
  expect(redo.project.clips).toEqual(after.clips);
  store
    .getState()
    .setProject({ ...before, tracks: before.tracks.map((track) => ({ ...track, locked: true })) });
  const locked = store.getState().project;
  store.getState().updateMediaClipFitMode('clip-video', VideoMediaFitMode.COVER, 100);
  expect(store.getState().project).toBe(locked);
});

it('authors independent media colors, preserves dormant values and supports history and retry', () => {
  const store = createContentStore();
  store.getState().setProject(createProjectWithMediaTrack());
  store.getState().updateClipTransform('clip-video', { x: 321 });
  store.getState().updateMediaClipShadowColor('clip-video', '#ff008080');
  const accepted = store.getState().project;
  expect(accepted?.version).toBe(9);
  expect(accepted?.clips.find((clip) => clip.id === 'clip-video')).toMatchObject({
    shadowColor: '#ff008080',
    shadowIntensity: 0,
    transform: { x: 321 },
  });
  const history = store.getState().projectHistory;
  store.getState().updateMediaClipShadowColor('clip-video', '#ff008080');
  store.getState().updateMediaClipShadowColor('clip-video', 'url(invalid)');
  store.getState().updateMediaClipShadowColor('clip-text', '#00ff00');
  expect(store.getState().project).toBe(accepted);
  expect(store.getState().projectHistory).toBe(history);
  const undo = undoVideoEditorProjectHistory(store.getState().projectHistory, accepted!);
  if (undo?.status !== 'applied') throw new Error('Expected shadow undo');
  expect(undo.project.clips.find((clip) => clip.id === 'clip-video')).not.toHaveProperty(
    'shadowColor'
  );
  const redo = redoVideoEditorProjectHistory(undo.history, undo.project);
  if (redo?.status !== 'applied') throw new Error('Expected shadow redo');
  expect(redo.project.clips.find((clip) => clip.id === 'clip-video')).toHaveProperty(
    'shadowColor',
    '#ff008080'
  );
  store.getState().updateMediaClipShadowMode('clip-video', 'GLOW');
  store.getState().updateMediaClipShadowIntensity('clip-video', 0);
  store.getState().updateMediaClipShadowColor('clip-image', '#0000ff');
  expect(store.getState().project?.clips.find((clip) => clip.id === 'clip-video')).toMatchObject({
    shadowColor: '#ff008080',
    shadowIntensity: 0,
    shadowMode: 'GLOW',
  });
  expect(store.getState().project?.clips.find((clip) => clip.id === 'clip-image')).toHaveProperty(
    'shadowColor',
    '#0000ff'
  );
});

it('copies or clears color with track visuals and refuses locked media before retry', () => {
  const store = createContentStore();
  const project = createProjectWithMediaTrack();
  store.getState().setProject({
    ...project,
    tracks: project.tracks.map((track) => ({ ...track, locked: true })),
  });
  const locked = store.getState().project;
  store.getState().updateMediaClipShadowColor('clip-video', '#ff0000');
  expect(store.getState().project).toBe(locked);
  store.getState().setProject(project);
  store.getState().updateMediaClipShadowColor('clip-image', '#0000ff');
  store.getState().applyMediaClipVisualsToTrack('clip-video');
  expect(
    store.getState().project?.clips.find((clip) => clip.id === 'clip-image')
  ).not.toHaveProperty('shadowColor');
  store.getState().updateMediaClipShadowColor('clip-video', '#ff0000');
  store.getState().applyMediaClipVisualsToTrack('clip-video');
  expect(store.getState().project?.clips.find((clip) => clip.id === 'clip-image')).toHaveProperty(
    'shadowColor',
    '#ff0000'
  );
});

it('retains authored color while refitting an active camera position and refuses empty colors', () => {
  const store = createContentStore();
  const project = createProjectWithMediaTrack();
  project.tracks = project.tracks.map((track) => ({ ...track, role: 'CAMERA' }));
  project.clips = project.clips.map((clip) =>
    clip.type === 'VIDEO'
      ? {
          ...clip,
          cameraPositions: [
            {
              id: 'destination',
              sourceTime: 1,
              transform: { ...clip.transform, x: 200 },
              fitMode: clip.fitMode,
              transition: { kind: 'instant', duration: 0 },
            },
          ],
        }
      : clip
  );
  store.getState().setProject(project);
  store.setState({ currentTime: 2 });
  store.getState().updateMediaClipShadowColor('clip-video', '#12345680');
  const accepted = store.getState().project;
  for (const invalid of ['', ' '.repeat(500)])
    store.getState().updateMediaClipShadowColor('clip-video', invalid);
  expect(store.getState().project).toBe(accepted);
  const before = accepted!.clips.find((clip) => clip.id === 'clip-video');
  store.getState().updateMediaClipFitMode('clip-video', 'COVER');
  store.getState().updateMediaClipFitScalePercent('clip-video', 75);
  const after = store.getState().project!.clips.find((clip) => clip.id === 'clip-video');
  if (before?.type !== 'VIDEO' || after?.type !== 'VIDEO') throw new Error('Missing camera');
  expect(after).toMatchObject({ shadowColor: '#12345680', fitScalePercent: 75 });
  expect(after.transform).toEqual(before.transform);
  expect(after.cameraPositions?.[0]).toMatchObject({
    id: 'destination',
    sourceTime: 1,
    fitMode: 'COVER',
  });
  expect(after.cameraPositions?.[0]?.transform).not.toEqual(before.cameraPositions?.[0]?.transform);
  expect(after.sourceStart).toBe(before.sourceStart);
  expect(after.sourceDuration).toBe(before.sourceDuration);
});

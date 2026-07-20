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

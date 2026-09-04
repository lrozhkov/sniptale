import { expect, it } from 'vitest';
import { createEmptyVideoProject, createVideoProjectTrack } from '../factories/creation';
import {
  VideoTrackKind,
  VideoBlockKind,
  VideoClipLinkMode,
  VideoProjectClipType,
} from '../types/index';
import {
  expandVideoBlockRecipe,
  getVideoBlockRecipeDefinition,
  getVideoBlockRecipeSelectionOrder,
} from './recipes';

it('keeps the block selection order stable for the gallery-first insertion flow', () => {
  expect(getVideoBlockRecipeSelectionOrder()).toEqual([
    VideoBlockKind.KINETIC_CAPTIONS,
    VideoBlockKind.STEP_EXPLAINER,
    VideoBlockKind.CHAPTER_OPENER,
    VideoBlockKind.FEATURE_SPOTLIGHT,
    VideoBlockKind.SPEAKER_INTRO,
    VideoBlockKind.CTA_WRAP_UP,
  ]);
});

it('expands recipes into normal project clips without hidden state', () => {
  const project = createEmptyVideoProject('Blocks');
  project.tracks.push(createVideoProjectTrack('Annotations', 0, VideoTrackKind.OVERLAY));
  const clips = expandVideoBlockRecipe(
    VideoBlockKind.CHAPTER_OPENER,
    project.tracks[1]!.id,
    project,
    3
  );

  expect(clips).toHaveLength(2);
  expect(clips.every((clip) => clip.trackId === project.tracks[1]!.id)).toBe(true);
  expect(clips.every((clip) => clip.type === VideoProjectClipType.ANNOTATION)).toBe(true);
  expect(new Set(clips.map((clip) => clip.groupId)).size).toBe(1);
  expect(clips.every((clip) => clip.groupId)).toBe(true);
  expect(clips.every((clip) => clip.linkMode === VideoClipLinkMode.LINKED)).toBe(true);
});

it('keeps subtitle-first recipes on subtitle tracks and spotlight recipes on overlay tracks', () => {
  expect(getVideoBlockRecipeDefinition(VideoBlockKind.KINETIC_CAPTIONS)).toEqual(
    expect.objectContaining({
      preview: expect.objectContaining({ variant: 'SUBTITLE' }),
      trackKind: 'SUBTITLE',
    })
  );
  expect(getVideoBlockRecipeDefinition(VideoBlockKind.FEATURE_SPOTLIGHT)).toEqual(
    expect.objectContaining({
      preview: expect.objectContaining({ variant: 'SPOTLIGHT' }),
      trackKind: 'OVERLAY',
    })
  );
});

it('uses the editorial lower-third starter for speaker intro recipes', () => {
  const project = createEmptyVideoProject('Speaker intro');
  project.tracks.push(createVideoProjectTrack('Annotations', 0, VideoTrackKind.OVERLAY));
  const clips = expandVideoBlockRecipe(
    VideoBlockKind.SPEAKER_INTRO,
    project.tracks[1]!.id,
    project,
    1
  );

  expect(clips).toEqual([
    expect.objectContaining({
      templateKind: 'LOWER_THIRD_EDITORIAL',
      trackId: project.tracks[1]!.id,
      type: VideoProjectClipType.ANNOTATION,
    }),
  ]);
});

it('expands every shipped block kind into valid clips', () => {
  const project = createEmptyVideoProject('All blocks');
  project.tracks.push(createVideoProjectTrack('Annotations', 0, VideoTrackKind.OVERLAY));
  const trackId = project.tracks[1]!.id;

  for (const blockKind of getVideoBlockRecipeSelectionOrder()) {
    const clips = expandVideoBlockRecipe(blockKind, trackId, project, 1);

    expect(clips.length).toBeGreaterThan(0);
    expect(clips.every((clip) => clip.startTime >= 1)).toBe(true);
    expect(clips.every((clip) => clip.duration > 0)).toBe(true);
    if (clips.length > 1) {
      expect(clips.every((clip) => clip.linkMode === VideoClipLinkMode.LINKED)).toBe(true);
      expect(new Set(clips.map((clip) => clip.groupId)).size).toBe(1);
    }
  }
});

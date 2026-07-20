import { expect, it } from 'vitest';
import { createAnnotationClip } from '../factories/overlay-clip';
import { createEmptyVideoProject } from '../factories/creation';
import * as timelinePresentation from './presentation';

it('treats annotation clips as visual overlays in the timeline seam', () => {
  const project = createEmptyVideoProject('Timeline');
  const annotationClip = createAnnotationClip(
    project.tracks[2]!.id,
    project.width,
    project.height,
    0
  );
  const audioClip = {
    ...annotationClip,
    assetId: 'asset-audio',
    id: 'audio-1',
    type: 'AUDIO',
  } as never;

  expect(timelinePresentation.getClipAudioGain).toBeTypeOf('function');
  expect(timelinePresentation.getClipCompositeAudioGain).toBeTypeOf('function');
  expect(timelinePresentation.getClipCompositeVisualOpacity).toBeTypeOf('function');
  expect(timelinePresentation.getClipFadeMultiplier).toBeTypeOf('function');
  expect(timelinePresentation.getClipTransitionMultiplier).toBeTypeOf('function');
  expect(timelinePresentation.getClipTransitionOverlapDurations).toBeTypeOf('function');
  expect(timelinePresentation.getClipVisualOpacity).toBeTypeOf('function');
  expect(timelinePresentation.isVisualClip(annotationClip)).toBe(true);
  expect(timelinePresentation.isAnnotationClip(annotationClip)).toBe(true);
  expect(timelinePresentation.isVisualClip(audioClip)).toBe(false);
});

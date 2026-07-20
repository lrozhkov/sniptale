import { expect } from 'vitest';
import type { VideoEditorProjectState } from './contracts';
import { VideoClipTransitionKind, VideoMediaFitMode } from '../../../features/video/project/types';

export function applyClipPropertyMutations(
  store: { getState: () => VideoEditorProjectState },
  videoClipId: string,
  annotationClipId: string,
  textClipId: string,
  shapeClipId: string
): void {
  store.getState().updateMediaClipFitMode(videoClipId, VideoMediaFitMode.COVER);
  store.getState().updateClipTransform(videoClipId, { x: 24 });
  store.getState().updateClipMuted(videoClipId, true);
  store.getState().updateClipVolume(videoClipId, 1.5);
  store.getState().updateClipAudioEnvelope(videoClipId, {
    volumeEnvelopeEnd: 0.4,
    volumeEnvelopeStart: 1.8,
  });
  store.getState().updateClipFades(videoClipId, { fadeInMs: 300 });
  store.getState().updateClipTransitions(videoClipId, {
    transitionIn: VideoClipTransitionKind.CROSSFADE,
  });
  store.getState().updateAnnotationClipContent(annotationClipId, { headline: 'Lower third' });
  store.getState().updateAnnotationClipStyle(annotationClipId, { accentColor: '#ffaa00' });
  store.getState().updateAnnotationClipTemplate(annotationClipId, {
    introAnimation: 'SHIMMER_ENTRY',
  });
  store.getState().updateTextClipContent(textClipId, 'Hello world');
  store.getState().updateTextClipStyle(textClipId, { fontSize: 32 });
  store.getState().updateShapeClipStyle(shapeClipId, { fillColor: '#ffffff' });
}

export function verifyClipPropertyMutationResults(
  project: NonNullable<VideoEditorProjectState['project']>,
  videoClipId: string,
  annotationClipId: string,
  textClipId: string,
  shapeClipId: string
): void {
  const videoClip = project.clips.find((clip) => clip.id === videoClipId);
  const annotationClip = project.clips.find((clip) => clip.id === annotationClipId);
  const textClip = project.clips.find((clip) => clip.id === textClipId);
  const shapeClip = project.clips.find((clip) => clip.id === shapeClipId);
  const linkedAudioClip = project.clips.find(
    (clip) => clip.id !== videoClipId && clip.groupId && clip.groupId === videoClip?.groupId
  );

  expectVideoMutation(videoClip);
  expectAnnotationMutation(annotationClip);
  expectTextMutation(textClip);
  expectShapeMutation(shapeClip);
  expect(linkedAudioClip).toBeTruthy();
  expect(videoClip?.volume).toBe(1);
  expect(project.updatedAt).toBe(500);
}

function expectVideoMutation(
  videoClip: NonNullable<VideoEditorProjectState['project']>['clips'][number] | undefined
) {
  expect(videoClip).toEqual(
    expect.objectContaining({
      audioGainEnd: 0.4,
      audioGainStart: 1.8,
      fadeInMs: 300,
      fitMode: VideoMediaFitMode.COVER,
      fitScalePercent: 100,
      muted: true,
      volume: 1,
      volumeEnvelopeEnd: 0.4,
      volumeEnvelopeStart: 1.8,
    })
  );
  expect(videoClip?.transform.x).toBe(24);
}

function expectAnnotationMutation(
  annotationClip: NonNullable<VideoEditorProjectState['project']>['clips'][number] | undefined
): void {
  expect(annotationClip).toEqual(
    expect.objectContaining({
      introAnimation: 'SHIMMER_ENTRY',
      type: 'ANNOTATION',
    })
  );
  if (!annotationClip || !('style' in annotationClip) || !('content' in annotationClip)) {
    throw new Error('Expected annotation clip mutation result');
  }
  expect(annotationClip.style.accentColor).toBe('#ffaa00');
  expect(annotationClip.content.headline).toBe('Lower third');
}

function expectTextMutation(
  textClip: NonNullable<VideoEditorProjectState['project']>['clips'][number] | undefined
): void {
  expect(textClip).toEqual(
    expect.objectContaining({
      text: 'Hello world',
    })
  );
  if (!textClip || textClip.type !== 'TEXT') {
    throw new Error('Expected text clip mutation result');
  }
  expect(textClip.style.fontSize).toBe(32);
}

function expectShapeMutation(
  shapeClip: NonNullable<VideoEditorProjectState['project']>['clips'][number] | undefined
): void {
  if (!shapeClip || shapeClip.type !== 'SHAPE') {
    throw new Error('Expected shape clip mutation result');
  }
  expect(shapeClip.style.fillColor).toBe('#ffffff');
}

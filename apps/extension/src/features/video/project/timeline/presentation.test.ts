import { describe, expect, it } from 'vitest';
import { createAnnotationClip } from '../factories/overlay-clip';
import { createEmptyVideoProject } from '../factories/creation';
import {
  createProject,
  createShapeClip,
  createTextClip,
  createTransform,
  createVideoClip,
} from './presentation.test-support.ts';
import {
  getClipAudioGain,
  getClipCompositeAudioGain,
  getClipCompositeVisualOpacity,
  getClipFadeMultiplier,
  getClipTransitionMultiplier,
  getClipTransitionOverlapDurations,
  getClipVisualOpacity,
  isAnnotationClip,
  isShapeClip,
  isSubtitleClip,
  isTextClip,
  isVisualClip,
} from './presentation';
import {
  VideoClipTransitionKind,
  type VideoProjectClip,
  VideoProjectClipType,
} from '../types/index';
import { syncProjectTransitions } from '../transition/project';

describe('video project timeline presentation', () => {
  it('narrows visual, text and shape clips', verifyClipKinds);
  it('resolves fade, visual opacity and muted audio gain', verifyFadeAndGain);
  it('applies clip-owned audio envelope values through the gain owner', verifyAudioEnvelopeGain);
  it(
    'resolves incoming and outgoing crossfade multipliers and overlap durations',
    verifyTransitionEdges
  );
  it('combines fade and transition multipliers for composite values', verifyCompositeValues);
  it(
    'keeps composite values stable when no transition segment is active',
    verifyStableCompositeValues
  );
});

function verifyClipKinds(): void {
  const videoClip = createVideoClip();
  const textClip = createTextClip();
  const annotationProject = createEmptyVideoProject('Timeline');
  const annotationClip = createAnnotationClip(
    annotationProject.tracks[2]!.id,
    annotationProject.width,
    annotationProject.height,
    0
  );
  const audioClip = {
    ...annotationClip,
    assetId: 'asset-audio',
    type: VideoProjectClipType.AUDIO,
  } as never;
  const shapeClip = createShapeClip();
  const subtitleClip = {
    ...createTextClip(),
    id: 'subtitle-1',
    type: VideoProjectClipType.SUBTITLE,
  } as VideoProjectClip;

  expect(isVisualClip(videoClip)).toBe(true);
  expect(isVisualClip(textClip)).toBe(true);
  expect(isVisualClip(annotationClip)).toBe(true);
  expect(isVisualClip(shapeClip)).toBe(true);
  expect(isVisualClip(subtitleClip)).toBe(true);
  expect(isVisualClip(audioClip)).toBe(false);
  expect(isAnnotationClip(annotationClip)).toBe(true);
  expect(isTextClip(textClip)).toBe(true);
  expect(isSubtitleClip(subtitleClip)).toBe(true);
  expect(isShapeClip(shapeClip)).toBe(true);
}

function verifyFadeAndGain(): void {
  const clip = createVideoClip();

  expect(getClipFadeMultiplier({ ...clip, duration: 0 }, 1)).toBe(1);
  expect(getClipFadeMultiplier(clip, 1.25)).toBeCloseTo(0.5);
  expect(getClipFadeMultiplier(clip, 4.75)).toBeCloseTo(0.5);
  expect(getClipVisualOpacity(clip, 1.25)).toBeCloseTo(0.4);
  expect(getClipAudioGain({ ...clip, muted: true }, 2)).toBe(0);
  expect(getClipAudioGain(clip, 1.25)).toBeCloseTo(0.45);
}

function verifyAudioEnvelopeGain(): void {
  const clip = createVideoClip({
    fadeInMs: 0,
    fadeOutMs: 0,
    volume: 1,
    volumeEnvelopeEnd: 0.5,
    volumeEnvelopeStart: 1.5,
  });

  expect(getClipAudioGain(clip, 1)).toBeCloseTo(1.5);
  expect(getClipAudioGain(clip, 3)).toBeCloseTo(1);
  expect(getClipAudioGain(clip, 5)).toBeCloseTo(0.5);
}

function verifyTransitionEdges(): void {
  const previousClip = createVideoClip({
    duration: 4,
    id: 'previous',
    startTime: 0,
    timelineLaneId: 'line-1',
    transitionOut: VideoClipTransitionKind.CROSSFADE,
  });
  const targetClip = createVideoClip({
    duration: 4,
    id: 'target',
    startTime: 3,
    timelineLaneId: 'line-1',
    transitionIn: VideoClipTransitionKind.CROSSFADE,
    transitionOut: VideoClipTransitionKind.CROSSFADE,
  });
  const nextClip = createVideoClip({
    duration: 3,
    id: 'next',
    startTime: 6,
    timelineLaneId: 'line-1',
    transitionIn: VideoClipTransitionKind.CROSSFADE,
  });
  const project = syncProjectTransitions(createProject([previousClip, targetClip, nextClip]));

  expect(getClipTransitionMultiplier(project, targetClip, 3.25)).toBeCloseTo(0.25);
  expect(getClipTransitionMultiplier(project, targetClip, 6.5)).toBeCloseTo(0.5);
  expect(getClipTransitionOverlapDurations(project, targetClip)).toEqual({
    incomingMs: 1000,
    outgoingMs: 1000,
  });
}

function verifyCompositeValues(): void {
  const previousClip = createVideoClip({
    duration: 4,
    id: 'previous',
    startTime: 0,
    timelineLaneId: 'line-1',
    transitionOut: VideoClipTransitionKind.CROSSFADE,
  });
  const targetClip = createVideoClip({
    duration: 4,
    id: 'target',
    startTime: 3,
    timelineLaneId: 'line-1',
    transitionIn: VideoClipTransitionKind.CROSSFADE,
    volume: 1.5,
  });
  const project = syncProjectTransitions(createProject([previousClip, targetClip]));

  expect(getClipCompositeVisualOpacity(project, targetClip, 3.25)).toBeCloseTo(0.1);
  expect(getClipCompositeAudioGain(project, targetClip, 3.25)).toBeCloseTo(0.1875);
}

function verifyStableCompositeValues(): void {
  const clip = createVideoClip({
    fadeInMs: 0,
    fadeOutMs: 0,
    transform: createTransform(0.5),
    volume: 1.2,
    volumeEnvelopeEnd: 0.5,
    volumeEnvelopeStart: 1.5,
  });
  const project = createProject([clip]);

  expect(getClipCompositeVisualOpacity(project, clip, 2)).toBeCloseTo(0.5);
  expect(getClipCompositeAudioGain(project, clip, 3)).toBeCloseTo(1.2);
}

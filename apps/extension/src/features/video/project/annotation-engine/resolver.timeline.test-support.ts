import {
  VideoAnnotationTimelineEasing,
  VideoAnnotationTimelineExtrapolate,
  VideoAnnotationTimelinePhase,
  type VideoAnnotationTemplate,
} from './types';

export function createSceneTimeline(): VideoAnnotationTemplate['timeline'] {
  return {
    durationMs: 3000,
    labels: [
      { id: 'dot', offsetMs: 100 },
      { id: 'path', offsetMs: 300 },
      { id: 'card', offsetMs: 700 },
    ],
    phases: [
      { durationMs: 1000, id: VideoAnnotationTimelinePhase.INTRO, startMs: 0 },
      { durationMs: 1000, id: VideoAnnotationTimelinePhase.IDLE, startMs: 1000 },
      { durationMs: 1000, id: VideoAnnotationTimelinePhase.OUTRO, startMs: 2000 },
    ],
    tracks: [...createIntroTracks(), createStaggerTrack(), createOutroTrack()],
  };
}

function createIntroTracks(): VideoAnnotationTemplate['timeline']['tracks'] {
  return [
    createDotOpacityTrack(),
    createLeaderDrawTrack(),
    createCardScaleTrack(),
    createCardMaskTrack(),
  ];
}

function createDotOpacityTrack(): VideoAnnotationTemplate['timeline']['tracks'][number] {
  return {
    id: 'dot-opacity',
    keyframes: [
      { offsetMs: 0, value: 0 },
      { easing: VideoAnnotationTimelineEasing.EASE_OUT, labelRef: 'dot', offsetMs: 0, value: 1 },
    ],
    property: 'opacity',
    targetNodeId: 'dot',
  };
}

function createLeaderDrawTrack(): VideoAnnotationTemplate['timeline']['tracks'][number] {
  return {
    id: 'leader-draw',
    keyframes: [
      { labelRef: 'path', offsetMs: 0, value: 0 },
      { easing: VideoAnnotationTimelineEasing.LINEAR, labelRef: 'path', offsetMs: 800, value: 1 },
    ],
    property: 'drawProgress',
    targetNodeId: 'leader',
  };
}

function createCardScaleTrack(): VideoAnnotationTemplate['timeline']['tracks'][number] {
  return {
    id: 'card-scale',
    keyframes: [
      { labelRef: 'card', offsetMs: 0, value: 0 },
      { easing: VideoAnnotationTimelineEasing.EASE_OUT, labelRef: 'card', offsetMs: 300, value: 1 },
    ],
    property: 'scale',
    targetNodeId: 'card',
  };
}

function createCardMaskTrack(): VideoAnnotationTemplate['timeline']['tracks'][number] {
  return {
    id: 'card-mask',
    keyframes: [
      { labelRef: 'card', offsetMs: 0, value: 0 },
      { labelRef: 'card', offsetMs: 300, value: 1 },
    ],
    property: 'maskProgress',
    targetNodeId: 'card',
  };
}

function createStaggerTrack(): VideoAnnotationTemplate['timeline']['tracks'][number] {
  return {
    id: 'headline-stagger',
    keyframes: [
      { offsetMs: 0, phase: VideoAnnotationTimelinePhase.INTRO, value: 0 },
      { easing: VideoAnnotationTimelineEasing.EASE_IN, offsetMs: 500, value: 1 },
    ],
    property: 'opacity',
    stagger: { index: 1, intervalMs: 100 },
    targetNodeId: 'headline',
  };
}

function createOutroTrack(): VideoAnnotationTemplate['timeline']['tracks'][number] {
  return {
    extrapolate: VideoAnnotationTimelineExtrapolate.CLAMP,
    id: 'root-outro',
    keyframes: [
      { offsetMs: 0, value: 1 },
      { offsetMs: 0, phase: VideoAnnotationTimelinePhase.OUTRO, value: 1 },
      { offsetMs: 800, phase: VideoAnnotationTimelinePhase.OUTRO, value: 0 },
    ],
    property: 'opacity',
    targetNodeId: 'root',
  };
}

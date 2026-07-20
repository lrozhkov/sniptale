import {
  normalizeVideoObjectTrack,
  type VideoObjectTrack,
  type VideoObjectTrackSample,
} from '../../../../features/video/project/object-tracks';
import { createCandidateFromAnchor, findManualAnchor as findAnchorAtTime } from './anchors';
import { detectCursorMotionCandidates } from './motion';
import { updateCursorPrototypeSize, type CursorPrototypeSize } from './prototype';
import { resolveFrameCandidates, selectCandidate } from './tracking-candidates';
import { cleanVisualCursorTrackSamples, summarizeVisualCursorTrackQuality } from './trajectory';
import type {
  VideoCursorDetectionAnchor,
  VideoCursorDetectionCandidate,
  VideoCursorDetectionFrame,
  VisualCursorTrackDetectionOptions,
} from './types';

const DETECTOR_VERSION = 'sniptale-visual-cursor-v3';
const DEFAULT_MIN_CONFIDENCE = 0.5;
const DEFAULT_SMOOTHING = 0.35;
const DEFAULT_ANCHOR_SEED_WINDOW_SECONDS = 1;
const STATIONARY_HOLD_FRAMES = 2;

interface PendingFrame {
  frame: VideoCursorDetectionFrame;
  previousMotion: VideoCursorDetectionCandidate[];
}

interface TrackerState {
  lockMotionBacked: boolean;
  missedFrames: number;
  previousFrame: VideoCursorDetectionFrame | null;
  previousSample: VideoObjectTrackSample | null;
  prototypeSize: CursorPrototypeSize | null;
  samples: VideoObjectTrackSample[];
  staticHistory: Map<string, number>;
}

export interface VisualCursorTrackBuilder {
  addFrame: (frame: VideoCursorDetectionFrame) => void;
  toTrack: () => VideoObjectTrack;
}

export function detectVisualCursorTrack(
  frames: readonly VideoCursorDetectionFrame[],
  options: VisualCursorTrackDetectionOptions = {}
): VideoObjectTrack {
  const sortedFrames = frames.toSorted((first, second) => first.time - second.time);
  const builder = createVisualCursorTrackBuilder(options);

  for (const frame of sortedFrames) {
    builder.addFrame(frame);
  }

  return builder.toTrack();
}

export function createVisualCursorTrackBuilder(
  options: VisualCursorTrackDetectionOptions = {}
): VisualCursorTrackBuilder {
  const state = createTrackerState();
  let pending: PendingFrame | null = null;

  return {
    addFrame: (frame) => {
      const nextMotion = state.previousFrame
        ? detectCursorMotionCandidates(state.previousFrame, frame)
        : [];
      if (pending) {
        processFrame(pending.frame, pending.previousMotion, nextMotion, state, options);
      }
      pending = { frame, previousMotion: nextMotion };
      state.previousFrame = frame;
    },
    toTrack: () => {
      if (pending) {
        processFrame(pending.frame, pending.previousMotion, [], state, options);
        pending = null;
      }
      const samples = cleanVisualCursorTrackSamples(state.samples);
      return normalizeVideoObjectTrack({
        analysis: {
          mode: 'coarseKeyframes',
          projectEndTime: samples.at(-1)?.time ?? 0,
          projectStartTime: samples[0]?.time ?? 0,
          quality: summarizeVisualCursorTrackQuality(samples),
          sampleFps: 1,
          sourceAssetId: 'unknown',
          sourceClipId: 'unknown',
        },
        detectorVersion: DETECTOR_VERSION,
        hidden: true,
        id: options.trackId ?? 'visualCursor',
        kind: 'visualCursor',
        role: 'cameraCursor',
        samples,
        source: 'visualDetection',
      });
    },
  };
}

function createTrackerState(): TrackerState {
  return {
    lockMotionBacked: false,
    missedFrames: 0,
    previousFrame: null,
    previousSample: null,
    prototypeSize: null,
    samples: [],
    staticHistory: new Map(),
  };
}

function processFrame(
  frame: VideoCursorDetectionFrame,
  previousMotion: VideoCursorDetectionCandidate[],
  nextMotion: VideoCursorDetectionCandidate[],
  state: TrackerState,
  options: VisualCursorTrackDetectionOptions
): void {
  const exactAnchor = findManualAnchor(frame.time, options);
  const sample = exactAnchor
    ? createTrackSample(frame, createCandidateFromAnchor(exactAnchor, frame.time), state, options)
    : createDetectedSample(frame, previousMotion, nextMotion, state, options);
  state.samples.push(sample);
  state.previousSample = sample;
}

function createDetectedSample(
  frame: VideoCursorDetectionFrame,
  previousMotion: VideoCursorDetectionCandidate[],
  nextMotion: VideoCursorDetectionCandidate[],
  state: TrackerState,
  options: VisualCursorTrackDetectionOptions
): VideoObjectTrackSample {
  const candidates = resolveFrameCandidates(
    frame,
    previousMotion,
    nextMotion,
    state,
    options.detection
  );
  const seedAnchor = findSeedAnchor(frame.time, options);
  const selected = selectCandidate(candidates, state, seedAnchor);
  if (!selected) {
    return createMissingOrHeldSample(frame, state);
  }
  return createTrackSample(frame, selected, state, options);
}

function createTrackSample(
  frame: VideoCursorDetectionFrame,
  candidate: VideoCursorDetectionCandidate,
  state: TrackerState,
  options: VisualCursorTrackDetectionOptions
): VideoObjectTrackSample {
  const minConfidence = options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  if (candidate.confidence < minConfidence) {
    return createMissingOrHeldSample(frame, state);
  }

  state.missedFrames = 0;
  state.lockMotionBacked = candidate.source === 'motion';
  if (candidate.motionScore > 0.25 || candidate.source === 'motion') {
    state.prototypeSize = updateCursorPrototypeSize(state.prototypeSize, candidate);
  }
  return smoothSample(
    {
      confidence: candidate.confidence,
      height: candidate.height,
      time: frame.time,
      visible: true,
      width: candidate.width,
      x: candidate.x,
      y: candidate.y,
    },
    state.previousSample,
    options.smoothing ?? DEFAULT_SMOOTHING
  );
}

function createMissingOrHeldSample(
  frame: VideoCursorDetectionFrame,
  state: TrackerState
): VideoObjectTrackSample {
  state.missedFrames += 1;
  if (
    state.lockMotionBacked &&
    state.previousSample?.visible &&
    state.missedFrames <= STATIONARY_HOLD_FRAMES
  ) {
    return { ...state.previousSample, confidence: 0.5, time: frame.time };
  }
  return createMissingSample(frame, state.previousSample);
}

function createMissingSample(
  frame: VideoCursorDetectionFrame,
  previousSample: VideoObjectTrackSample | null
): VideoObjectTrackSample {
  return {
    confidence: 0,
    time: frame.time,
    visible: false,
    x: previousSample?.x ?? frame.width / 2,
    y: previousSample?.y ?? frame.height / 2,
    ...(previousSample?.width === undefined ? {} : { width: previousSample.width }),
    ...(previousSample?.height === undefined ? {} : { height: previousSample.height }),
  };
}

function smoothSample(
  sample: VideoObjectTrackSample,
  previousSample: VideoObjectTrackSample | null,
  smoothing: number
): VideoObjectTrackSample {
  if (!previousSample?.visible) {
    return sample;
  }

  const previousWeight = Math.max(0, Math.min(0.95, smoothing));
  const currentWeight = 1 - previousWeight;
  return {
    ...sample,
    x: previousSample.x * previousWeight + sample.x * currentWeight,
    y: previousSample.y * previousWeight + sample.y * currentWeight,
  };
}

function findManualAnchor(
  time: number,
  options: VisualCursorTrackDetectionOptions
): VideoCursorDetectionAnchor | null {
  const tolerance = options.anchorTimeToleranceSeconds ?? 0.001;
  return findAnchorAtTime(time, options.manualAnchors, tolerance);
}

function findSeedAnchor(
  time: number,
  options: VisualCursorTrackDetectionOptions
): VideoCursorDetectionAnchor | null {
  const seedWindow = DEFAULT_ANCHOR_SEED_WINDOW_SECONDS;
  return findAnchorAtTime(time, options.manualAnchors, seedWindow);
}

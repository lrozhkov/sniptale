import type { RecordingEventCadence } from '../project/recording-events/types';
import type { RecordingKeyboardRhythmBlock } from '../project/types/interaction';
import type { RecordingTargetSemantics } from '../project/recording-target';

/** Audio templates consume bounded facts, never recorded wording or event-count guesses. */
export type ReviewActionSoundDescriptor =
  | { family: 'mouse' }
  | { family: 'keyboard'; keyCount: number }
  | { family: 'typing' };

export interface ReviewTelemetryMarker {
  timeDomain?: 'result';
  ref: { kind: 'action' | 'signal' | 'cursor'; id: string };
  eventType: string;
  target?: string;
  targetSemantics?: RecordingTargetSemantics;
  audio?: ReviewActionSoundDescriptor;
  privacy?: 'protected';
  observed?: boolean;
  keyboardHold?: boolean;
  mouseButton?: number;
  recordingCadence?: {
    onsets: readonly RecordingEventCadence[];
    repeats: readonly RecordingEventCadence[];
  };
  keyboardRhythm?: RecordingKeyboardRhythmBlock[];
  keyboardRepeats?: RecordingKeyboardRhythmBlock[];
  keyboardAttack?: { id: string; time: number };
  gesture?: {
    id: string;
    type: string;
    button: number;
    downTime: number;
    upTime?: number;
    observedEndTime?: number;
    completion: string;
    path?: { time: number; x: number; y: number; captureSegment?: number }[];
    gaps?: { start: number; end: number }[];
  };
  /** Verified normalized source position, never reconstructed from a final viewport. */
  focusPoint?: { x: number; y: number };
  start: number;
  end: number;
}

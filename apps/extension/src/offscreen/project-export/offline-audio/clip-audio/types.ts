import type { QuickEditAudioPlanEntry } from '../../../../features/video/review/advanced/audio-plan';
import type { AudioGainRange } from '../../../../features/video/audio/source-attenuation';
import type {
  VideoProjectAudioClip,
  VideoProjectVideoClip,
  VideoTransitionEasing,
} from '../../../../features/video/project/types/index';
import type { EffectRuntimeAudioPlan } from '../../../../features/video/composition/effect-runtime/audio/plan';

interface SourceVoiceoverAudioPlan extends Pick<
  VideoProjectAudioClip,
  | 'id'
  | 'assetId'
  | 'startTime'
  | 'duration'
  | 'sourceStart'
  | 'sourceDuration'
  | 'playbackRate'
  | 'volume'
  | 'muted'
  | 'fadeInMs'
  | 'fadeOutMs'
  | 'audioGainStart'
  | 'audioGainEnd'
  | 'volumeEnvelopeStart'
  | 'volumeEnvelopeEnd'
> {
  sourceKind: 'source-voiceover';
  playbackEntry: QuickEditAudioPlanEntry;
}

export type OfflineAudioRenderableClip = (
  | VideoProjectVideoClip
  | VideoProjectAudioClip
  | EffectRuntimeAudioPlan
  | SourceVoiceoverAudioPlan
) & {
  /** Authored result-time phase. The collector replaces imported properties. */
  audioFadePhase?: { offset: number; duration: number };
  /** Derived from a validated clip window when endpoint interpolation would lose a plateau. */
  audioGainPhase?: { offset: number; duration: number };
  originalAudioRanges?: AudioGainRange[];
  /** Export-local automation; never persisted in the project. */
  audioTransitions?: {
    start: number;
    end: number;
    easing: VideoTransitionEasing;
    incoming: boolean;
  }[];
};

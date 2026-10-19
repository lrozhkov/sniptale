import type { AudioGainRange } from '../../../../features/video/audio/source-attenuation';
import type {
  VideoProjectAudioClip,
  VideoProjectVideoClip,
  VideoTransitionEasing,
} from '../../../../features/video/project/types/index';
import type { EffectRuntimeAudioPlan } from '../../../../features/video/composition/effect-runtime/audio/plan';

export type OfflineAudioRenderableClip = (
  | VideoProjectVideoClip
  | VideoProjectAudioClip
  | EffectRuntimeAudioPlan
) & {
  /** Authored result-time phase. The collector replaces imported properties. */
  audioFadePhase?: { offset: number; duration: number };
  originalAudioRanges?: AudioGainRange[];
  /** Export-local automation; never persisted in the project. */
  audioTransitions?: {
    start: number;
    end: number;
    easing: VideoTransitionEasing;
    incoming: boolean;
  }[];
};

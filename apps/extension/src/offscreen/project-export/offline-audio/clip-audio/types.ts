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
  /** Export-local automation; never persisted in the project. */
  audioTransitions?: {
    start: number;
    end: number;
    easing: VideoTransitionEasing;
    incoming: boolean;
  }[];
};

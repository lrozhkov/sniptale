import type {
  VideoProjectAudioClip,
  VideoProjectVideoClip,
} from '../../../../features/video/project/types/index';
import type { EffectRuntimeAudioPlan } from '../../../../features/video/composition/effect-runtime/audio/plan';

export type OfflineAudioRenderableClip =
  | VideoProjectVideoClip
  | VideoProjectAudioClip
  | EffectRuntimeAudioPlan;

import type {
  FrameData,
  GlobalStepBadgeSettings,
  StepBadgeSettings,
} from '../../../../features/highlighter/contracts';
import type { FrameMutations, RecalculateStepBadges } from './types';

export interface FrameManagerPublicResultParams {
  addAutoBlurFrames: FrameMutations['addAutoBlurFrames'];
  addFrame: FrameMutations['addFrame'];
  clearAutoBlurFrames: FrameMutations['clearAutoBlurFrames'];
  clearFrames: FrameMutations['clearFrames'];
  frames: FrameData[];
  hasFrameForElement: (element: HTMLElement) => boolean;
  getGlobalStepBadgeSettings: () => GlobalStepBadgeSettings;
  updateFrameStepBadge: (frameId: string, settings: Partial<StepBadgeSettings>) => void;
  updateGlobalStepBadgeSettings: (settings: Partial<GlobalStepBadgeSettings>) => void;
  recalculateStepBadges: RecalculateStepBadges;
  removeFrame: FrameMutations['removeFrame'];
  syncFocusOpacity: FrameMutations['syncFocusOpacity'];
  syncAutoBlurFrames: FrameMutations['syncAutoBlurFrames'];
  updateFrame: FrameMutations['updateFrame'];
  updateFrameEffect: FrameMutations['updateFrameEffect'];
}

import type { Root } from 'react-dom/client';
import type {
  BlurSettings,
  EffectMode,
  FocusSettings,
  FrameData,
  HighlighterSettings,
} from '../../../../features/highlighter/contracts';
import type { StepBadgeSettings } from '@sniptale/runtime-contracts/highlighter/step-badge';
import type { FrameMutations } from '../contracts';
import { buildFrameMutationActions } from './dom';

interface UseFrameMutationActionsOptions {
  setFrames: React.Dispatch<React.SetStateAction<FrameData[]>>;
  framesRef: React.MutableRefObject<FrameData[]>;
  linkedElementsRef: React.MutableRefObject<Map<string, HTMLElement>>;
  containerRef: React.MutableRefObject<HTMLDivElement | null>;
  rootsRef: React.MutableRefObject<Map<string, Root>>;
  isClearingRef: React.MutableRefObject<boolean>;
  globalEffectModeRef: React.MutableRefObject<EffectMode>;
  globalStepBadgeAutoModeRef: React.MutableRefObject<boolean>;
  sessionBlurSettingsRef: React.MutableRefObject<BlurSettings>;
  sessionFocusSettingsRef: React.MutableRefObject<FocusSettings>;
  sessionStepBadgeTemplateRef: React.MutableRefObject<StepBadgeSettings | null>;
  highlighterSettingsCacheRef: React.MutableRefObject<HighlighterSettings | null>;
  recalculateStepBadgesRef: React.MutableRefObject<(excludeFrameId?: string) => void>;
}

export function useFrameMutationActions(options: UseFrameMutationActionsOptions): FrameMutations {
  return buildFrameMutationActions(options);
}

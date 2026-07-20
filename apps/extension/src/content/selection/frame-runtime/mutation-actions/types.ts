import type { Root } from 'react-dom/client';
import type {
  BlurSettings,
  EffectMode,
  FocusSettings,
  FrameData,
  HighlighterSettings,
  StepBadgeSettings,
} from '../../../../features/highlighter/contracts';

type FrameSetter = React.Dispatch<React.SetStateAction<FrameData[]>>;

export type MutableRef<T> = React.MutableRefObject<T>;

export type UseFrameMutationActionHelperOptions = {
  setFrames: FrameSetter;
  framesRef: MutableRef<FrameData[]>;
  linkedElementsRef: MutableRef<Map<string, HTMLElement>>;
  containerRef: MutableRef<HTMLDivElement | null>;
  rootsRef: MutableRef<Map<string, Root>>;
  isClearingRef: MutableRef<boolean>;
  globalEffectModeRef: MutableRef<EffectMode>;
  globalStepBadgeAutoModeRef: MutableRef<boolean>;
  sessionBlurSettingsRef: MutableRef<BlurSettings>;
  sessionFocusSettingsRef: MutableRef<FocusSettings>;
  sessionStepBadgeTemplateRef: MutableRef<StepBadgeSettings | null>;
  highlighterSettingsCacheRef: MutableRef<HighlighterSettings | null>;
  recalculateStepBadgesRef: MutableRef<(excludeFrameId?: string) => void>;
};

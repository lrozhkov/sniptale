import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type {
  AutoBlurCategory,
  AutoBlurSettings,
} from '../../../../features/highlighter/contracts/auto-blur';
import type { BlurSettings } from '../../../../features/highlighter/contracts';
import type { TranslationKey } from '../../../../platform/i18n';
import type { AutoBlurMatch } from '../../../selection/auto-blur-runtime';
import type { useContentAppBindings } from '../../app/bindings';

export type FrameManager = ReturnType<typeof useContentAppBindings>;
export type AutoBlurStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

export interface AutoBlurMutableState {
  autoApplyEnabled: boolean;
  blurSettings: BlurSettings;
  errorMessage: TranslationKey | null;
  isApplying: boolean;
  isOpen: boolean;
  matches: AutoBlurMatch[];
  refs: {
    loadedSettingsRef: MutableRefObject<AutoBlurSettings>;
    scanVersionRef: MutableRefObject<number>;
  };
  selectedCategories: Set<AutoBlurCategory>;
  selectedMatchIds: Set<string>;
  setBlurSettings: Dispatch<SetStateAction<BlurSettings>>;
  setAutoApplyEnabled: Dispatch<SetStateAction<boolean>>;
  setErrorMessage: Dispatch<SetStateAction<TranslationKey | null>>;
  setIsApplying: Dispatch<SetStateAction<boolean>>;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
  setMatches: Dispatch<SetStateAction<AutoBlurMatch[]>>;
  setSelectedCategories: Dispatch<SetStateAction<Set<AutoBlurCategory>>>;
  setSelectedMatchIds: Dispatch<SetStateAction<Set<string>>>;
  setStatus: Dispatch<SetStateAction<AutoBlurStatus>>;
  status: AutoBlurStatus;
}

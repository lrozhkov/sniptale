import { useMemo, useRef, useState } from 'react';
import type {
  AutoBlurCategory,
  AutoBlurSettings,
} from '../../../../features/highlighter/contracts/auto-blur';
import type { BlurSettings } from '../../../../features/highlighter/contracts';
import { DEFAULT_AUTO_BLUR_SETTINGS } from '../persistence';
import type { TranslationKey } from '../../../../platform/i18n';
import type { AutoBlurMatch } from '../../../selection/auto-blur-runtime';
import type { AutoBlurMutableState, AutoBlurStatus } from './types';

export function cloneSettings(settings: AutoBlurSettings): AutoBlurSettings {
  return {
    autoApplyEnabled: settings.autoApplyEnabled,
    selectedCategories: [...settings.selectedCategories],
    blurSettings: { ...settings.blurSettings },
  };
}

export function useAutoBlurMutableState(): AutoBlurMutableState {
  const [autoApplyEnabled, setAutoApplyEnabled] = useState(
    DEFAULT_AUTO_BLUR_SETTINGS.autoApplyEnabled
  );
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<AutoBlurStatus>('idle');
  const [matches, setMatches] = useState<AutoBlurMatch[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<Set<AutoBlurCategory>>(new Set());
  const [selectedMatchIds, setSelectedMatchIds] = useState<Set<string>>(new Set());
  const [blurSettings, setBlurSettings] = useState<BlurSettings>(
    DEFAULT_AUTO_BLUR_SETTINGS.blurSettings
  );
  const [isApplying, setIsApplying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<TranslationKey | null>(null);
  const loadedSettingsRef = useRef(cloneSettings(DEFAULT_AUTO_BLUR_SETTINGS));
  const scanVersionRef = useRef(0);
  const refs = useMemo(
    () => ({
      loadedSettingsRef,
      scanVersionRef,
    }),
    [loadedSettingsRef, scanVersionRef]
  );

  return {
    autoApplyEnabled,
    blurSettings,
    errorMessage,
    isApplying,
    isOpen,
    matches,
    refs,
    selectedCategories,
    selectedMatchIds,
    setBlurSettings,
    setAutoApplyEnabled,
    setErrorMessage,
    setIsApplying,
    setIsOpen,
    setMatches,
    setSelectedCategories,
    setSelectedMatchIds,
    setStatus,
    status,
  };
}

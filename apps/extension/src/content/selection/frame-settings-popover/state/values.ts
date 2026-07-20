import { useState } from 'react';
import type {
  BlurSettings,
  FocusSettings,
  HighlighterSettings,
} from '../../../../features/highlighter/contracts';
import {
  createDefaultHighlighterSettings,
  DEFAULT_BLUR_SETTINGS,
  DEFAULT_BORDER_PRESET,
} from '../../../../features/highlighter/style/defaults';
import { getDefaultFocusSettings } from './helpers';

export function useFrameSettingsPopoverValues() {
  const [globalSettings, setGlobalSettings] = useState<HighlighterSettings>(() =>
    createDefaultHighlighterSettings()
  );
  const [selectedPresetId, setSelectedPresetId] = useState<string>(DEFAULT_BORDER_PRESET.id);
  const [localBlurSettings, setLocalBlurSettings] = useState<BlurSettings>({
    ...DEFAULT_BLUR_SETTINGS,
  });
  const [localFocusSettings, setLocalFocusSettings] = useState<FocusSettings>({
    ...getDefaultFocusSettings(),
  });

  return {
    globalSettings,
    localBlurSettings,
    localFocusSettings,
    selectedPresetId,
    setGlobalSettings,
    setLocalBlurSettings,
    setLocalFocusSettings,
    setSelectedPresetId,
  };
}

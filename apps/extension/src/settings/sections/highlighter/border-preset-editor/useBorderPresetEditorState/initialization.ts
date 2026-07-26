import { useEffect } from 'react';

import type { BorderPreset } from '../../../../../features/highlighter/contracts';
import { applyBorderPresetDraftState, resetBorderPresetDraftState } from '../state/helpers';
import type { BorderPresetDraftSetters } from './types';
import { useAppLocale } from '../../../../../platform/i18n';

export function useBorderPresetInitialization({
  isOpen,
  preset,
  setters,
}: {
  isOpen: boolean;
  preset?: BorderPreset;
  setters: BorderPresetDraftSetters;
}) {
  const locale = useAppLocale();
  useEffect(() => {
    if (preset) {
      applyBorderPresetDraftState(preset, setters, locale);
      return;
    }

    resetBorderPresetDraftState(setters);
  }, [isOpen, locale, preset, setters]);
}

import { useEffect } from 'react';

import type { BorderPreset } from '../../../../../features/highlighter/contracts';
import { applyBorderPresetDraftState, resetBorderPresetDraftState } from '../state/helpers';
import type { BorderPresetDraftSetters } from './types';

export function useBorderPresetInitialization({
  isOpen,
  preset,
  setters,
}: {
  isOpen: boolean;
  preset?: BorderPreset;
  setters: BorderPresetDraftSetters;
}) {
  useEffect(() => {
    if (preset) {
      applyBorderPresetDraftState(preset, setters);
      return;
    }

    resetBorderPresetDraftState(setters);
  }, [isOpen, preset, setters]);
}

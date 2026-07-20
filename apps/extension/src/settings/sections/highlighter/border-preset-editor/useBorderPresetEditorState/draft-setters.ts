import { useMemo } from 'react';

import { pickBorderPresetDraftSetters } from '../state/helpers';
import type { BorderPresetDraftSetters, BorderPresetDraftState } from './types';

export function useBorderPresetDraftSetters(
  draft: BorderPresetDraftState
): BorderPresetDraftSetters {
  return useMemo(
    () =>
      pickBorderPresetDraftSetters({
        setColor: draft.setColor,
        setCustomCss: draft.setCustomCss,
        setFillColor: draft.setFillColor,
        setFillOpacity: draft.setFillOpacity,
        setInheritCustomCss: draft.setInheritCustomCss,
        setIsResizing: draft.setIsResizing,
        setName: draft.setName,
        setOpacity: draft.setOpacity,
        setPadding: draft.setPadding,
        setRadius: draft.setRadius,
        setShadow: draft.setShadow,
        setStyle: draft.setStyle,
        setTextareaHeight: draft.setTextareaHeight,
        setStrokeOpacity: draft.setStrokeOpacity,
        setWidth: draft.setWidth,
      }),
    [
      draft.setColor,
      draft.setCustomCss,
      draft.setFillColor,
      draft.setFillOpacity,
      draft.setInheritCustomCss,
      draft.setIsResizing,
      draft.setName,
      draft.setOpacity,
      draft.setPadding,
      draft.setRadius,
      draft.setShadow,
      draft.setStyle,
      draft.setTextareaHeight,
      draft.setStrokeOpacity,
      draft.setWidth,
    ]
  );
}

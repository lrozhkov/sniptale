import { useCallback } from 'react';

import type { BorderPreset } from '../../../../../features/highlighter/contracts';
import type { BorderPresetEditorProps, BorderPresetDraftState } from './types';
import type { getBorderPresetCssValidation } from './validation';

export function useBorderPresetSaveHandler({
  cssValidation,
  draft,
  onSave,
  preset,
}: {
  cssValidation: ReturnType<typeof getBorderPresetCssValidation>;
  draft: BorderPresetDraftState;
  onSave: BorderPresetEditorProps['onSave'];
  preset?: BorderPreset;
}) {
  return useCallback(() => {
    if (!draft.name.trim() || cssValidation.cssError || cssValidation.hasBlockedProps) {
      return;
    }

    const nextPreset: BorderPreset = {
      id: preset?.id || crypto.randomUUID(),
      name: draft.name.trim(),
      order: preset?.order ?? 0,
      width: draft.width,
      color: draft.color,
      style: draft.style,
      radius: draft.radius,
      padding: draft.padding,
      shadow: draft.shadow,
      opacity: draft.opacity,
      strokeOpacity: draft.strokeOpacity,
      fillColor: draft.fillColor,
      fillOpacity: draft.fillOpacity,
      inheritCustomCss: draft.inheritCustomCss,
      customCss: draft.customCss,
    };

    onSave(
      preset?.isSystemDefault === undefined
        ? nextPreset
        : { ...nextPreset, isSystemDefault: preset.isSystemDefault }
    );
  }, [cssValidation, draft, onSave, preset]);
}

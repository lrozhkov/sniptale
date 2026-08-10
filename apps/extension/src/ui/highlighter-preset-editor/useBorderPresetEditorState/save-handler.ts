import { useCallback } from 'react';

import type { BorderPreset } from '../../../features/highlighter/contracts';
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
      fillPaint: draft.fillPaint,
      effects: draft.effects,
      inheritCustomCss: draft.inheritCustomCss,
      customCss: draft.customCss,
      tagIds: preset?.tagIds ?? [],
      ...(preset
        ? {
            ...(preset.origin === undefined ? {} : { origin: preset.origin }),
            ...(preset.systemPresetKey === undefined
              ? {}
              : { systemPresetKey: preset.systemPresetKey }),
            ...(preset.basedOnRevision === undefined
              ? {}
              : { basedOnRevision: preset.basedOnRevision }),
            ...(preset.customized === undefined ? {} : { customized: preset.customized }),
            ...(preset.enabled === undefined ? {} : { enabled: preset.enabled }),
          }
        : { origin: 'user' as const, enabled: true }),
    };

    onSave(nextPreset);
  }, [cssValidation, draft, onSave, preset]);
}

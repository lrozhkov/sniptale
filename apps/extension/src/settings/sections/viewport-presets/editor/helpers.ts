import type { Dispatch, SetStateAction } from 'react';
import { translate } from '../../../../platform/i18n';
import type { ViewportPreset } from '../../../../contracts/settings';

export function clampViewportDimension(value: string, max: number) {
  return Math.min(max, Math.max(1, Number.parseInt(value, 10) || 1));
}

export function resolveViewportPresetEditorTitle(preset?: ViewportPreset) {
  return preset
    ? translate('viewportPresets.editor.editTitle')
    : translate('viewportPresets.editor.newTitle');
}

export function resolveViewportPresetSubmitLabel(props: {
  isSaving: boolean;
  preset?: ViewportPreset;
}) {
  if (props.isSaving) {
    return translate('viewportPresets.editor.saving');
  }

  return props.preset
    ? translate('common.actions.save')
    : translate('viewportPresets.editor.create');
}

export function syncViewportPresetForm(
  preset: ViewportPreset | undefined,
  setLabel: Dispatch<SetStateAction<string>>,
  setWidth: Dispatch<SetStateAction<number>>,
  setHeight: Dispatch<SetStateAction<number>>
) {
  if (preset) {
    setLabel(preset.label);
    setWidth(preset.width);
    setHeight(preset.height);
    return;
  }

  setLabel('');
  setWidth(1920);
  setHeight(1080);
}

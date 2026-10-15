import { translate } from '../../../../platform/i18n';
import type { SettingsCollectionAction, SettingsCollectionItem } from '../../../section-surface';
type PresetFlags = {
  enabled: boolean;
  origin: 'user' | 'system';
  isDefault: boolean;
  customized: boolean;
};
/** Resource-specific previews remain local; preset action admission has one owner. */
export function projectPresetCollectionFlags(
  preset: PresetFlags
): Pick<
  SettingsCollectionItem,
  'enabled' | 'isBuiltIn' | 'isDefault' | 'badges' | 'capabilities' | 'disabledActions'
> {
  return {
    enabled: preset.enabled,
    isBuiltIn: preset.origin === 'system',
    isDefault: preset.isDefault,
    ...(preset.customized
      ? {
          badges: [
            {
              id: 'customized',
              label: translate('settings.editor.customizedBadge'),
              tone: 'warning' as const,
            },
          ],
        }
      : {}),
    capabilities: {
      delete: preset.origin === 'user',
      edit: true,
      reorder: true,
      reset: preset.origin === 'system' && preset.customized,
      setDefault: !preset.isDefault,
      toggle: true,
    },
    disabledActions: {
      ...(preset.isDefault ? { toggle: translate('settings.editor.defaultCannotDisable') } : {}),
      ...(preset.isDefault && preset.origin === 'user'
        ? { delete: translate('settings.editor.defaultCannotDelete') }
        : {}),
      ...(!preset.enabled
        ? { 'set-default': translate('settings.editor.disabledCannotBeDefault') }
        : {}),
    },
  };
}
export function dispatchPresetCollectionAction<T extends { id: string }>(
  presets: readonly T[],
  action: SettingsCollectionAction,
  edit: (preset: T) => void,
  actions: {
    onToggleEnabled(id: string): unknown;
    onSetDefault(id: string): unknown;
    onResetPreset(id: string): unknown;
    onDelete(id: string): unknown;
  }
): void {
  const preset = presets.find((item) => item.id === action.itemId);
  if (!preset) return;
  if (action.type === 'edit') edit(preset);
  if (action.type === 'toggle') void actions.onToggleEnabled(preset.id);
  if (action.type === 'set-default') void actions.onSetDefault(preset.id);
  if (action.type === 'reset') void actions.onResetPreset(preset.id);
  if (action.type === 'delete') void actions.onDelete(preset.id);
}

import { translate, useAppLocale } from '../../../../../platform/i18n';
import { getStepBadgePresetDisplayName } from '../../../../../features/highlighter/step-badge-presets/display-name';
import { StepBadgePresetPreview } from '../../../../../ui/highlighter-preset-editor/step-badge/thumbnail';
import {
  SettingsCollection,
  type SettingsCollectionAction,
  type SettingsCollectionItem,
  type SettingsCollectionMoveIntent,
} from '../../../../section-surface';
import type { StepBadgePresetCatalogController } from './types';

export function StepBadgePresetsPanel({
  controller,
}: {
  controller: StepBadgePresetCatalogController;
}) {
  const locale = useAppLocale();
  const presets = controller.catalog?.presets ?? [];
  const enabledCount = presets.filter((preset) => preset.enabled !== false).length;
  const items: readonly SettingsCollectionItem[] = presets.map((preset) => ({
    id: preset.id,
    title: getStepBadgePresetDisplayName(preset, locale),
    meta:
      preset.settings.style.sizeSource === 'frame-border'
        ? translate('content.stepBadge.sizeFromFrame')
        : `${preset.settings.style.diameter} px`,
    preview: <StepBadgePresetPreview settings={preset.settings} />,
    enabled: preset.enabled !== false,
    isDefault: controller.catalog?.defaultPresetId === preset.id,
    busy: controller.isSaving,
    badges:
      preset.origin === 'system'
        ? [
            {
              id: 'system',
              label: translate('highlighter.stepBadgePresets.systemBadge'),
              tone: 'neutral',
            },
          ]
        : [],
    capabilities: {
      edit: true,
      toggle: true,
      setDefault: controller.catalog?.defaultPresetId !== preset.id,
      reset: preset.origin === 'system' && preset.customized === true,
      delete: preset.origin !== 'system',
      reorder: true,
    },
    disabledActions: {
      ...(preset.enabled !== false && enabledCount <= 1
        ? { toggle: translate('highlighter.stepBadgePresets.lastEnabled') }
        : {}),
      ...(preset.enabled === false
        ? { 'set-default': translate('highlighter.stepBadgePresets.makeDefault') }
        : {}),
    },
  }));
  const byId = new Map(presets.map((preset) => [preset.id, preset]));
  const onAction = (action: SettingsCollectionAction) => {
    const preset = byId.get(action.itemId);
    if (!preset) return;
    if (action.type === 'toggle') void controller.actions.toggle(preset.id);
    if (action.type === 'set-default') void controller.actions.setDefault(preset.id);
    if (action.type === 'edit') controller.actions.edit(preset);
    if (action.type === 'reset') void controller.actions.reset(preset.id);
    if (action.type === 'delete') void controller.actions.delete(preset);
  };
  return (
    <SettingsCollection
      ariaLabel={translate('highlighter.stepBadgePresets.title')}
      title={translate('highlighter.stepBadgePresets.title')}
      description={translate('highlighter.stepBadgePresets.description')}
      items={items}
      state={controller.isLoading ? 'loading' : controller.error ? 'error' : 'ready'}
      errorState={translate('highlighter.stepBadgePresets.messages.loadError')}
      addAction={{
        label: translate('highlighter.stepBadgePresets.add'),
        disabled: controller.isSaving,
        onInvoke: controller.actions.add,
      }}
      onAction={onAction}
      onMove={(intent: SettingsCollectionMoveIntent) =>
        void controller.actions.moveBefore(intent.itemId, intent.beforeItemId)
      }
    />
  );
}

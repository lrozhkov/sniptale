import { useAppLocale, translate } from '../../../../../platform/i18n';
import { getCalloutPresetDisplayName } from '../../../../../features/highlighter/callout-presets/display-name';
import { CalloutPresetPreview } from '../../../../../ui/highlighter-preset-editor/callout/thumbnail';
import {
  SettingsCollection,
  type SettingsCollectionAction,
  type SettingsCollectionItem,
  type SettingsCollectionMoveIntent,
} from '../../../../section-surface';
import type { CalloutPresetCatalogController } from './types';

type Preset = NonNullable<CalloutPresetCatalogController['catalog']>['presets'][number];

function getConnectorLabel(kind: Preset['style']['connector']['kind']): string {
  if (kind === 'wedge') return translate('highlighter.calloutPresets.connector.wedge');
  if (kind === 'line') return translate('highlighter.calloutPresets.connector.line');
  return translate('highlighter.calloutPresets.connector.none');
}

export function CalloutPresetsPanel({
  controller,
}: {
  controller: CalloutPresetCatalogController;
}) {
  const locale = useAppLocale();
  const presets = controller.catalog?.presets ?? [];
  const enabledCount = presets.filter((preset) => preset.enabled !== false).length;
  const items: readonly SettingsCollectionItem[] = presets.map((preset) => {
    const isLastEnabled = preset.enabled !== false && enabledCount <= 1;
    return {
      id: preset.id,
      title: getCalloutPresetDisplayName(preset, locale),
      meta: getConnectorLabel(preset.style.connector.kind),
      preview: <CalloutPresetPreview placement={preset.placement} style={preset.style} />,
      enabled: preset.enabled !== false,
      isDefault: controller.catalog?.defaultPresetId === preset.id,
      busy: controller.isSaving,
      badges:
        preset.origin === 'system'
          ? [
              {
                id: 'system',
                label: translate('highlighter.calloutPresets.systemBadge'),
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
        ...(isLastEnabled ? { toggle: translate('highlighter.calloutPresets.lastEnabled') } : {}),
        ...(preset.enabled === false
          ? { 'set-default': translate('highlighter.calloutPresets.makeDefault') }
          : {}),
      },
    };
  });
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
      ariaLabel={translate('highlighter.calloutPresets.title')}
      title={translate('highlighter.calloutPresets.title')}
      description={translate('highlighter.calloutPresets.description')}
      items={items}
      state={controller.isLoading ? 'loading' : controller.error ? 'error' : 'ready'}
      errorState={translate('highlighter.calloutPresets.messages.loadError')}
      addAction={{
        label: translate('highlighter.calloutPresets.add'),
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

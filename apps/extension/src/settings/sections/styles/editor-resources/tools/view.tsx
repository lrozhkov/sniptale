import { renderEditorPresetPreview } from '../../../../../features/editor/presets/preview';
import { getEditorPresetDisplayName } from '../../../../../features/editor/presets/display';
import { translate } from '../../../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import {
  SettingsCollection,
  settingsPanelClassName,
  type SettingsCollectionAction,
  type SettingsCollectionItem,
  type SettingsCollectionMoveIntent,
} from '../../../../section-surface';
import { useToolPresetsController } from './controller';
import { getToolPresetOwnerLabel, TOOL_PRESET_OWNERS } from './families';

export function ToolPresetsSettings() {
  const state = useToolPresetsController();
  const { actions, collection, selection } = state;
  const items: readonly SettingsCollectionItem[] = collection.presets.map((preset) => ({
    id: preset.id,
    title: getEditorPresetDisplayName(preset),
    preview: renderEditorPresetPreview(selection.owner, preset),
    enabled: preset.enabled,
    isDefault: preset.id === collection.defaultPresetId,
    isBuiltIn: preset.isSystemDefault === true,
    capabilities: {
      toggle: true,
      setDefault: preset.id !== collection.defaultPresetId,
      delete: !preset.isSystemDefault,
      reorder: true,
    },
    disabledActions: {
      ...(preset.isSystemDefault
        ? { toggle: translate('settings.collection.actions.disable') }
        : {}),
      ...(preset.id === collection.defaultPresetId || !preset.enabled
        ? { 'set-default': translate('editor.compact.workspaceMakeDefault') }
        : {}),
    },
  }));
  const byId = new Map(collection.presets.map((preset) => [preset.id, preset]));
  const onAction = (action: SettingsCollectionAction) => {
    const preset = byId.get(action.itemId);
    if (!preset) return;
    if (action.type === 'toggle') void actions.togglePreset(preset.id, action.nextChecked);
    if (action.type === 'set-default') void actions.makeDefault(preset.id);
    if (action.type === 'delete') void actions.deletePreset(preset.id);
  };
  const onMove = (intent: SettingsCollectionMoveIntent) => {
    void actions.movePreset(intent.itemId, intent.beforeItemId);
  };

  return (
    <section className={`${settingsPanelClassName} space-y-4`}>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {TOOL_PRESET_OWNERS.map((owner) => (
          <ProductActionButton
            key={owner}
            compact
            tone="toggle"
            active={selection.owner === owner}
            onClick={() => selection.setOwner(owner)}
          >
            {getToolPresetOwnerLabel(owner)}
          </ProductActionButton>
        ))}
      </div>
      <SettingsCollection
        ariaLabel={translate('settings.editor.toolPresetsTitle')}
        title={translate('settings.editor.toolPresetsTitle')}
        items={items}
        onAction={onAction}
        onMove={onMove}
      />
      <p className="text-xs text-[var(--sniptale-color-text-dim)]">
        {translate('settings.editor.createInEditorHint')}
      </p>
    </section>
  );
}

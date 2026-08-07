import { Check, Trash2 } from 'lucide-react';
import { renderEditorPresetPreview } from '../../../../../features/editor/presets/preview';
import { getEditorPresetDisplayName } from '../../../../../features/editor/presets/display';
import { translate } from '../../../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import {
  settingsDangerIconButtonClassName,
  settingsInfoIconButtonClassName,
  settingsListRowClassName,
  settingsNeutralBadgeClassName,
  settingsSuccessBadgeClassName,
  SettingsDragHandle,
  SettingsSwitch,
} from '../../../../section-surface/panel-controls';
import { settingsPanelClassName } from '../../../../section-surface';
import { getSettingsCountLabel } from '../../../../section-surface/text.helpers';
import { useToolPresetsController } from './controller';
import { getToolPresetOwnerLabel, TOOL_PRESET_OWNERS } from './families';

export function ToolPresetsSettings() {
  const state = useToolPresetsController();
  const { actions, collection, drag, selection } = state;
  return (
    <section className={`${settingsPanelClassName} space-y-4`}>
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold">{translate('settings.editor.toolPresetsTitle')}</h2>
        <span className="text-xs text-[var(--sniptale-color-text-dim)]">
          {collection.presets.length}{' '}
          {getSettingsCountLabel(collection.presets.length, {
            one: 'settings.editor.presetCountOne',
            few: 'settings.editor.presetCountFew',
            many: 'settings.editor.presetCountMany',
          })}
        </span>
      </div>
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
      <div className="space-y-2">
        {collection.presets.map((preset) => {
          const isDefault = preset.id === collection.defaultPresetId;
          const system = preset.isSystemDefault === true;
          return (
            <div
              key={preset.id}
              draggable
              onDragStart={() => drag.setDraggedId(preset.id)}
              onDragOver={(event) => {
                event.preventDefault();
                if (drag.draggedId !== preset.id) drag.setDragOverId(preset.id);
              }}
              onDragEnd={drag.clearDrag}
              onDrop={(event) => {
                event.preventDefault();
                void actions.dropPreset(preset.id);
              }}
              className={[
                settingsListRowClassName,
                drag.dragOverId === preset.id ? 'border-[var(--sniptale-color-border-strong)]' : '',
                preset.enabled ? '' : 'opacity-60',
              ].join(' ')}
            >
              <SettingsDragHandle />
              <span className="flex h-8 w-10 items-center justify-center rounded-lg border">
                {renderEditorPresetPreview(selection.owner, preset)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {getEditorPresetDisplayName(preset)}
                </div>
                <div className="mt-1 flex gap-2">
                  {isDefault ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${settingsSuccessBadgeClassName}`}
                    >
                      {translate('highlighter.section.defaultBadge')}
                    </span>
                  ) : null}
                  {system ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${settingsNeutralBadgeClassName}`}
                    >
                      {translate('highlighter.section.systemBadge')}
                    </span>
                  ) : null}
                </div>
              </div>
              <SettingsSwitch
                checked={preset.enabled}
                size="sm"
                disabled={system}
                onClick={() => void actions.togglePreset(preset.id, !preset.enabled)}
              />
              <button
                type="button"
                className={settingsInfoIconButtonClassName}
                disabled={isDefault || !preset.enabled}
                title={translate('editor.compact.workspaceMakeDefault')}
                onClick={() => void actions.makeDefault(preset.id)}
              >
                <Check size={14} />
              </button>
              {!system ? (
                <button
                  type="button"
                  className={settingsDangerIconButtonClassName}
                  title={translate('common.actions.delete')}
                  onClick={() => void actions.deletePreset(preset.id)}
                >
                  <Trash2 size={14} />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-[var(--sniptale-color-text-dim)]">
        {translate('settings.editor.createInEditorHint')}
      </p>
    </section>
  );
}

import { translate, useAppLocale } from '../../../../../platform/i18n';
import { getBorderPresetDisplayName } from '../../../../../features/highlighter/presets/display-name';
import {
  SettingsCollection,
  type SettingsCollectionAction,
  type SettingsCollectionItem,
  type SettingsCollectionMoveIntent,
} from '../../../../section-surface';
import { getHighlighterPresetCountLabel, getHighlighterPresetPreviewStyle } from './helpers';
import type { HighlighterPresetsProps } from './types';

export function HighlighterPresetsPanel({ presets, settings }: HighlighterPresetsProps) {
  const locale = useAppLocale();
  const enabledCount = settings.borderPresets.filter((preset) => preset.enabled !== false).length;
  const items: readonly SettingsCollectionItem[] = settings.borderPresets.map((preset) => {
    const styleLabel = translate(
      preset.style === 'solid'
        ? 'highlighter.editor.styleSolid'
        : preset.style === 'dashed'
          ? 'highlighter.editor.styleDashed'
          : 'highlighter.editor.styleDotted'
    );
    return {
      id: preset.id,
      title: getBorderPresetDisplayName(preset, locale),
      meta: [
        `${preset.width}${translate('highlighter.section.unitPxSuffix')}, ${styleLabel}, `,
        `${preset.radius}${translate('highlighter.section.unitPxSuffix')} `,
        translate('highlighter.section.radiusSuffix'),
      ].join(''),
      preview: <span className="h-full w-full" style={getHighlighterPresetPreviewStyle(preset)} />,
      enabled: preset.enabled !== false,
      isDefault: settings.defaultBorderPresetId === preset.id,
      badges:
        preset.origin === 'system'
          ? [{ id: 'system', label: translate('highlighter.section.systemBadge'), tone: 'neutral' }]
          : [],
      capabilities: {
        edit: true,
        toggle: true,
        setDefault: settings.defaultBorderPresetId !== preset.id,
        reset: preset.origin === 'system' && preset.customized === true,
        delete: preset.origin !== 'system',
        reorder: true,
      },
      disabledActions: {
        ...(preset.enabled !== false && enabledCount <= 1
          ? { toggle: translate('highlighter.section.lastEnabledPresetDisabled') }
          : {}),
        ...(preset.enabled === false
          ? { 'set-default': translate('highlighter.section.makeDefaultTitle') }
          : {}),
      },
    };
  });
  const byId = new Map(settings.borderPresets.map((preset) => [preset.id, preset]));
  const onAction = (action: SettingsCollectionAction) => {
    const preset = byId.get(action.itemId);
    if (!preset) return;
    if (action.type === 'toggle') void presets.handleTogglePresetEnabled(preset.id);
    if (action.type === 'set-default') void presets.handleSetDefaultPreset(preset.id);
    if (action.type === 'edit') presets.handleEditPreset(preset);
    if (action.type === 'reset') void presets.handleResetPreset(preset.id);
    if (action.type === 'delete') void presets.handleDeletePreset(preset);
  };
  return (
    <div className="mb-8">
      <SettingsCollection
        ariaLabel={translate('highlighter.section.presetsLabel')}
        title={translate('highlighter.section.presetsLabel')}
        items={items}
        countLabel={`${items.length} ${getHighlighterPresetCountLabel(items.length)}`}
        addAction={{
          label: translate('highlighter.section.addButton'),
          onInvoke: presets.handleAddPreset,
        }}
        onAction={onAction}
        onMove={(intent: SettingsCollectionMoveIntent) =>
          void presets.handleMoveBefore(intent.itemId, intent.beforeItemId)
        }
      />
    </div>
  );
}

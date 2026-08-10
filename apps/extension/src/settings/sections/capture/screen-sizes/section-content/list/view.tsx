import { translate, useAppLocale } from '../../../../../../platform/i18n';
import type { ViewportPreset } from '../../../../../../contracts/settings';
import { getViewportPresetDisplayName } from '../../../../../../features/viewport-presets/display-name';
import { formatViewportPresetDimensions } from '../../../../../../features/viewport-presets/format';
import {
  SettingsCollection,
  type SettingsCollectionAction,
  type SettingsCollectionGroup,
  type SettingsCollectionItem,
  type SettingsCollectionMoveIntent,
} from '../../../../../section-surface';
import { PresetsListEmptyState } from './empty-state';

type PresetsListProps = {
  isBusy: boolean;
  isLoading: boolean;
  onDelete: (preset: ViewportPreset) => void;
  onEdit: (preset: ViewportPreset) => void;
  onMoveBefore: (presetId: string, beforePresetId: string | null) => Promise<void>;
  onReset: (preset: ViewportPreset) => Promise<void>;
  onToggle: (preset: ViewportPreset) => Promise<void>;
  onAdd: () => void;
  viewportPresets: ViewportPreset[];
};

function createCollectionItems(
  props: PresetsListProps,
  locale: ReturnType<typeof useAppLocale>
): readonly SettingsCollectionItem[] {
  return props.viewportPresets.map((preset) => ({
    id: preset.id,
    title: getViewportPresetDisplayName(preset, locale),
    meta: (
      <>
        {formatViewportPresetDimensions(preset.width, preset.height, locale)}
        {preset.enabled ? null : ` · ${translate('viewportPresets.messages.presetDisabled')}`}
      </>
    ),
    enabled: preset.enabled,
    busy: props.isBusy,
    isBuiltIn: preset.kind === 'system',
    capabilities: {
      edit: true,
      toggle: true,
      reset: preset.kind === 'system' && preset.customized,
      delete: preset.kind === 'user',
      reorder: true,
    },
  }));
}

function createGroups(presets: readonly ViewportPreset[]): readonly SettingsCollectionGroup[] {
  return (['viewport', 'window'] as const).flatMap((target) => {
    const itemIds = presets.filter((preset) => preset.target === target).map((preset) => preset.id);
    return itemIds.length === 0
      ? []
      : [
          {
            id: target,
            label: translate(`viewportPresets.groups.${target}`),
            description: translate(`viewportPresets.hints.${target}`),
            itemIds,
          },
        ];
  });
}

export function PresetsList(props: PresetsListProps) {
  const locale = useAppLocale();
  const presetById = new Map(props.viewportPresets.map((preset) => [preset.id, preset]));
  const onAction = (action: SettingsCollectionAction) => {
    const preset = presetById.get(action.itemId);
    if (!preset) return;
    if (action.type === 'edit') props.onEdit(preset);
    if (action.type === 'toggle') void props.onToggle(preset);
    if (action.type === 'reset') void props.onReset(preset);
    if (action.type === 'delete') props.onDelete(preset);
  };
  const onMove = (intent: SettingsCollectionMoveIntent) => {
    void props.onMoveBefore(intent.itemId, intent.beforeItemId);
  };

  return (
    <div className="mb-6">
      <SettingsCollection
        ariaLabel={translate('viewportPresets.section.savedLabel')}
        items={createCollectionItems(props, locale)}
        groups={createGroups(props.viewportPresets)}
        addAction={{
          label: translate('viewportPresets.section.addButton'),
          disabled: props.isLoading || props.isBusy,
          onInvoke: props.onAdd,
        }}
        state={props.isLoading ? 'loading' : 'ready'}
        emptyState={<PresetsListEmptyState />}
        onAction={onAction}
        onMove={onMove}
      />
    </div>
  );
}

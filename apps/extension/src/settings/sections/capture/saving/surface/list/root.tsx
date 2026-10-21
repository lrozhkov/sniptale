import { translate } from '../../../../../../platform/i18n';
import {
  SettingsCollection,
  type SettingsCollectionAction,
  type SettingsCollectionItem,
  type SettingsCollectionMoveIntent,
} from '../../../../../section-surface';
import { PresetsListOverlays } from '../overlays';
import { PresetsListEmptyState } from './empty-state';
import type { SavePresetsListProps } from '../../state/types';

export function PresetsList(props: SavePresetsListProps) {
  const items: readonly SettingsCollectionItem[] = props.presets.map((preset) => ({
    id: preset.id,
    title: preset.name,
    meta: [
      translate('savePresets.editor.downloadsPrefix'),
      preset.path || '…',
      translate('savePresets.editor.downloadsSuffix'),
    ].join(''),
    enabled: preset.enabled,
    badges: [
      ...(preset.id === props.defaultImagePresetId
        ? [
            {
              id: 'image',
              label: translate('savePresets.section.imageDefault'),
              tone: 'neutral' as const,
            },
          ]
        : []),
      ...(preset.id === props.defaultVideoPresetId
        ? [
            {
              id: 'video',
              label: translate('savePresets.section.videoDefault'),
              tone: 'neutral' as const,
            },
          ]
        : []),
      ...(preset.id === props.defaultExportPresetId
        ? [
            {
              id: 'export',
              label: translate('savePresets.section.exportDefault'),
              tone: 'neutral' as const,
            },
          ]
        : []),
    ],
    capabilities: { edit: true, toggle: true, delete: true, reorder: true },
  }));
  const byId = new Map(props.presets.map((preset) => [preset.id, preset]));
  const onAction = (action: SettingsCollectionAction) => {
    const preset = byId.get(action.itemId);
    if (!preset) return;
    if (action.type === 'edit') props.onEdit(preset);
    if (action.type === 'toggle') void props.onToggleEnabled(preset);
    if (action.type === 'delete') props.onDelete(preset);
  };
  return (
    <>
      <div className="mb-4 space-y-4">
        <SettingsCollection
          ariaLabel={translate('savePresets.section.folderPresetsLabel')}
          state={props.isLoading ? 'loading' : 'ready'}
          items={items}
          emptyState={<PresetsListEmptyState />}
          addAction={{
            label: translate('savePresets.section.addButton'),
            disabled: props.isLoading ?? false,
            onInvoke: () => props.onEdit(),
          }}
          onAction={onAction}
          onMove={(intent: SettingsCollectionMoveIntent) =>
            void props.onMoveBefore(intent.itemId, intent.beforeItemId)
          }
        />
      </div>
      <PresetsListOverlays
        confirmDelete={props.confirmDelete}
        confirmDeletePreset={props.confirmDeletePreset}
        isEditorOpen={props.isEditorOpen}
        onCloseDeleteDialog={props.onCloseDeleteDialog}
        onCloseEditor={props.onCloseEditor}
        onSavePreset={props.onSavePreset}
        {...(props.editingPreset === undefined ? {} : { editingPreset: props.editingPreset })}
      />
    </>
  );
}

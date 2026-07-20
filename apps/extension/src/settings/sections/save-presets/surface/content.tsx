import { Plus } from 'lucide-react';

import { translate } from '../../../../platform/i18n';
import type { CaptureActionType } from '../../../../contracts/settings';
import { settingsSectionClassName } from '../../../section-surface';
import {
  addButtonClassName,
  CaptureActionCard,
  DefaultPresetsCard,
  GalleryToggleCard,
  PresetsList,
  SavePresetsHeader,
} from './views';
import type { SavePresetsListProps, SavePresetsRowHandlers } from '../state/types';

type SavePresetsSectionContentProps = {
  captureAction: CaptureActionType;
  captureActionOptions: { value: CaptureActionType; label: string }[];
  closeDeleteDialog: () => void;
  closeEditor: () => void;
  defaultExportPresetId: string | null;
  defaultImagePresetId: string | null;
  defaultVideoPresetId: string | null;
  handleCaptureActionChange: (value: CaptureActionType) => Promise<void>;
  handleDefaultExportChange: (value: string) => Promise<void>;
  handleDefaultImageChange: (value: string) => Promise<void>;
  handleDefaultVideoChange: (value: string) => Promise<void>;
  handleDeletePreset: SavePresetsRowHandlers['onDelete'];
  handleSavePreset: SavePresetsListProps['onSavePreset'];
  handleTogglePresetEnabled: SavePresetsRowHandlers['onToggleEnabled'];
  handleToggleSaveToGallery: () => Promise<void>;
  isLoading: boolean;
  openEditor: SavePresetsRowHandlers['onEdit'];
  presetOptions: { value: string; label: string }[];
  saveCapturesToGallery: boolean;
  setHoveredPresetId: SavePresetsRowHandlers['onHoverChange'];
} & Pick<
  SavePresetsListProps,
  | 'confirmDelete'
  | 'confirmDeletePreset'
  | 'draggedId'
  | 'dragOverId'
  | 'editingPreset'
  | 'hoveredPresetId'
  | 'isEditorOpen'
  | 'onDragEnd'
  | 'onDragLeave'
  | 'onDragOver'
  | 'onDragStart'
  | 'onDrop'
  | 'presetCountLabel'
  | 'presets'
>;

function buildPresetsListProps(props: SavePresetsSectionContentProps): SavePresetsListProps {
  return {
    confirmDelete: props.confirmDelete,
    confirmDeletePreset: props.confirmDeletePreset,
    draggedId: props.draggedId,
    dragOverId: props.dragOverId,
    hoveredPresetId: props.hoveredPresetId,
    isEditorOpen: props.isEditorOpen,
    onCloseDeleteDialog: props.closeDeleteDialog,
    onCloseEditor: props.closeEditor,
    onDelete: props.handleDeletePreset,
    onDragEnd: props.onDragEnd,
    onDragLeave: props.onDragLeave,
    onDragOver: props.onDragOver,
    onDragStart: props.onDragStart,
    onDrop: props.onDrop,
    onEdit: props.openEditor,
    onHoverChange: props.setHoveredPresetId,
    onSavePreset: props.handleSavePreset,
    onToggleEnabled: props.handleTogglePresetEnabled,
    presetCountLabel: props.presetCountLabel,
    presets: props.presets,
    ...(props.editingPreset === undefined ? {} : { editingPreset: props.editingPreset }),
  };
}

function AddPresetButton(props: { onAdd: () => void }) {
  return (
    <button type="button" onClick={props.onAdd} className={addButtonClassName}>
      <Plus size={16} />
      {translate('savePresets.section.addButton')}
    </button>
  );
}

function SavePresetsSectionBody(props: SavePresetsSectionContentProps) {
  const listProps = buildPresetsListProps(props);

  return (
    <>
      <CaptureActionCard
        captureAction={props.captureAction}
        captureActionOptions={props.captureActionOptions}
        isLoading={props.isLoading}
        onChange={props.handleCaptureActionChange}
      />
      <GalleryToggleCard
        enabled={props.saveCapturesToGallery}
        onToggle={props.handleToggleSaveToGallery}
      />
      <DefaultPresetsCard
        defaultExportPresetId={props.defaultExportPresetId}
        defaultImagePresetId={props.defaultImagePresetId}
        defaultVideoPresetId={props.defaultVideoPresetId}
        isLoading={props.isLoading}
        onDefaultExportChange={props.handleDefaultExportChange}
        onDefaultImageChange={props.handleDefaultImageChange}
        onDefaultVideoChange={props.handleDefaultVideoChange}
        presetOptions={props.presetOptions}
      />
      <PresetsList {...listProps} />
    </>
  );
}

export function SavePresetsSectionContent(props: SavePresetsSectionContentProps) {
  return (
    <div className={settingsSectionClassName}>
      <SavePresetsHeader />
      <SavePresetsSectionBody {...props} />
      <AddPresetButton onAdd={() => props.openEditor()} />
    </div>
  );
}

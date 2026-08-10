import type { CaptureActionType } from '../../../../../contracts/settings';
import {
  settingsCompactWorkbenchClassName,
  settingsSectionClassName,
} from '../../../../section-surface';
import type { SavePresetsListProps, SavePresetsRowHandlers } from '../state/types';
import { SaveSettingsRows } from './cards';
import { PresetsList } from './list/root';

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
  isLoading: boolean;
  openEditor: SavePresetsRowHandlers['onEdit'];
  presetOptions: { value: string; label: string }[];
  view: 'settings' | 'templates';
} & Pick<
  SavePresetsListProps,
  | 'confirmDelete'
  | 'confirmDeletePreset'
  | 'editingPreset'
  | 'isEditorOpen'
  | 'onMoveBefore'
  | 'presets'
>;

function buildPresetsListProps(props: SavePresetsSectionContentProps): SavePresetsListProps {
  return {
    confirmDelete: props.confirmDelete,
    confirmDeletePreset: props.confirmDeletePreset,
    isEditorOpen: props.isEditorOpen,
    onCloseDeleteDialog: props.closeDeleteDialog,
    onCloseEditor: props.closeEditor,
    onDelete: props.handleDeletePreset,
    onMoveBefore: props.onMoveBefore,
    onEdit: props.openEditor,
    onSavePreset: props.handleSavePreset,
    onToggleEnabled: props.handleTogglePresetEnabled,
    presets: props.presets,
    ...(props.editingPreset === undefined ? {} : { editingPreset: props.editingPreset }),
  };
}

export function SavePresetsSectionContent(props: SavePresetsSectionContentProps) {
  if (props.view === 'templates') {
    return (
      <div className={settingsSectionClassName}>
        <PresetsList {...buildPresetsListProps(props)} />
      </div>
    );
  }

  return (
    <div className={`${settingsSectionClassName} ${settingsCompactWorkbenchClassName} !space-y-0`}>
      <SaveSettingsRows
        captureAction={props.captureAction}
        captureActionOptions={props.captureActionOptions}
        defaultExportPresetId={props.defaultExportPresetId}
        defaultImagePresetId={props.defaultImagePresetId}
        defaultVideoPresetId={props.defaultVideoPresetId}
        isLoading={props.isLoading}
        onCaptureActionChange={props.handleCaptureActionChange}
        onDefaultExportChange={props.handleDefaultExportChange}
        onDefaultImageChange={props.handleDefaultImageChange}
        onDefaultVideoChange={props.handleDefaultVideoChange}
        presetOptions={props.presetOptions}
      />
    </div>
  );
}

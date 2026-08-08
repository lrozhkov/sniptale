import { settingsDividerClassName, settingsSectionClassName } from '../../../../section-surface';
import { PresetsHeader } from './header';
import { DefaultViewportField } from './default-viewport';
import { PresetsList } from './list/view';
import { PresetsDialogs } from './dialogs';
import type { PresetsSectionContentProps } from './types';

export function PresetsSectionContent(props: PresetsSectionContentProps) {
  return (
    <div className={settingsSectionClassName}>
      <PresetsHeader />
      <DefaultViewportField
        defaultViewportPresetId={props.defaultField.selectedPresetId}
        isLoading={props.model.isLoading}
        onChange={props.defaultField.onChange}
        viewportPresets={props.model.presets}
      />

      <div className={`mb-6 ${settingsDividerClassName}`} />

      <PresetsList
        defaultPresetId={props.defaultField.selectedPresetId}
        isLoading={props.model.isLoading}
        onDelete={props.list.onDelete}
        onEdit={props.list.onEdit}
        onMoveBefore={props.list.onMoveBefore}
        onReset={props.list.onReset}
        onToggle={props.list.onToggle}
        onSetDefault={props.list.onSetDefault}
        onAdd={props.editor.onAdd}
        presetsCountLabel={props.list.countLabel}
        viewportPresets={props.model.presets}
      />

      <PresetsDialogs
        closeViewportDeleteDialog={props.deletion.close}
        closeViewportEditor={props.editor.close}
        confirmDeleteViewport={props.deletion.confirm}
        deleteMessage={props.deletion.message}
        handleSaveViewportPreset={props.editor.onSave}
        isLoading={props.model.isLoading}
        isViewportEditorOpen={props.editor.isOpen}
        viewportConfirmOpen={props.deletion.isOpen}
        {...(props.editor.editingPreset === undefined
          ? {}
          : { editingViewport: props.editor.editingPreset })}
      />
    </div>
  );
}

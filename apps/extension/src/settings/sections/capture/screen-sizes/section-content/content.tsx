import { settingsSectionClassName } from '../../../../section-surface';
import { PresetsList } from './list/view';
import { PresetsDialogs } from './dialogs';
import type { PresetsSectionContentProps } from './types';

export function PresetsSectionContent(props: PresetsSectionContentProps) {
  return (
    <div className={settingsSectionClassName}>
      <PresetsList
        isBusy={props.model.isMutating}
        isLoading={props.model.isLoading}
        onDelete={props.list.onDelete}
        onEdit={props.list.onEdit}
        onMoveBefore={props.list.onMoveBefore}
        onReset={props.list.onReset}
        onToggle={props.list.onToggle}
        onAdd={props.editor.onAdd}
        viewportPresets={props.model.presets}
      />

      <PresetsDialogs
        closeViewportDeleteDialog={props.deletion.close}
        closeViewportEditor={props.editor.close}
        confirmDeleteViewport={props.deletion.confirm}
        deleteMessage={props.deletion.message}
        handleSaveViewportPreset={props.editor.onSave}
        isLoading={props.model.isLoading || props.model.isMutating}
        isViewportEditorOpen={props.editor.isOpen}
        viewportConfirmOpen={props.deletion.isOpen}
        {...(props.editor.editingPreset === undefined
          ? {}
          : { editingViewport: props.editor.editingPreset })}
      />
    </div>
  );
}

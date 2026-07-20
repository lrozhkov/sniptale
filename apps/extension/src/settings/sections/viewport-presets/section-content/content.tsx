import { settingsDividerClassName, settingsSectionClassName } from '../../../section-surface';
import { PresetsHeader } from './header';
import { DefaultViewportField } from './default-viewport';
import { PresetsList } from './list/view';
import { AddViewportPresetButton } from './add-button';
import { PresetsDialogs } from './dialogs';
import type { PresetsSectionContentProps } from './types';

export function PresetsSectionContent(props: PresetsSectionContentProps) {
  return (
    <div className={settingsSectionClassName}>
      <PresetsHeader />
      <DefaultViewportField
        defaultViewportId={props.defaultViewportId}
        isLoading={props.isLoading}
        onChange={props.handleDefaultViewportChange}
        viewportPresets={props.viewportPresets}
      />

      <div className={`mb-6 ${settingsDividerClassName}`} />

      <PresetsList
        hoveredViewportId={props.hoveredViewportId}
        onDelete={props.handleDeleteViewportPreset}
        onEdit={props.handleEditViewportPreset}
        onHoverChange={props.setHoveredViewportId}
        presetsCountLabel={props.presetsCountLabel}
        viewportPresets={props.viewportPresets}
      />

      <AddViewportPresetButton onClick={props.handleAddViewportPreset} />

      <PresetsDialogs
        closeViewportDeleteDialog={props.closeViewportDeleteDialog}
        closeViewportEditor={props.closeViewportEditor}
        confirmDeleteViewport={props.confirmDeleteViewport}
        deleteMessage={props.deleteMessage}
        handleSaveViewportPreset={props.handleSaveViewportPreset}
        isLoading={props.isLoading}
        isViewportEditorOpen={props.isViewportEditorOpen}
        viewportConfirmOpen={props.viewportConfirmOpen}
        {...(props.editingViewport === undefined ? {} : { editingViewport: props.editingViewport })}
      />
    </div>
  );
}

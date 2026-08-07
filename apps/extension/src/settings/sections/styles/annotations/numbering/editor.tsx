import { StepBadgePresetEditor as SharedStepBadgePresetEditor } from '../../../../../ui/highlighter-preset-editor/step-badge';
import type { StepBadgePresetCatalogController } from './types';

export function StepBadgePresetEditor({
  controller,
}: {
  controller: StepBadgePresetCatalogController;
}) {
  const preset =
    controller.editor.preset ??
    controller.catalog?.presets.find((item) => item.id === controller.catalog?.defaultPresetId);
  if (!preset) return null;
  return (
    <SharedStepBadgePresetEditor
      isNew={!controller.editor.preset}
      isOpen={controller.editor.isOpen}
      isSaving={controller.isSaving}
      onClose={controller.actions.closeEditor}
      onSave={controller.actions.save}
      preset={preset}
    />
  );
}

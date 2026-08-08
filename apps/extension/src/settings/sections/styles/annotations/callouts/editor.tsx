import { CalloutPresetEditor as SharedCalloutPresetEditor } from '../../../../../ui/highlighter-preset-editor/callout';
import type { CalloutPreset } from '@sniptale/runtime-contracts/highlighter/callout';
import type { CalloutPresetCatalogController } from './types';

export function CalloutPresetEditor({
  controller,
}: {
  controller: CalloutPresetCatalogController;
}) {
  const sourcePreset =
    controller.editor.preset ??
    controller.catalog?.presets.find((preset) => preset.id === controller.catalog?.defaultPresetId);
  if (!sourcePreset) return null;
  const source: CalloutPreset = controller.editor.preset
    ? sourcePreset
    : { ...sourcePreset, id: '', name: '', origin: 'user' };
  return (
    <SharedCalloutPresetEditor
      isOpen={controller.editor.isOpen}
      isNew={!controller.editor.preset}
      isSaving={controller.isSaving}
      preset={source}
      onClose={controller.actions.closeEditor}
      {...(source.origin === 'system' && source.customized === true
        ? {
            onReset: async () => {
              await controller.actions.reset(source.id);
              controller.actions.closeEditor();
            },
          }
        : {})}
      onSave={controller.actions.save}
    />
  );
}

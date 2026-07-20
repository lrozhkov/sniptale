import type { SavePreset } from '../../../contracts/settings';
import { saveEditorRenderedImage } from '../../document/file-actions';
import type { ImageEditorController } from '../../controller';
import { maybeHandleEditorSaveFailure } from './save-failure';
import { EditorInspectorDocumentPresetOptions } from '../document-actions/presets';
import type { EditorInspectorConfirmDialogState } from '../content/types';
import type { SaveEditorRenderedImageOptions } from '../../document/file-actions/save';

interface SidebarSaveUtilityArgs {
  controller: Pick<ImageEditorController, 'exportDocument' | 'renderToDataUrl'>;
  confirmOpenStorageManager: (dialog: EditorInspectorConfirmDialogState) => Promise<boolean>;
  defaultImagePresetId: string | null;
  hasImage: boolean;
  savePresets: SavePreset[];
}

export function buildSidebarSaveActions(args: SidebarSaveUtilityArgs) {
  async function runSaveAction(
    options?: Parameters<typeof saveEditorRenderedImage>[1]
  ): Promise<void> {
    if (!args.hasImage) {
      return;
    }

    try {
      await saveEditorRenderedImage(args.controller, options);
    } catch (error) {
      await maybeHandleEditorSaveFailure({
        confirmOpenStorageManager: args.confirmOpenStorageManager,
        error,
      });
      throw error;
    }
  }

  const saveToPreset = (
    presetId: string,
    options?: Parameters<typeof saveEditorRenderedImage>[1]
  ) =>
    runSaveAction({
      ...options,
      presetId,
    });

  return {
    renderSavePresetOptions: () => (
      <EditorInspectorDocumentPresetOptions
        defaultImagePresetId={args.defaultImagePresetId}
        savePresets={args.savePresets}
        onSaveToPreset={saveToPreset}
      />
    ),
    saveToPreset,
    onSaveImage: (options?: SaveEditorRenderedImageOptions) => runSaveAction(options),
    onSaveImageAs: (options?: SaveEditorRenderedImageOptions) =>
      runSaveAction({ ...options, actionType: 'ask_system' }),
  };
}

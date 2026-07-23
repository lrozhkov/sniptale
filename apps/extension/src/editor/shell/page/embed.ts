import {
  createScenarioEditorEmbedCloseMessage,
  type EditorEmbedMode,
} from '../../../features/editor/contracts/embed';
import type { ImageEditorController } from '../../controller';
import { saveEditorRenderedImage } from '../../document/file-actions';

export function createEditorPageEmbedProviderValue(
  embedMode: EditorEmbedMode | null,
  controller: ImageEditorController
) {
  if (embedMode !== 'scenario') {
    return {
      mode: null,
      onApply: null,
      onClose: null,
    };
  }

  return {
    mode: embedMode,
    onApply: async () => saveEditorRenderedImage(controller),
    onClose: () =>
      window.parent.postMessage(createScenarioEditorEmbedCloseMessage(), window.location.origin),
  };
}

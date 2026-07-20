import { SESSION_EXPORT_FILENAME } from '@sniptale/ui/branding';
import type { EditorDocument } from '../../../features/editor/document/types';
import {
  createRuntimeMessagingTransport,
  type RuntimeMessagingTransport,
} from '../../../platform/runtime-messaging';
import { loadEditorExportSettings } from '../../persistence/export-settings';
import { loadSettings } from '../../../composition/persistence/settings';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { generateFilename } from '@sniptale/foundation/utils/filename';
import {
  assertEditorSessionFileCanBeRead,
  parseImportedEditorDocument,
} from '../../document/file-actions/import-session';
import type { ImageEditorController } from '../../controller';
import { assertEditorRasterImageFileCanBeRead } from '../../document/file-actions/raster-intake';
import { readFileAsDataUrl, readFileAsText } from '../sidebar-shared';

type EditorActionRailController = Pick<
  ImageEditorController,
  'exportDocument' | 'insertImage' | 'loadDocument' | 'openImage' | 'renderToDataUrl'
>;

type EditorInspectorActionClient = Pick<RuntimeMessagingTransport, 'sendRuntimeMessage'>;

function createEditorInspectorActionClient(
  transport: RuntimeMessagingTransport = createRuntimeMessagingTransport()
): EditorInspectorActionClient {
  return {
    sendRuntimeMessage: transport.sendRuntimeMessage,
  };
}

function triggerSessionExport(document: EditorDocument) {
  const blob = new Blob([JSON.stringify(document, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement('a');
  link.href = url;
  link.download = SESSION_EXPORT_FILENAME;
  link.click();
  URL.revokeObjectURL(url);
}

async function saveRenderedEditorImage(
  controller: EditorActionRailController,
  client: EditorInspectorActionClient
) {
  const [settings, exportSettings] = await Promise.all([
    loadSettings(),
    loadEditorExportSettings(),
  ]);
  const dataUrl = controller.renderToDataUrl({
    format: exportSettings.imageFormat,
    quality: exportSettings.imageQuality,
  });
  const filename = generateFilename('edited', exportSettings.imageFormat);

  await client.sendRuntimeMessage({
    type: MessageType.EXECUTE_SAVE,
    dataUrl,
    filename,
    actionType: 'download_default',
    ...(settings.defaultImagePresetId === null ? {} : { presetId: settings.defaultImagePresetId }),
  });
}

export function createEditorActionRailHandlers(
  controller: EditorActionRailController,
  setImageData: (dataUrl: string) => void,
  client: EditorInspectorActionClient = createEditorInspectorActionClient()
) {
  return {
    async openImage(file: File | undefined) {
      if (!file) {
        return;
      }

      assertEditorRasterImageFileCanBeRead(file);
      const dataUrl = await readFileAsDataUrl(file);
      await controller.openImage(dataUrl, file.name);
      setImageData(dataUrl);
    },

    async insertImage(file: File | undefined) {
      if (!file) {
        return;
      }

      assertEditorRasterImageFileCanBeRead(file);
      const dataUrl = await readFileAsDataUrl(file);
      await controller.insertImage(dataUrl, file.name);
    },

    async importSession(file: File | undefined) {
      if (!file) {
        return;
      }

      assertEditorSessionFileCanBeRead(file);
      const text = await readFileAsText(file);
      const document = parseImportedEditorDocument(text);
      await controller.loadDocument(document);
      setImageData(document.sourceImageData);
    },

    exportSession() {
      triggerSessionExport(controller.exportDocument());
    },

    async saveRenderedImage() {
      await saveRenderedEditorImage(controller, client);
    },
  };
}

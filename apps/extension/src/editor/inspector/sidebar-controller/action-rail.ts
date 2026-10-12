import { createOutputFilename } from '../../../workflows/file-naming/index';
import { createScreenshotFilename as generateFilename } from '../../../workflows/file-naming/index';
import type { EditorDocument } from '../../../features/editor/document/types';
import {
  createRuntimeMessagingTransport,
  type RuntimeMessagingTransport,
} from '../../../platform/runtime-messaging';
import { loadEditorExportSettings } from '../../persistence/export-settings';
import { loadSettings } from '../../../composition/persistence/settings';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { openEditorImageFromFile, importEditorSessionFromFile } from '../../document/file-actions';
import { readFileAsDataUrl } from '../../document/file-actions/file-reader';
import type { ImageEditorController } from '../../controller';
import { assertEditorRasterImageFileCanBeRead } from '../../document/file-actions/raster-intake';
import type { EditorDocumentOpenPort } from '../../document/file-actions/ports';

type EditorActionRailController = Pick<
  ImageEditorController,
  'exportDocument' | 'insertImage' | 'loadDocument' | 'openImage' | 'renderToDataUrl'
> &
  EditorDocumentOpenPort;

type EditorInspectorActionClient = Pick<RuntimeMessagingTransport, 'sendRuntimeMessage'>;

function createEditorInspectorActionClient(
  transport: RuntimeMessagingTransport = createRuntimeMessagingTransport()
): EditorInspectorActionClient {
  return {
    sendRuntimeMessage: transport.sendRuntimeMessage,
  };
}

async function triggerSessionExport(document: EditorDocument) {
  const filename = await createOutputFilename({
    category: 'resources',
    type: 'editor-session',
    extension: 'json',
  });
  const blob = new Blob([JSON.stringify(document, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement('a');
  link.href = url;
  link.download = filename;
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
  const filename = await generateFilename('edited', exportSettings.imageFormat, settings);

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

      await openEditorImageFromFile(controller, file, (dataUrl) => {
        if (dataUrl !== null) setImageData(dataUrl);
      });
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

      await importEditorSessionFromFile(controller, file, (dataUrl) => {
        if (dataUrl !== null) setImageData(dataUrl);
      });
    },

    exportSession() {
      return triggerSessionExport(controller.exportDocument());
    },

    async saveRenderedImage() {
      await saveRenderedEditorImage(controller, client);
    },
  };
}

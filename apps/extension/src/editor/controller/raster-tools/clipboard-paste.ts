import { readBrowserClipboardImage } from '@sniptale/platform/browser/clipboard';
import { blobToDataUrl } from '../../../platform/media-utils/data-url';
import { assertEditorRasterImageBlobCanBeRead } from '../../document/file-actions/raster-intake';
import { setEditorRasterSelection } from './session/selection';
import {
  insertClipboardImageAtSceneBounds,
  insertExternalClipboardImage,
} from './clipboard-insert';
import type { ClipboardControllerLike } from './clipboard-types';

export async function pasteRasterClipboardImage(
  controller: ClipboardControllerLike
): Promise<boolean> {
  const item = await readBrowserClipboardImage();
  if (!item) {
    return false;
  }

  assertEditorRasterImageBlobCanBeRead(item.blob, item.mimeType);
  assertEditorRasterImageBlobCanBeRead(item.blob);
  const dataUrl = await blobToDataUrl(item.blob);
  const sessionClipboard = controller.rasterToolSession.clipboard;
  if (sessionClipboard?.dataUrl === dataUrl) {
    await insertClipboardImageAtSceneBounds(controller, dataUrl, sessionClipboard.sceneBounds);
    setEditorRasterSelection(controller.rasterToolSession, null);
    return true;
  }

  await insertExternalClipboardImage(controller, dataUrl);
  return true;
}

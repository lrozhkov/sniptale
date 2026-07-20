import { writeBrowserClipboardItems } from '@sniptale/platform/browser/clipboard';
import { dataUrlToBlob } from '../../../../platform/media-utils/data-url';
import type { RasterClipboardPayload } from '../clipboard-types';

export async function writeClipboardPayload(payload: RasterClipboardPayload): Promise<void> {
  await writeBrowserClipboardItems([
    new ClipboardItem({
      'image/png': await dataUrlToBlob(payload.dataUrl),
    }),
  ]);
}

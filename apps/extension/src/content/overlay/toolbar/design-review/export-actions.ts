/** User-activated aggregate export commands owned by Design Review. */
import { writeBrowserClipboardText } from '@sniptale/platform/browser/clipboard';
import { isBrowserAnnotationsExportText } from '@sniptale/runtime-contracts/export';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { isClipboardTextWithinLimit } from '@sniptale/runtime-contracts/validation/text';
import { captureBrowserAnnotationsExportText } from '../../../parser/page-preparation/annotations/format';
import { getContentRuntimeServices } from '../../../application/runtime-services/services';
import {
  attachContentActionIntent,
  type ContentPrivilegedActionIntentSource,
} from '../../../application/privileged-action-intent';

export type ToolbarAnnotationExportAction =
  | 'configure-export'
  | 'copy'
  | 'download'
  | 'export-page';

async function copyBrowserAnnotations(
  contentIntentSource: ContentPrivilegedActionIntentSource | null | undefined
): Promise<void> {
  if (contentIntentSource?.kind !== 'trusted-content-event') {
    throw new Error('A trusted user event is required to copy browser annotations.');
  }
  const text = captureBrowserAnnotationsExportText();
  if (!isClipboardTextWithinLimit(text)) {
    throw new Error('Browser annotations exceed the clipboard text limit.');
  }
  await writeBrowserClipboardText(text);
}

async function downloadBrowserAnnotations(
  contentIntentSource: ContentPrivilegedActionIntentSource | null | undefined
): Promise<void> {
  const text = captureBrowserAnnotationsExportText();
  if (!isBrowserAnnotationsExportText(text)) {
    throw new Error('Browser annotations exceed the direct-download limit.');
  }

  const message = await attachContentActionIntent(
    { type: MessageType.DOWNLOAD_BROWSER_ANNOTATIONS, text },
    contentIntentSource
  );
  const response = await getContentRuntimeServices().messaging.sendRuntimeMessage(message);
  if (!response.success) {
    throw new Error(response.error || 'Browser annotations download failed.');
  }
}

async function openPopupExport(
  contentIntentSource: ContentPrivilegedActionIntentSource | null | undefined
): Promise<void> {
  const message = await attachContentActionIntent(
    { type: MessageType.OPEN_EXPORT_MODAL },
    contentIntentSource
  );
  const response = await getContentRuntimeServices().messaging.sendRuntimeMessage(message);
  if (!response.success) {
    throw new Error(response.error || 'Export page could not be opened.');
  }
}

export function executeToolbarAnnotationExportAction(
  action: ToolbarAnnotationExportAction,
  contentIntentSource?: ContentPrivilegedActionIntentSource | null
): Promise<void> {
  if (action === 'copy') {
    return copyBrowserAnnotations(contentIntentSource);
  }
  if (action === 'download') {
    return downloadBrowserAnnotations(contentIntentSource);
  }
  if (action === 'export-page') {
    return openPopupExport(contentIntentSource);
  }
  return openPopupExport(contentIntentSource);
}

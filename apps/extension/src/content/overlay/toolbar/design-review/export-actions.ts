/** User-activated aggregate export commands owned by Design Review. */
import { writeBrowserClipboardText } from '@sniptale/platform/browser/clipboard';
import { isBrowserAnnotationsExportText } from '@sniptale/runtime-contracts/export';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { isClipboardTextWithinLimit } from '@sniptale/runtime-contracts/validation/text';
import {
  captureBrowserAnnotationsExportText,
  formatBrowserAnnotationSnapshot,
} from '../../../parser/page-preparation/annotations/format';
import {
  createDesignReviewReportExporter,
  type DesignReviewReportSnapshot,
} from '../../../application/design-review-report';
import { finalizeDesignReviewCommentDraft } from '../../design-review/session/comment-draft-finalization';
import { browserAnnotationSession } from '../../../parser/page-preparation/annotations';
import { printReviewReport } from '../../../parser/page-preparation/annotations/format/print';
import { flushPendingPageStyleHistory } from '../../design-review/runtime/actions';
import { translate } from '../../../../platform/i18n';
import { getContentRuntimeServices } from '../../../application/runtime-services/services';
import {
  attachContentActionIntent,
  type ContentPrivilegedActionIntentSource,
} from '../../../application/privileged-action-intent';

const exportReviewReport = createDesignReviewReportExporter({
  annotations: browserAnnotationSession,
  services: getContentRuntimeServices,
  print: printReviewReport,
});

export type ToolbarAnnotationExportAction =
  | 'configure-export'
  | 'copy'
  | 'download'
  | 'pdf'
  | 'export-page';

async function copyBrowserAnnotations(
  contentIntentSource: ContentPrivilegedActionIntentSource | null | undefined,
  artifact?: string
): Promise<void> {
  if (contentIntentSource?.kind !== 'trusted-content-event') {
    throw new Error('A trusted user event is required to copy browser annotations.');
  }
  const text = artifact ?? captureBrowserAnnotationsExportText();
  if (!isClipboardTextWithinLimit(text)) {
    throw new Error('Browser annotations exceed the clipboard text limit.');
  }
  await writeBrowserClipboardText(text);
}

async function downloadBrowserAnnotations(
  contentIntentSource: ContentPrivilegedActionIntentSource | null | undefined,
  artifact?: string
): Promise<void> {
  const text = artifact ?? captureBrowserAnnotationsExportText();
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
  contentIntentSource: ContentPrivilegedActionIntentSource | null | undefined,
  startExport = false
): Promise<void> {
  const message = await attachContentActionIntent(
    { type: MessageType.OPEN_EXPORT_MODAL, ...(startExport ? { startExport: true } : {}) },
    contentIntentSource
  );
  const response = await getContentRuntimeServices().messaging.sendRuntimeMessage(message);
  if (!response.success) {
    throw new Error(response.error || 'Export page could not be opened.');
  }
}

export function executeToolbarAnnotationExportAction(
  action: ToolbarAnnotationExportAction,
  contentIntentSource?: ContentPrivilegedActionIntentSource | null,
  captureSnapshot?: () => DesignReviewReportSnapshot
): Promise<void> {
  if (captureSnapshot && (action === 'copy' || action === 'download' || action === 'pdf')) {
    if (contentIntentSource?.kind !== 'trusted-content-event')
      return Promise.reject(
        new Error('A trusted user event is required to export the review session.')
      );
    try {
      finalizeDesignReviewCommentDraft();
      flushPendingPageStyleHistory();
      const aggregate = structuredClone(captureSnapshot());
      if (action === 'copy')
        return copyBrowserAnnotations(
          contentIntentSource,
          formatBrowserAnnotationSnapshot(aggregate.snapshot)
        );
      if (action === 'download')
        return downloadBrowserAnnotations(
          contentIntentSource,
          formatBrowserAnnotationSnapshot(aggregate.snapshot)
        );
      return createDesignReviewReportExporter({
        annotations: browserAnnotationSession,
        services: getContentRuntimeServices,
        print: printReviewReport,
        captureSnapshot: () => aggregate,
      })(translate('content.toolbar.annotationExportPdfTitle'), contentIntentSource);
    } catch (error) {
      return Promise.reject(error);
    }
  }
  if (action === 'pdf') {
    if (contentIntentSource?.kind !== 'trusted-content-event')
      return Promise.reject(new Error('A trusted user event is required to print the report.'));
    flushPendingPageStyleHistory();
    return exportReviewReport(
      translate('content.toolbar.annotationExportPdfTitle'),
      contentIntentSource
    );
  }
  if (action === 'copy') {
    return copyBrowserAnnotations(contentIntentSource);
  }
  if (action === 'download') {
    return downloadBrowserAnnotations(contentIntentSource);
  }
  if (action === 'export-page') {
    return openPopupExport(contentIntentSource, true);
  }
  return openPopupExport(contentIntentSource);
}

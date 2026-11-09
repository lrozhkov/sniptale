import { useRef, useState, type MouseEvent } from 'react';
import { Copy, Download, FileDown, LoaderCircle, Undo2 } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import { translate } from '../../../../platform/i18n';
import { createTrustedContentActionIntentSource } from '../../../application/privileged-action-intent';
import type {
  ReviewSessionRuntime,
  ReviewSessionState,
} from '../../../application/design-review-session/runtime';
import { executeToolbarAnnotationExportAction } from '../../toolbar/design-review/export-actions';

const REPORT_ACTIONS = [
  {
    action: 'download',
    icon: Download,
    label: 'content.toolbar.annotationExportDownloadLabel',
    success: 'content.toolbar.annotationExportDownloadSuccess',
    error: 'content.toolbar.annotationExportDownloadError',
  },
  {
    action: 'copy',
    icon: Copy,
    label: 'content.toolbar.annotationExportCopyLabel',
    success: 'content.toolbar.annotationExportCopySuccess',
    error: 'content.toolbar.annotationExportCopyError',
  },
  {
    action: 'pdf',
    icon: FileDown,
    label: 'content.toolbar.annotationExportPdfLabel',
    success: 'content.toolbar.annotationExportPdfOpened',
    error: 'content.toolbar.annotationExportPdfError',
  },
] as const;

type ReportAction = (typeof REPORT_ACTIONS)[number];

/** Reuses the existing user-activated report commands for the current review session. */
export function FeedbackPanelFooter(props: {
  runtime: ReviewSessionRuntime | null;
  session: ReviewSessionState | null;
  recordCount: number;
}) {
  const [busy, setBusy] = useState<ReportAction['action'] | null>(null);
  const busyRef = useRef(false);
  const disabled = props.recordCount === 0 || Boolean(props.session?.pending) || busy !== null;
  const exportReport = async (option: ReportAction, event: MouseEvent<HTMLButtonElement>) => {
    if (disabled || busyRef.current) return;
    const source = createTrustedContentActionIntentSource(event.nativeEvent);
    if (!source) return;
    busyRef.current = true;
    setBusy(option.action);
    const snapshot = props.runtime?.getSnapshot().active ? props.runtime.exportSnapshot : undefined;
    try {
      await executeToolbarAnnotationExportAction(option.action, source, snapshot);
      showToast(translate(option.success), 'success');
    } catch {
      showToast(translate(option.error), 'error');
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };
  return (
    <footer
      data-ui="content.design-review.feedback-footer"
      className={[
        'flex h-10 shrink-0 items-center gap-1 border-t border-solid px-2',
        'border-[color:var(--sniptale-color-border-soft)]',
      ].join(' ')}
    >
      {props.session?.canUndo ? (
        <ContentToolbarButton
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-[4px]"
          aria-label={translate('content.designReview.panelUndoDelete')}
          title={translate('content.designReview.panelUndoDelete')}
          disabled={Boolean(props.session.pending) || busy !== null}
          onClick={() => void props.runtime?.undoDelete().catch(() => undefined)}
        >
          <Undo2 aria-hidden="true" size={16} />
        </ContentToolbarButton>
      ) : null}
      <div className="ml-auto flex items-center gap-1">
        {REPORT_ACTIONS.map((option) => {
          const Icon = busy === option.action ? LoaderCircle : option.icon;
          return (
            <ContentToolbarButton
              key={option.action}
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-[4px]"
              dataUi={`content.design-review.feedback-export.${option.action}`}
              aria-label={translate(option.label)}
              title={translate(option.label)}
              aria-busy={busy === option.action}
              disabled={disabled}
              onClick={(event) => void exportReport(option, event)}
            >
              <Icon
                aria-hidden="true"
                size={16}
                className={busy === option.action ? 'animate-spin' : ''}
              />
            </ContentToolbarButton>
          );
        })}
      </div>
    </footer>
  );
}

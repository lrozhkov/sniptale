import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ensureContentUiMountTarget } from '../../../platform/dom-host';
import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { translate } from '../../../../platform/i18n';
import { FeedbackPanelFooter } from './footer';
import type {
  ReviewSessionRuntime,
  ReviewSessionState,
} from '../../../application/design-review-session/runtime';

/** Session commands share the panel's single confirmation and dismissal state. */
export function SessionFeedbackActions(props: {
  runtime: ReviewSessionRuntime | null;
  session: ReviewSessionState | null;
  confirmClear: boolean;
  onConfirmClearChange: (open: boolean) => void;
  children: ReactNode;
  recordCount: number;
}) {
  const { runtime, session, confirmClear, onConfirmClearChange, children } = props;
  return (
    <>
      {session?.error ? (
        <div role="status" className="flex items-center gap-2 px-4 py-2 text-xs leading-4">
          <span className="flex-1">{translate('content.designReview.sessionSaveFailed')}</span>
          <ContentToolbarButton
            disabled={session.pending}
            onClick={() => void runtime?.retry().catch(() => undefined)}
          >
            {translate('content.designReview.sessionRetry')}
          </ContentToolbarButton>
        </div>
      ) : session?.pending ? (
        <div
          role="status"
          className="px-4 py-2 text-xs leading-4 text-[var(--sniptale-color-text-secondary)]"
        >
          {translate('content.designReview.sessionSavePending')}
        </div>
      ) : null}
      {session?.available && session.records.length === 0 ? (
        <div className="flex justify-center px-4 py-3">
          <ContentToolbarButton
            dataUi="content.design-review.feedback-resume"
            className="sniptale-feedback-resume-button"
            disabled={session.pending}
            onClick={() => void runtime?.resume().catch(() => undefined)}
          >
            {translate('content.designReview.sessionResume')}
          </ContentToolbarButton>
        </div>
      ) : null}
      {children}
      <FeedbackPanelFooter
        runtime={runtime}
        session={session}
        recordCount={props.recordCount}
        {...(runtime && session?.active ? { onClear: () => onConfirmClearChange(true) } : {})}
      />
      {confirmClear
        ? createPortal(
            <ProductConfirmDialog
              isOpen
              title={translate('content.designReview.panelClearAll')}
              message={translate('content.designReview.panelClearConfirm')}
              confirmText={translate('content.designReview.panelClearAll')}
              cancelText={translate('common.actions.cancel')}
              confirmDisabled={session?.pending ?? false}
              onCancel={() => onConfirmClearChange(false)}
              onConfirm={async () => {
                await runtime?.clear();
                onConfirmClearChange(false);
              }}
              dialogClassName={[
                'sniptale-compact-workspace !bg-[rgb(from_var(--sniptale-color-surface-panel)_r_g_b_/_1)]',
                '[&_.sniptale-modal-header-sm]:!border-b-0 [&_.sniptale-modal-header-sm]:!bg-transparent',
                '[&_.sniptale-modal-header-sm]:!pb-2 [&_.sniptale-modal-body-sm]:!py-2',
                '[&_.sniptale-modal-footer-sm]:!border-t-0 [&_.sniptale-modal-footer-sm]:!bg-transparent',
              ].join(' ')}
              backdropClassName="!z-[2147483648]"
            />,
            ensureContentUiMountTarget()
          )
        : null}
    </>
  );
}

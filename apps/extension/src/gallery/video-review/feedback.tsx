import { ReviewButton } from './controls';
import type { useReviewEditorState } from './use-editor-state';
import type { useLoadedReview } from './use-session';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ArrowLeft, CircleAlert, LoaderCircle, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { translate } from '../../platform/i18n';
import { reviewOriginalAudioFeedbackMessage } from './original-audio-feedback';

/** Action feedback stays in the modal; dismissing it never changes document recovery state. */
export function ReviewFeedback({
  message,
  originalFeedback,
  onDismiss,
}: {
  message: string | null;
  originalFeedback: Parameters<typeof reviewOriginalAudioFeedbackMessage>[0];
  onDismiss(): void;
}) {
  const text = message ?? reviewOriginalAudioFeedbackMessage(originalFeedback);
  const notice = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!text) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && !notice.current?.contains(active)) {
      trigger.current = active;
    }
  }, [text]);
  const dismiss = () => {
    if (notice.current?.contains(document.activeElement) && trigger.current?.isConnected) {
      trigger.current.focus({ preventScroll: true });
    }
    onDismiss();
  };
  if (!text) return null;
  return (
    <div
      ref={notice}
      data-ui="gallery.videoReview.feedback"
      role="alert"
      aria-atomic="true"
      className="mb-3 flex shrink-0 items-start gap-3 rounded-[var(--sniptale-radius-md)] border
        border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-danger-soft)] p-3
        text-sm text-[var(--sniptale-color-text-primary)]"
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          dismiss();
        }
      }}
    >
      <CircleAlert
        size={20}
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-[var(--sniptale-color-danger)]"
      />
      <p className="min-w-0 flex-1 self-center">{text}</p>
      <ContentToolbarButton
        type="button"
        tone="utility"
        size="compact"
        className="shrink-0"
        title={translate('gallery.videoReview.dismissFeedback')}
        onClick={dismiss}
      >
        <X size={16} aria-hidden="true" />
      </ContentToolbarButton>
    </div>
  );
}

export function reviewErrorMessage(
  error: ReturnType<typeof useReviewEditorState>['snapshot']['error']
) {
  if (error === 'conflict') return translate('gallery.videoReview.conflict');
  if (error === 'changed-source') return translate('gallery.videoReview.sourceChanged');
  if (error === 'missing-media') return translate('gallery.videoReview.missingMedia');
  return translate('gallery.videoReview.saveFailed');
}

/** Load feedback distinguishes saved editing state from source acquisition. */
export function ReviewLoadStatus({
  failure,
  onBack,
  onRetry,
}: {
  failure: ReturnType<typeof useLoadedReview>['failed'];
  onBack(): void;
  onRetry(): void;
}) {
  const workspace = failure?.stage === 'workspace' || failure?.stage === 'session';
  return (
    <div
      data-ui="gallery.videoReview.opening"
      className="flex h-full min-h-0 items-center justify-center overflow-y-auto p-6"
    >
      <div className="my-auto flex w-full max-w-md flex-col items-center gap-5 text-center">
        {failure ? (
          <CircleAlert
            size={32}
            aria-hidden="true"
            className="text-[var(--sniptale-color-danger)]"
          />
        ) : (
          <LoaderCircle
            size={32}
            aria-hidden="true"
            className="motion-safe:animate-spin text-[var(--sniptale-color-text-muted)]"
          />
        )}
        <div className="space-y-2">
          <h1 className="text-lg font-semibold">{translate('gallery.videoReview.editorTitle')}</h1>
          <p
            role={failure ? 'alert' : 'status'}
            className="text-sm text-[var(--sniptale-color-text-secondary)]"
          >
            {translate(
              !failure
                ? 'gallery.videoReview.loading'
                : workspace
                  ? 'gallery.videoReview.workspaceLoadFailed'
                  : 'gallery.videoReview.loadFailed'
            )}
          </p>
        </div>
        {failure ? (
          <div className="flex flex-wrap items-center justify-center gap-3">
            <ReviewButton label={translate('gallery.videoReview.back')} onClick={onBack}>
              <ArrowLeft size={16} aria-hidden="true" />
              {translate('gallery.videoReview.back')}
            </ReviewButton>
            <ReviewButton label={translate('gallery.videoReview.retry')} onClick={onRetry} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

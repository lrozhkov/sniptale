import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { CircleAlert, X } from 'lucide-react';
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

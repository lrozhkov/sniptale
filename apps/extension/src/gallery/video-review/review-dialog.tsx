import './playback-focus.css';
import { useEffect, useRef, type ReactNode } from 'react';
import { translate } from '../../platform/i18n';

/** Modal lifecycle and keyboard modality belong to the editor surface. */
export function ReviewDialog({ children }: { children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      data-ui="gallery.videoReview.dialog"
      onKeyDownCapture={(event) => {
        const target = event.target;
        if (
          event.key === ' ' &&
          !event.altKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.nativeEvent.isComposing &&
          target instanceof HTMLElement &&
          !target.closest('input,textarea,select') &&
          !target.isContentEditable
        ) {
          event.currentTarget.dataset['playbackFocus'] = 'true';
        } else if (event.key !== ' ') delete event.currentTarget.dataset['playbackFocus'];
      }}
      onPointerDownCapture={(event) => {
        delete event.currentTarget.dataset['playbackFocus'];
      }}
      aria-label={translate('gallery.videoReview.title')}
      onCancel={(event) => event.preventDefault()}
      style={{
        backgroundColor: 'var(--sniptale-color-surface-canvas)',
        backgroundImage:
          'linear-gradient(var(--sniptale-color-surface-panel), var(--sniptale-color-surface-panel))',
      }}
      className="fixed inset-0 m-auto h-[calc(100dvh-24px)] max-h-none w-[calc(100vw-24px)] max-w-none
        overflow-hidden rounded-[var(--sniptale-radius-lg)] border
        border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]
        p-0 text-[var(--sniptale-color-text-primary)] backdrop:bg-black/60"
    >
      {children}
    </dialog>
  );
}

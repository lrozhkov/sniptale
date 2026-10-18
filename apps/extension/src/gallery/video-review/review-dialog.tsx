import { CommandPressScope } from '@sniptale/ui/control-language/press';
import './playback-focus.css';
import { focusReviewRegion, reviewKeyboardTarget, reviewOwnsNavigation } from './keyboard-context';
import { useEffect, useRef, type ReactNode } from 'react';
import { translate } from '../../platform/i18n';

/** Modal lifecycle and keyboard modality belong to the editor surface. */
export function ReviewDialog({ children }: { children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const committingField = useRef(false);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  return (
    <CommandPressScope.Provider value={true}>
      <dialog
        ref={dialog}
        tabIndex={-1}
        data-ui="gallery.videoReview.dialog"
        onKeyDownCapture={(event) => {
          committingField.current = false;
          const target = reviewKeyboardTarget(event.nativeEvent);
          if (!target) {
            delete event.currentTarget.dataset['playbackFocus'];
            return;
          }
          if (
            event.key === 'F6' &&
            !event.altKey &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.nativeEvent.isComposing
          ) {
            if (focusReviewRegion(target, event.shiftKey)) {
              event.preventDefault();
              delete event.currentTarget.dataset['playbackFocus'];
            }
            return;
          }
          // Typing/committing a mouse-focused field does not start keyboard navigation.
          const editingText = target.closest(
            [
              'textarea,input:not([type])',
              'input:is([type="text"],[type="number"],[type="search"],[type="email"])',
              'input:is([type="url"],[type="tel"],[type="password"])',
              '[contenteditable]:not([contenteditable="false"])',
            ].join(',')
          );
          if (editingText && event.key !== 'Tab') {
            committingField.current = event.key === 'Enter';
            return;
          }
          if (event.key === 'Tab' || reviewOwnsNavigation(target)) {
            delete event.currentTarget.dataset['playbackFocus'];
          } else if (
            [' ', 'ArrowLeft', 'ArrowRight'].includes(event.key) &&
            !event.altKey &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.nativeEvent.isComposing
          ) {
            event.currentTarget.dataset['playbackFocus'] = 'true';
          }
        }}
        onKeyUpCapture={() => {
          committingField.current = false;
        }}
        onBlurCapture={(event) => {
          const restore = committingField.current && event.relatedTarget === null;
          committingField.current = false;
          // An Enter commit exits the field but keeps subsequent editor shortcuts in the modal.
          if (restore) event.currentTarget.focus({ preventScroll: true });
        }}
        onPointerDownCapture={(event) => {
          committingField.current = false;
          event.currentTarget.dataset['playbackFocus'] = 'true';
        }}
        aria-label={translate('gallery.videoReview.title')}
        onCancel={(event) => event.preventDefault()}
        style={{
          backgroundColor: 'var(--sniptale-color-surface-canvas)',
          backgroundImage:
            'linear-gradient(var(--sniptale-color-surface-panel), var(--sniptale-color-surface-panel))',
        }}
        className="sniptale-compact-workspace fixed inset-0 m-auto h-[calc(100dvh-24px)] max-h-none
          w-[calc(100vw-24px)] max-w-none
          overflow-hidden rounded-[var(--sniptale-radius-lg)] border outline-none
        border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]
        p-0 text-[var(--sniptale-color-text-primary)] backdrop:bg-black/60"
      >
        {children}
      </dialog>
    </CommandPressScope.Provider>
  );
}

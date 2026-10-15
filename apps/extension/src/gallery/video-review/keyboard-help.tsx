import { useEffect, useId, useRef, useState } from 'react';
import { Keyboard } from 'lucide-react';
import { ProductModalBody, ProductModalHeader } from '@sniptale/ui/product-modal';
import { translate } from '../../platform/i18n';
import { formatHotkey } from '../../features/keyboard-shortcuts/hotkey-format';
import { ReviewButton, reviewIconButtonClassName } from './controls';

function historyKey(key: string, shiftKey = false): string {
  const mac = /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  return formatHotkey({ key, ctrlKey: !mac, metaKey: mac, altKey: false, shiftKey });
}

function KeyboardHelpDialog({ anchor, onClose }: { anchor: HTMLButtonElement; onClose(): void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => {
      node?.close();
      if (anchor.isConnected) anchor.focus({ preventScroll: true });
    };
  }, [anchor]);
  const commands = [
    [translate('gallery.videoReview.keyboardRegions'), 'F6 / Shift+F6'],
    [translate('gallery.videoReview.keyboardControls'), 'Tab / Shift+Tab'],
    [translate('gallery.videoReview.keyboardActivate'), 'Enter'],
    [translate('gallery.videoReview.keyboardPlayback'), 'Space'],
    [translate('gallery.videoReview.keyboardSeek'), '← / →'],
    [translate('gallery.videoReview.keyboardRange'), 'Shift+← / Shift+→'],
    [translate('gallery.videoReview.keyboardSeekLarge'), 'Shift+← / Shift+→'],
    [translate('gallery.videoReview.keyboardEdges'), 'Home / End'],
    [translate('gallery.videoReview.undo'), historyKey('Z')],
    [translate('gallery.videoReview.redo'), historyKey('Z', true)],
    [translate('gallery.videoReview.keyboardDelete'), 'Delete / Backspace'],
    [translate('gallery.videoReview.addComment'), 'M'],
    [translate('gallery.videoReview.keyboardCut'), 'C'],
    [translate('gallery.videoReview.keyboardPointer'), 'V'],
    [translate('gallery.videoReview.keyboardCancel'), 'Escape'],
  ];
  return (
    <dialog
      ref={dialog}
      aria-labelledby={title}
      data-ui="gallery.videoReview.keyboardHelp"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        // The help has one action; keep Tab inside rather than moving to browser chrome.
        if (event.key === 'Tab') {
          event.preventDefault();
          event.currentTarget.querySelector<HTMLButtonElement>('button')?.focus();
        }
      }}
      className="sniptale-compact-workspace fixed inset-0 m-auto
        w-[min(560px,calc(100vw-40px))] max-h-[calc(100dvh-40px)]
        overflow-y-auto rounded-[var(--sniptale-radius-lg)] border border-[var(--sniptale-color-border-soft)]
        bg-[var(--sniptale-color-surface-panel)] p-0 text-[var(--sniptale-color-text-primary)] backdrop:bg-black/60"
    >
      <ProductModalHeader
        compact
        title={<span id={title}>{translate('gallery.keyboard.title')}</span>}
        closeTitle={translate('common.actions.close')}
        onClose={onClose}
      />
      <ProductModalBody compact>
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
          {commands.map(([label, keys]) => (
            <div key={label} className="contents">
              <dt>{label}</dt>
              <dd className="text-right font-mono text-xs text-[var(--sniptale-color-text-secondary)]">
                {keys}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs leading-5 text-[var(--sniptale-color-text-secondary)]">
          {translate('gallery.videoReview.keyboardContext')}
        </p>
      </ProductModalBody>
    </dialog>
  );
}

/** Help is a nested native modal: the browser owns focus trapping and the top Escape layer. */
export function ReviewKeyboardHelp() {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const close = () => {
    setAnchor(null);
  };
  return (
    <>
      <ReviewButton
        label={translate('gallery.keyboard.title')}
        className={reviewIconButtonClassName}
        aria-haspopup="dialog"
        aria-expanded={!!anchor}
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        <Keyboard size={16} aria-hidden />
      </ReviewButton>
      {anchor ? <KeyboardHelpDialog anchor={anchor} onClose={close} /> : null}
    </>
  );
}

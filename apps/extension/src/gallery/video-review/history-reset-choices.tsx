import { useLayoutEffect, useRef } from 'react';
import { ContentPopoverAdapter } from '@sniptale/ui/content-popover-adapter';
import { translate } from '../../platform/i18n';

/** Private anchored choices stay in the native editor dialog's top layer. */
export function ReviewHistoryResetChoices(props: {
  anchor: HTMLElement;
  target: HTMLElement;
  canStart: boolean;
  pending: boolean;
  onClose(): void;
  onStart(): void;
  onOriginal(): void;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  useLayoutEffect(() => {
    surface.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !surface.current?.contains(event.target) &&
        !props.anchor.contains(event.target)
      )
        latest.current.onClose();
    };
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('pointerdown', outside);
      if (props.anchor.isConnected) props.anchor.focus();
    };
  }, [props.anchor]);
  const bounds = props.anchor.getBoundingClientRect();
  const width = Math.min(320, window.innerWidth - 24);
  const above = bounds.top > window.innerHeight / 2;
  const rowClass =
    'w-full rounded-md px-3 py-2 text-left hover:bg-[var(--sniptale-color-surface-hover)] ' +
    'focus-visible:outline focus-visible:outline-2 ' +
    'focus-visible:outline-[var(--sniptale-color-accent)] disabled:opacity-50';
  return (
    <ContentPopoverAdapter
      isOpen
      anchorEl={props.anchor}
      portalTarget={props.target}
      popoverRef={surface}
      dataUi="gallery.videoReview.historyChoices"
      className="sniptale-content-popover--compact !rounded-none !bg-[var(--sniptale-color-surface-canvas)]"
      style={{
        position: 'fixed',
        width,
        left: Math.max(
          12,
          Math.min(bounds.left + bounds.width / 2 - width / 2, window.innerWidth - width - 12)
        ),
        top: above ? bounds.top - 6 : bounds.bottom + 6,
        transform: above ? 'translateY(-100%)' : undefined,
        zIndex: 2147483647,
      }}
    >
      <div
        role="dialog"
        aria-label={translate('gallery.videoReview.historyReset')}
        className="max-h-[calc(100vh-24px)] overflow-y-auto p-1"
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape') {
            event.preventDefault();
            props.onClose();
          }
          if (event.key !== 'Tab') return;
          const buttons = [
            ...surface.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
          ];
          const next = event.shiftKey ? buttons.at(-1) : buttons[0];
          if (document.activeElement === (event.shiftKey ? buttons[0] : buttons.at(-1))) {
            event.preventDefault();
            next?.focus();
          }
        }}
      >
        <div className="px-3 py-2 text-sm font-semibold">
          {translate('gallery.videoReview.historyReset')}
        </div>
        <button
          type="button"
          className={rowClass}
          data-history-start
          disabled={!props.canStart || props.pending}
          onClick={props.onStart}
        >
          <span className="block text-sm">{translate('gallery.videoReview.historyStart')}</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-[var(--sniptale-color-text-muted)]">
            {translate('gallery.videoReview.historyStartDescription')}
          </span>
        </button>
        <div className="mx-3 my-1 border-t border-[var(--sniptale-color-border)]" />
        <button
          type="button"
          className={rowClass}
          data-history-original
          disabled={props.pending}
          onClick={props.onOriginal}
        >
          <span className="block text-sm text-[var(--sniptale-color-danger)]">
            {translate('gallery.videoReview.resetOriginal')}
          </span>
          <span className="mt-0.5 block text-xs leading-relaxed text-[var(--sniptale-color-text-muted)]">
            {translate('gallery.videoReview.historyOriginalDescription')}
          </span>
        </button>
      </div>
    </ContentPopoverAdapter>
  );
}

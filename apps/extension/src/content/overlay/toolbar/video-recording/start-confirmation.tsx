import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { ProductToolbarMenu } from '@sniptale/ui/product-menus/toolbar';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import type { ContentToolbarDisplayMode } from '../../../../contracts/settings';
import { translate } from '../../../../platform/i18n';
import { getToolbarMenuPosition } from '../menu/position';
import {
  resolveToolbarFloatingMenuStyle,
  resolveToolbarMenuPlacement,
  useToolbarFloatingMenuDismissal,
} from '../menu/floating.helpers';

export function RecordingStartConfirmation({
  displayMode,
  triggerRef,
  onCancel,
  onContinue,
}: {
  displayMode: ContentToolbarDisplayMode;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onCancel: () => void;
  onContinue: (event: Event, rememberChoice: boolean) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const [rememberChoice, setRememberChoice] = useState(false);
  const [menuHeight, setMenuHeight] = useState(180);
  const titleId = useId();
  useToolbarFloatingMenuDismissal({
    open: true,
    triggerRef,
    menuRef,
    onClose: onCancel,
  });
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onCancel();
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [onCancel]);
  useLayoutEffect(() => {
    const surface = menuRef.current?.querySelector<HTMLElement>('.sniptale-popover-menu');
    dialogRef.current?.focus({ preventScroll: true });
    if (!surface) return;
    const measure = () => setMenuHeight(surface.offsetHeight || 180);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(surface);
    return () => observer.disconnect();
  }, []);
  const placement = getToolbarMenuPosition(triggerRef.current, menuHeight);
  return (
    <div ref={menuRef}>
      <ProductToolbarMenu
        className="sniptale-content-menu-adopted"
        compact
        placement={resolveToolbarMenuPlacement(displayMode, placement)}
        style={{
          width: 380,
          color: 'var(--sniptale-color-text-primary)',
          fontSize: 12,
          lineHeight: 1.5,
          ...resolveToolbarFloatingMenuStyle({
            anchorEl: triggerRef.current,
            displayMode,
            menuHeight,
            menuWidth: 380,
            placement,
          }),
        }}
      >
        <section
          ref={dialogRef}
          tabIndex={-1}
          role="alertdialog"
          data-ui="content.toolbar.video-recording.start-confirmation"
          aria-labelledby={titleId}
          className={[
            'sniptale-recording-start-confirmation sniptale-compact-workspace',
            'flex flex-col gap-3 p-2 outline-none',
          ].join(' ')}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key !== 'Tab') return;
            const controls = event.currentTarget.querySelectorAll<HTMLElement>('input, button');
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (
              event.shiftKey &&
              (event.target === first || event.target === event.currentTarget)
            ) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && event.target === last) {
              event.preventDefault();
              first?.focus();
            }
          }}
        >
          <p id={titleId} className="text-[13px] leading-5 font-medium">
            {translate('content.toolbar.videoRecordingWithoutMicrophone')}
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={rememberChoice}
                onChange={(event) => setRememberChoice(event.target.checked)}
                className="sniptale-parameter-check"
              />
              {translate('content.toolbar.videoRecordingWithoutMicrophoneRemember')}
            </label>
            <div className="flex justify-end gap-2">
              <ProductActionButton compact tone="secondary" onClick={onCancel}>
                {translate('common.actions.cancel')}
              </ProductActionButton>
              <ProductActionButton
                compact
                tone="primary"
                onClick={(event) => onContinue(event.nativeEvent, rememberChoice)}
              >
                {translate('content.toolbar.videoRecordingWithoutMicrophoneContinue')}
              </ProductActionButton>
            </div>
          </div>
        </section>
      </ProductToolbarMenu>
    </div>
  );
}

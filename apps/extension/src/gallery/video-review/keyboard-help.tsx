import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ProductDropdownMenu, ProductDropdownItem } from '@sniptale/ui/product-menus/dropdown';
import { useGlassSelectLayout } from '@sniptale/ui/glass-select/layout';
import {
  resolveThemeSafePortalTarget,
  useResolvedPortalTheme,
} from '@sniptale/ui/theme/safe-portal';
import { isComposedEventWithinElement } from '@sniptale/ui/dom-events';
import { Archive, FilePlus2, Keyboard, MoreHorizontal } from 'lucide-react';
import { ProductModalBody, ProductModalHeader } from '@sniptale/ui/product-modal';
import { translate } from '../../platform/i18n';
import { formatHotkey } from '../../features/keyboard-shortcuts/hotkey-format';
import { reviewIconButtonClassName } from './controls';

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

/** Rare project commands share one menu; help retains its native modal and return target. */
export function ReviewKeyboardHelp(props: {
  busy?: boolean | undefined;
  onNewProject?: (() => void) | undefined;
  onBackup?: (() => void) | undefined;
}) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const entry = useRef<'first' | 'last'>('first');
  const { portalStyle } = useGlassSelectLayout({
    portal: true,
    isOpen: open,
    containerRef: root,
    menuRef: menu,
    menuWidth: 256,
  });
  const theme = useResolvedPortalTheme(trigger.current);
  const close = (restore = true) => {
    setOpen(false);
    if (restore && trigger.current?.isConnected) trigger.current.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (!open) return;
    const items = () => [
      ...(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []),
    ];
    const available = items();
    (entry.current === 'last' ? available.at(-1) : available[0])?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (
        !isComposedEventWithinElement(event, root.current) &&
        !isComposedEventWithinElement(event, menu.current)
      )
        close(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
      } else if (event.key === 'Tab') {
        // Native Tab continues from the original trigger, not the portal's DOM position.
        close();
      } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        event.stopPropagation();
        const buttons = items();
        const current = buttons.findIndex((button) => button === document.activeElement);
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? buttons.length - 1
              : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', key, true);
    };
  }, [open]);
  return (
    <div ref={root} className="shrink-0">
      <ContentToolbarButton
        ref={trigger}
        tone="utility"
        size="compact"
        title={translate('gallery.videoReview.moreActions')}
        aria-label={translate('gallery.videoReview.moreActions')}
        className={reviewIconButtonClassName}
        aria-haspopup="menu"
        aria-expanded={open}
        dataUi="gallery.videoReview.moreActions"
        data-local-space-activation="true"
        onClick={() => {
          entry.current = 'first';
          setOpen(!open);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          event.preventDefault();
          event.stopPropagation();
          entry.current = event.key === 'ArrowUp' ? 'last' : 'first';
          setOpen(true);
        }}
      >
        <MoreHorizontal size={16} aria-hidden="true" />
      </ContentToolbarButton>
      {open
        ? createPortal(
            <div ref={menu} style={portalStyle} data-theme={theme ?? undefined}>
              <ProductDropdownMenu
                role="menu"
                aria-label={translate('gallery.videoReview.moreActions')}
                data-ui="gallery.videoReview.utilityMenu"
                style={{ position: 'relative', top: 'auto', left: 'auto', width: '100%' }}
              >
                {props.onNewProject ? (
                  <ProductDropdownItem
                    role="menuitem"
                    disabled={Boolean(props.busy)}
                    onClick={() => {
                      close();
                      props.onNewProject?.();
                    }}
                  >
                    <FilePlus2 size={16} aria-hidden="true" />
                    <span data-ui="gallery.videoReview.newProject">
                      {translate('videoEditor.app.newProjectAction')}
                    </span>
                  </ProductDropdownItem>
                ) : null}
                <ProductDropdownItem
                  role="menuitem"
                  onClick={() => {
                    close(false);
                    setAnchor(trigger.current);
                  }}
                >
                  <Keyboard size={16} aria-hidden="true" />
                  {translate('gallery.keyboard.title')}
                </ProductDropdownItem>
                {props.onBackup ? (
                  <ProductDropdownItem
                    role="menuitem"
                    disabled={Boolean(props.busy)}
                    onClick={() => {
                      close();
                      props.onBackup?.();
                    }}
                  >
                    <Archive size={16} aria-hidden="true" />
                    {translate('gallery.app.selectionBackup')}
                  </ProductDropdownItem>
                ) : null}
              </ProductDropdownMenu>
            </div>,
            resolveThemeSafePortalTarget(trigger.current)
          )
        : null}
      {anchor ? <KeyboardHelpDialog anchor={anchor} onClose={() => setAnchor(null)} /> : null}
    </div>
  );
}

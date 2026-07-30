import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { BrowserDesignReviewAction } from '../../../parser/page-preparation/annotations';
import { isContentEventWithinElement } from '../../../platform/dom-host';
import { translate } from '../../../../platform/i18n';
import {
  DESIGN_REVIEW_ACTIONS,
  getDesignReviewActionOption,
  getDesignReviewActionTone,
} from '../action-catalog';

export function DesignReviewActionMenu(props: {
  action: BrowserDesignReviewAction;
  onSelect: (action: BrowserDesignReviewAction) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const selected = getDesignReviewActionOption(props.action);
  const SelectedIcon = selected.icon;

  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: PointerEvent) => {
      if (!isContentEventWithinElement(event, containerRef.current)) {
        setOpen(false);
      }
    };
    const dismissWithKeyboard = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', dismissOutside, true);
    document.addEventListener('keydown', dismissWithKeyboard, true);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside, true);
      document.removeEventListener('keydown', dismissWithKeyboard, true);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        className={[
          'inline-flex h-8 items-center gap-2 rounded-[8px] px-2 text-xs font-semibold',
          getDesignReviewActionTone(props.action),
        ].join(' ')}
        onClick={() => setOpen((current) => !current)}
      >
        <SelectedIcon size={16} />
        {translate(selected.labelKey)}
        <ChevronDown size={14} />
      </button>
      {open ? (
        <div
          className={[
            'absolute left-0 top-full z-30 mt-1 w-48 rounded-[10px] border p-1 shadow-xl',
            'border-[color:var(--sniptale-color-border-soft)]',
            'bg-[var(--sniptale-color-surface-panel)]',
          ].join(' ')}
          data-ui="content.design-review.action-menu"
          role="menu"
        >
          {DESIGN_REVIEW_ACTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.action}
                type="button"
                className={[
                  'flex w-full items-center gap-2 rounded-[7px] px-2 py-2 text-left text-xs',
                  'hover:bg-[var(--sniptale-color-surface-input)]',
                  getDesignReviewActionTone(option.action),
                ].join(' ')}
                aria-checked={option.action === props.action}
                role="menuitemradio"
                onClick={() => {
                  props.onSelect(option.action);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
              >
                <Icon size={16} />
                <span className="flex-1">{translate(option.labelKey)}</span>
                {option.action === props.action ? <Check size={14} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

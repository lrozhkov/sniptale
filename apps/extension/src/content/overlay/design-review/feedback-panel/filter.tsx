import { Funnel } from 'lucide-react';
import { useEffect, type RefObject } from 'react';
import { translate } from '../../../../platform/i18n';
import type { BrowserDesignReviewAction } from '../../../parser/page-preparation/annotations';
import { DESIGN_REVIEW_ACTIONS, getDesignReviewActionTone } from '../action-catalog';

export type FeedbackActionFilter = BrowserDesignReviewAction | 'all';

export function FeedbackFilter(props: {
  filter: FeedbackActionFilter;
  menuRef: RefObject<HTMLDivElement | null>;
  onChange: (filter: FeedbackActionFilter) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  rootRef: RefObject<HTMLDivElement | null>;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  useEffect(() => {
    if (!props.open) return;
    const selected = props.menuRef.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    selected?.focus();
  }, [props.menuRef, props.open]);

  const select = (filter: FeedbackActionFilter) => {
    props.onChange(filter);
    props.onOpenChange(false);
    queueMicrotask(() => props.triggerRef.current?.focus());
  };

  return (
    <div className="relative shrink-0" ref={props.rootRef}>
      <button
        ref={props.triggerRef}
        type="button"
        aria-expanded={props.open}
        aria-haspopup="menu"
        aria-label={translate('content.designReview.panelFilter')}
        className={[
          'inline-flex h-10 w-10 items-center justify-center rounded-[9px] border',
          'border-[color:var(--sniptale-color-border-soft)]',
          props.filter === 'all' ? '' : 'text-[var(--sniptale-color-accent)]',
        ].join(' ')}
        onClick={() => props.onOpenChange(!props.open)}
      >
        <Funnel size={17} />
      </button>
      {props.open ? (
        <div
          ref={props.menuRef}
          className={[
            'absolute right-0 top-11 z-10 w-44 rounded-[10px] border p-1 shadow-xl',
            'border-[color:var(--sniptale-color-border-soft)]',
            'bg-[var(--sniptale-color-surface-panel)]',
          ].join(' ')}
          role="menu"
          data-ui="content.design-review.feedback-filter-menu"
        >
          <button
            type="button"
            aria-checked={props.filter === 'all'}
            className="w-full rounded-[7px] px-2 py-2 text-left text-xs hover:bg-[var(--sniptale-color-surface-input)]"
            onClick={() => select('all')}
            role="menuitemradio"
          >
            {translate('content.designReview.panelFilterAll')}
          </button>
          {DESIGN_REVIEW_ACTIONS.map((option) => (
            <button
              key={option.action}
              type="button"
              aria-checked={props.filter === option.action}
              className={[
                'w-full rounded-[7px] px-2 py-2 text-left text-xs',
                'hover:bg-[var(--sniptale-color-surface-input)]',
                getDesignReviewActionTone(option.action),
              ].join(' ')}
              onClick={() => select(option.action)}
              role="menuitemradio"
            >
              {translate(option.labelKey)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

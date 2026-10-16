import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { Funnel } from 'lucide-react';
import { useEffect, type RefObject } from 'react';
import { useFloatingSurfaceWheelContainment } from '@sniptale/ui/floating-interactions/wheel';
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
  const menuRef = useFloatingSurfaceWheelContainment(props.menuRef);
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
      <ContentToolbarButton
        tone="property"
        active={props.filter !== 'all'}
        ref={props.triggerRef}
        type="button"
        aria-expanded={props.open}
        aria-haspopup="menu"
        aria-label={translate('content.designReview.panelFilter')}
        className={[
          'inline-flex h-8 w-8 items-center justify-center rounded-[4px] border',
          'border-[color:var(--sniptale-color-border-soft)]',
          props.filter === 'all' ? '' : 'text-[var(--sniptale-color-accent)]',
        ].join(' ')}
        onClick={() => props.onOpenChange(!props.open)}
      >
        <Funnel size={17} />
      </ContentToolbarButton>
      {props.open ? (
        <div
          ref={menuRef}
          className={[
            'sniptale-design-review-filter-menu absolute right-0 top-9 z-10 w-44',
            'rounded-[4px] border p-[5px] shadow-xl',
            'border-[color:var(--sniptale-color-border-soft)]',
            'bg-[var(--sniptale-color-surface-panel)]',
          ].join(' ')}
          role="menu"
          data-ui="content.design-review.feedback-filter-menu"
        >
          <ProductActionButton
            compact
            tone="toggle"
            active={props.filter === 'all'}
            type="button"
            aria-checked={props.filter === 'all'}
            className={[
              'w-full rounded-[4px] px-2 py-2 text-left',
              'text-[13px] leading-[18px] font-medium',
              'hover:bg-[var(--sniptale-color-surface-input)]',
            ].join(' ')}
            onClick={() => select('all')}
            role="menuitemradio"
          >
            {translate('content.designReview.panelFilterAll')}
          </ProductActionButton>
          {DESIGN_REVIEW_ACTIONS.map((option) => (
            <ProductActionButton
              compact
              tone="toggle"
              active={props.filter === option.action}
              key={option.action}
              type="button"
              aria-checked={props.filter === option.action}
              className={[
                'w-full rounded-[4px] px-2 py-2 text-left text-[13px] leading-[18px] font-medium',
                'hover:bg-[var(--sniptale-color-surface-input)]',
                getDesignReviewActionTone(option.action),
              ].join(' ')}
              onClick={() => select(option.action)}
              role="menuitemradio"
            >
              <span className={getDesignReviewActionTone(option.action)}>
                {translate(option.labelKey)}
              </span>
            </ProductActionButton>
          ))}
        </div>
      ) : null}
    </div>
  );
}

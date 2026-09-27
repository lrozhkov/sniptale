import type { BrowserDesignReviewAction } from '../../../parser/page-preparation/annotations';
import { translate } from '../../../../platform/i18n';
import { DESIGN_REVIEW_ACTIONS, getDesignReviewActionTone } from '../action-catalog';

export function DesignReviewActionMenu(props: {
  action: BrowserDesignReviewAction;
  onSelect: (action: BrowserDesignReviewAction) => void;
}) {
  return (
    <div
      className="flex min-w-0 items-center gap-0.5"
      data-ui="content.design-review.action-switch"
      role="group"
      aria-label={translate('content.designReview.actionLabel')}
    >
      {DESIGN_REVIEW_ACTIONS.map((option) => {
        const Icon = option.icon;
        const selected = option.action === props.action;
        const label = translate(option.labelKey);
        return (
          <button
            key={option.action}
            type="button"
            aria-label={label}
            aria-pressed={selected}
            title={label}
            className={[
              'inline-flex h-7 min-w-6 shrink-0 cursor-pointer items-center justify-center gap-0.5',
              'rounded-[7px] border border-transparent px-1 text-xs font-semibold',
              'text-[var(--sniptale-color-text-secondary)]',
              'hover:bg-[var(--sniptale-color-surface-input)]',
              'active:bg-[var(--sniptale-color-surface-hover)]',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-accent)]',
              selected ? 'bg-[var(--sniptale-color-surface-input)]' : '',
            ].join(' ')}
            onClick={() => props.onSelect(option.action)}
          >
            <Icon
              aria-hidden="true"
              className={selected ? getDesignReviewActionTone(option.action) : ''}
              size={14}
            />
            {selected ? (
              <span className="whitespace-nowrap text-[var(--sniptale-color-text-primary)]">
                {label}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

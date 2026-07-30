import { useId } from 'react';
import { translate } from '../../../../platform/i18n';
import type { DesignReviewActions, DesignReviewViewState } from '../types';

export function PageStyleCommentField(props: {
  actions: DesignReviewActions['comment'] & { close: () => void };
  disabled: boolean;
  state: DesignReviewViewState['comment'];
}) {
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const describedBy = props.state.commitFailed ? `${hintId} ${errorId}` : hintId;

  return (
    <section className="grid gap-1.5" data-ui="content.design-review.comment">
      <div className="sr-only">
        <label
          className="text-[11px] font-bold text-[var(--sniptale-color-text-primary)]"
          htmlFor={inputId}
        >
          {translate('content.designReview.commentLabel')}
        </label>
        {props.state.marker === null ? null : (
          <span className="text-[10px] font-semibold text-[var(--sniptale-color-text-secondary)]">
            {translate('content.designReview.markerNumberLabel')} №{props.state.marker}
          </span>
        )}
      </div>
      <textarea
        aria-describedby={describedBy}
        className={[
          'min-h-28 w-full resize-none rounded-[8px] border border-[color:var(--sniptale-color-border-soft)]',
          'bg-[var(--sniptale-color-surface-input)] px-2.5 py-2 text-xs',
          'text-[var(--sniptale-color-text-primary)] outline-none',
          'placeholder:text-[var(--sniptale-color-text-secondary)]',
          'focus-visible:border-[var(--sniptale-color-accent)] focus-visible:ring-2',
          'focus-visible:ring-[color:var(--sniptale-color-accent-soft)]',
          'disabled:cursor-not-allowed disabled:opacity-50',
        ].join(' ')}
        disabled={props.disabled}
        autoFocus
        id={inputId}
        onBlur={props.actions.commit}
        onChange={(event) => props.actions.updateDraft(event.currentTarget.value)}
        onCompositionEnd={(event) => props.actions.endComposition(event.currentTarget.value)}
        onCompositionStart={props.actions.startComposition}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            props.actions.close();
          }
        }}
        placeholder={translate('content.designReview.commentPlaceholder')}
        value={props.state.draft}
      />
      <p className="sr-only" id={hintId}>
        {translate('content.designReview.commentHint')}
      </p>
      {props.state.commitFailed ? (
        <p
          className="text-[10px] leading-4 text-[var(--sniptale-color-danger)]"
          id={errorId}
          role="alert"
        >
          {translate('content.designReview.commentCommitFailed')}
        </p>
      ) : null}
    </section>
  );
}

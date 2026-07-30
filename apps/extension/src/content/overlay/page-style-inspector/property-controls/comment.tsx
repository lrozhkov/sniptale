import { useId } from 'react';
import { translate } from '../../../../platform/i18n';
import type { PageStyleInspectorActions, PageStyleInspectorViewState } from '../types';

export function PageStyleCommentField(props: {
  actions: PageStyleInspectorActions['comment'];
  disabled: boolean;
  state: PageStyleInspectorViewState['comment'];
}) {
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const describedBy = props.state.commitFailed ? `${hintId} ${errorId}` : hintId;

  return (
    <section
      className="grid gap-1.5 rounded-[10px] border border-[color:var(--sniptale-color-border-soft)] p-2.5"
      data-ui="content.page-style-inspector.comment"
    >
      <div className="flex items-center justify-between gap-2">
        <label
          className="text-[11px] font-bold text-[var(--sniptale-color-text-primary)]"
          htmlFor={inputId}
        >
          {translate('content.pageStyleInspector.commentLabel')}
        </label>
        {props.state.marker === null ? null : (
          <span className="text-[10px] font-semibold text-[var(--sniptale-color-text-secondary)]">
            {translate('content.pageStyleInspector.commentMarkerLabel')} №{props.state.marker}
          </span>
        )}
      </div>
      <textarea
        aria-describedby={describedBy}
        className={[
          'min-h-20 w-full resize-y rounded-[8px] border border-[color:var(--sniptale-color-border-soft)]',
          'bg-[var(--sniptale-color-surface-input)] px-2.5 py-2 text-xs',
          'text-[var(--sniptale-color-text-primary)] outline-none',
          'placeholder:text-[var(--sniptale-color-text-secondary)]',
          'focus-visible:border-[var(--sniptale-color-accent)] focus-visible:ring-2',
          'focus-visible:ring-[color:var(--sniptale-color-accent-soft)]',
          'disabled:cursor-not-allowed disabled:opacity-50',
        ].join(' ')}
        disabled={props.disabled}
        id={inputId}
        onBlur={props.actions.commit}
        onChange={(event) => props.actions.updateDraft(event.currentTarget.value)}
        onCompositionEnd={(event) => props.actions.endComposition(event.currentTarget.value)}
        onCompositionStart={props.actions.startComposition}
        placeholder={translate('content.pageStyleInspector.commentPlaceholder')}
        value={props.state.draft}
      />
      <p className="text-[10px] leading-4 text-[var(--sniptale-color-text-secondary)]" id={hintId}>
        {translate('content.pageStyleInspector.commentHint')}
      </p>
      {props.state.commitFailed ? (
        <p
          className="text-[10px] leading-4 text-[var(--sniptale-color-danger)]"
          id={errorId}
          role="alert"
        >
          {translate('content.pageStyleInspector.commentCommitFailed')}
        </p>
      ) : null}
    </section>
  );
}

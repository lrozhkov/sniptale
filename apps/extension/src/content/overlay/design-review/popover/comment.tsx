import { CornerDownLeft } from 'lucide-react';
import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { translate } from '../../../../platform/i18n';
import type { DesignReviewActions, DesignReviewViewState } from '../types';
import { DesignReviewCommentVoiceButton } from './comment-voice-button';

export function PageStyleCommentField(props: {
  actions: DesignReviewActions['comment'] & {
    close: () => void;
    voice: DesignReviewActions['voice'];
  };
  disabled: boolean;
  footer?: ReactNode;
  state: DesignReviewViewState['comment'];
  voice: DesignReviewViewState['voice'];
}) {
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const voiceErrorId = useId();
  const hasVoiceError = props.voice.errorCode !== null;
  const describedBy = [
    hintId,
    props.state.commitFailed ? errorId : null,
    hasVoiceError ? voiceErrorId : null,
  ]
    .filter(Boolean)
    .join(' ');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    resizeCommentTextarea(textareaRef.current);
  }, [props.state.draft]);

  useLayoutEffect(() => {
    const caretPosition = props.voice.caretPosition;
    const textarea = textareaRef.current;
    if (caretPosition === null || !textarea) return;
    textarea.focus();
    textarea.setSelectionRange(caretPosition, caretPosition);
  }, [props.voice.caretPosition]);

  return (
    <section className="grid cursor-default gap-1.5" data-ui="content.design-review.comment">
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
      <div
        className={[
          'overflow-visible rounded-[9px] border bg-[var(--sniptale-color-surface-input)]',
          'border-[color:var(--sniptale-color-border-soft)]',
          'focus-within:border-[var(--sniptale-color-accent)] focus-within:ring-2',
          'focus-within:ring-[color:var(--sniptale-color-accent-soft)]',
        ].join(' ')}
      >
        <textarea
          ref={textareaRef}
          aria-describedby={describedBy}
          className={[
            'block min-h-14 max-h-40 w-full resize-none overflow-y-hidden rounded-t-[8px]',
            'border-0 bg-transparent px-3 pb-2 pt-3 text-xs leading-5',
            'text-[var(--sniptale-color-text-primary)] outline-none',
            'placeholder:text-[var(--sniptale-color-text-secondary)]',
            'disabled:cursor-not-allowed disabled:opacity-50',
          ].join(' ')}
          disabled={props.disabled}
          autoFocus
          id={inputId}
          onBlur={props.actions.commit}
          onChange={(event) => {
            if (props.voice.active) props.actions.voice.stop();
            resizeCommentTextarea(event.currentTarget);
            props.actions.updateDraft(event.currentTarget.value);
          }}
          onCompositionEnd={(event) => props.actions.endComposition(event.currentTarget.value)}
          onCompositionStart={props.actions.startComposition}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              props.actions.close();
              return;
            }
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              props.actions.close();
            }
          }}
          placeholder={translate('content.designReview.commentPlaceholder')}
          rows={2}
          value={props.state.draft}
        />
        {props.footer ? (
          <div
            className="flex min-h-10 items-center gap-2 px-2 py-1"
            data-ui="content.design-review.comment-footer"
          >
            <div className="min-w-0 flex-1">{props.footer}</div>
            <DesignReviewCommentVoiceButton
              disabled={props.disabled}
              onStart={() => {
                const textarea = textareaRef.current;
                props.actions.voice.start(textarea?.selectionStart ?? props.state.draft.length);
              }}
              onStop={props.actions.voice.stop}
              state={props.voice}
            />
            <span
              aria-label={translate('content.designReview.commentHint')}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-[var(--sniptale-color-text-dim)]"
              data-ui="content.design-review.comment-submit-hint"
              role="img"
              title={translate('content.designReview.commentHint')}
            >
              <CornerDownLeft size={14} strokeWidth={1.8} />
            </span>
          </div>
        ) : null}
      </div>
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
      {hasVoiceError ? (
        <p
          className="text-[10px] leading-4 text-[var(--sniptale-color-danger)]"
          id={voiceErrorId}
          role="alert"
        >
          {translate('content.designReview.voiceInputError')}
        </p>
      ) : null}
    </section>
  );
}

function resizeCommentTextarea(textarea: HTMLTextAreaElement | null): void {
  if (!textarea) return;
  textarea.style.height = 'auto';
  const height = Math.min(Math.max(textarea.scrollHeight, 56), 160);
  textarea.style.height = `${height}px`;
  textarea.style.overflowY = textarea.scrollHeight > 160 ? 'auto' : 'hidden';
}

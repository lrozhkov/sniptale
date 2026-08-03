import { Mic } from 'lucide-react';
import { usePushToTalk } from '@sniptale/ui/voice-input/use-push-to-talk';
import { translate } from '../../../../platform/i18n';
import { isTrustedMouseEvent, isTrustedPointerEvent } from '../../../platform/trusted-events';
import type { DesignReviewViewState } from '../types';

export function DesignReviewCommentVoiceButton(props: {
  disabled: boolean;
  onStart(): void;
  onStop(): void;
  state: DesignReviewViewState['voice'];
}) {
  const pushToTalk = usePushToTalk({
    active: props.state.active,
    disabled: props.disabled,
    onStart: props.onStart,
    onStop: props.onStop,
  });
  const hasError = props.state.errorCode !== null;
  const stopping = props.state.phase === 'stopping';
  const label = translate(
    hasError
      ? 'content.designReview.voiceInputError'
      : props.state.active
        ? 'content.designReview.voiceInputStop'
        : 'content.designReview.voiceInputStart'
  );
  const ringScale = 1 + Math.max(0, Math.min(props.state.audioLevel, 1)) * 0.4;

  return (
    <button
      aria-label={label}
      aria-pressed={props.state.active}
      className={[
        'relative inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full',
        'border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2',
        'focus-visible:ring-[var(--sniptale-color-accent)] disabled:cursor-not-allowed disabled:opacity-45',
        props.state.active
          ? 'text-[var(--sniptale-color-accent)]'
          : hasError
            ? 'text-[var(--sniptale-color-danger)]'
            : 'text-[var(--sniptale-color-text-dim)] hover:text-[var(--sniptale-color-text-primary)]',
      ].join(' ')}
      data-ui="content.design-review.comment-voice-input"
      disabled={props.disabled || stopping}
      title={label}
      type="button"
      onClick={(event) => {
        if (event.detail !== 0) return;
        if (props.state.active) props.onStop();
        else if (isTrustedMouseEvent(event.nativeEvent)) props.onStart();
      }}
      onPointerCancel={pushToTalk.onPointerCancel}
      onPointerDown={(event) => {
        if (props.state.active) {
          if (event.button === 0) props.onStop();
          return;
        }
        if (!isTrustedPointerEvent(event.nativeEvent)) return;
        pushToTalk.onPointerDown(event);
      }}
      onPointerUp={pushToTalk.onPointerUp}
    >
      {props.state.active ? (
        <span
          aria-hidden="true"
          className={[
            'pointer-events-none absolute inset-1 rounded-full border',
            'border-[var(--sniptale-color-accent)] transition-transform',
            'motion-reduce:transition-none',
          ].join(' ')}
          style={{
            opacity: 0.45 + Math.max(0, Math.min(props.state.audioLevel, 1)) * 0.45,
            transform: `scale(${ringScale})`,
          }}
        />
      ) : null}
      <Mic aria-hidden="true" size={14} strokeWidth={1.8} />
    </button>
  );
}

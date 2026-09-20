import { useEffect, useRef } from 'react';
import { SquareDashed } from 'lucide-react';
import { translate } from '../../platform/i18n';
import { VoiceInputButton } from '../../composition/voice-input/button';
import type { ReviewAnnotation } from '../../features/video/review/types';
import { ReviewButton, ReviewInterval, reviewTextButtonClassName } from './controls';
import { useReviewVoice } from './voice';

/** Text and voice share one field; recovery stays silent and Save creates one history step. */
export function ReviewComposer(props: {
  annotation: ReviewAnnotation;
  busy: boolean;
  onChange(value: ReviewAnnotation): void;
  onSave(): void;
  onDiscard(): void;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const voice = useReviewVoice({
    annotation: props.annotation,
    textarea,
    onText: (text) => {
      if (!props.busy) props.onChange({ ...props.annotation, text });
    },
  });
  const stopVoice = useRef(voice.stop);
  stopVoice.current = voice.stop;
  useEffect(() => {
    if (props.busy) stopVoice.current();
  }, [props.busy]);
  useEffect(() => {
    textarea.current?.focus({ preventScroll: true });
    textarea.current?.scrollIntoView?.({ block: 'nearest' });
  }, [props.annotation.id]);
  const { anchor } = props.annotation;
  return (
    <section
      data-ui="gallery.videoReview.commentComposer"
      className="space-y-2 rounded-lg border border-[var(--sniptale-color-border-soft)] p-3
        focus-within:border-[var(--sniptale-color-accent)]"
    >
      <ReviewInterval
        start={anchor.kind === 'point' ? anchor.time : anchor.start}
        end={anchor.kind === 'point' ? anchor.time : anchor.end}
      />
      <div>
        <textarea
          ref={textarea}
          aria-label={translate('gallery.videoReview.commentText')}
          placeholder={translate('gallery.videoReview.commentPlaceholder')}
          title={translate('gallery.videoReview.commentRegionHint')}
          value={props.annotation.text}
          disabled={props.busy}
          rows={4}
          maxLength={100_000}
          className="block w-full resize-y bg-transparent py-2 text-sm outline-none"
          onChange={(event) => props.onChange({ ...props.annotation, text: event.target.value })}
          onSelect={voice.moveCaret}
        />
        <div className="flex items-center justify-between gap-2 px-2 pb-2">
          <VoiceInputButton
            dataUi="gallery.videoReview.voice"
            disabled={props.busy}
            state={voice.state}
            labels={{
              start: translate('gallery.videoReview.voiceStart'),
              stop: translate('gallery.videoReview.voiceStop'),
              error: translate('gallery.videoReview.voiceError'),
            }}
            onStart={voice.start}
            onStop={voice.stop}
          />
          <div className="ml-auto flex items-center gap-1">
            <ReviewButton
              label={translate('gallery.videoReview.discard')}
              disabled={props.busy}
              className={reviewTextButtonClassName}
              onClick={() => {
                voice.stop();
                props.onDiscard();
              }}
            />
            <ReviewButton
              label={translate('gallery.videoReview.save')}
              className={reviewTextButtonClassName}
              disabled={props.busy || !props.annotation.text.trim()}
              onClick={() => {
                voice.stop();
                props.onSave();
              }}
            />
          </div>
        </div>
      </div>
      {props.annotation.region ? (
        <ReviewButton
          label={translate('gallery.videoReview.removeRegion')}
          disabled={props.busy}
          className="!border-0 !bg-transparent !shadow-none !text-xs"
          onClick={() => {
            const { region: _region, ...annotation } = props.annotation;
            props.onChange(annotation);
          }}
        >
          <SquareDashed size={14} />
          <span>{translate('gallery.videoReview.removeRegion')}</span>
        </ReviewButton>
      ) : null}
      {voice.state.errorCode ? (
        <p role="alert" className="text-xs">
          {translate('gallery.videoReview.voiceError')}
        </p>
      ) : null}
    </section>
  );
}

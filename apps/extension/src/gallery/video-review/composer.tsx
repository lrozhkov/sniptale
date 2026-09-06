import { useEffect, useRef } from 'react';
import { X, SquareDashed } from 'lucide-react';
import { translate } from '../../platform/i18n';
import { VoiceInputButton } from '../../composition/voice-input/button';
import type { ReviewAnnotation } from '../../features/video/review/types';
import { ReviewButton, reviewTimeLabel } from './controls';
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
    <section data-ui="gallery.videoReview.commentComposer" className="space-y-2">
      <div className="flex items-center justify-between gap-2 text-xs text-[var(--sniptale-color-text-muted)]">
        <span>
          {anchor.kind === 'point'
            ? reviewTimeLabel(anchor.time)
            : `${reviewTimeLabel(anchor.start)} – ${reviewTimeLabel(anchor.end)}`}
        </span>
        <ReviewButton
          label={translate('gallery.videoReview.discard')}
          disabled={props.busy}
          className="!h-6 !min-h-6 !border-0 !bg-transparent !shadow-none"
          onClick={() => {
            voice.stop();
            props.onDiscard();
          }}
        >
          <X size={14} />
        </ReviewButton>
      </div>
      <div
        className="rounded-lg border border-[var(--sniptale-color-border-soft)]
          bg-[var(--sniptale-color-surface-canvas)]
          focus-within:border-[var(--sniptale-color-accent)]"
      >
        <textarea
          ref={textarea}
          aria-label={translate('gallery.videoReview.commentText')}
          placeholder={translate('gallery.videoReview.commentPlaceholder')}
          title={translate('gallery.videoReview.commentRegionHint')}
          value={props.annotation.text}
          disabled={props.busy}
          rows={5}
          maxLength={100_000}
          className="block w-full resize-y rounded-t-lg bg-transparent p-3 text-sm outline-none"
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
          <ReviewButton
            label={translate('gallery.videoReview.save')}
            primary
            disabled={props.busy || !props.annotation.text.trim()}
            onClick={() => {
              voice.stop();
              props.onSave();
            }}
          />
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

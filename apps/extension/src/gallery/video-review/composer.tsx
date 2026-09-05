import { useEffect, useRef } from 'react';
import { translate } from '../../platform/i18n';
import { VoiceInputButton } from '../../composition/voice-input/button';
import type { ReviewAnnotation } from '../../features/video/review/types';
import { ReviewButton, reviewTimeLabel } from './controls';
import { useReviewVoice } from './voice';

/** One explicit document commit, with recoverable field edits and field-local native undo. */
export function ReviewComposer(props: {
  annotation: ReviewAnnotation;
  busy: boolean;
  saving: boolean;
  dirty: boolean;
  drawing: boolean;
  onChange(value: ReviewAnnotation): void;
  onSave(): void;
  onDiscard(): void;
  onDraw(): void;
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
  const { anchor } = props.annotation;
  return (
    <section className="space-y-3 border-t border-[var(--sniptale-color-border-soft)] pt-3">
      <p className="text-xs text-[var(--sniptale-color-text-muted)]">
        {anchor.kind === 'point'
          ? reviewTimeLabel(anchor.time)
          : `${reviewTimeLabel(anchor.start)}–${reviewTimeLabel(anchor.end)}`}
      </p>
      <label className="block text-sm">
        {translate('gallery.videoReview.commentText')}
        <textarea
          ref={textarea}
          value={props.annotation.text}
          disabled={props.busy}
          rows={4}
          maxLength={100_000}
          className="mt-1 block w-full resize-y rounded-[var(--sniptale-radius-sm)] border
          border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]
          p-2"
          onChange={(event) => props.onChange({ ...props.annotation, text: event.target.value })}
          onSelect={voice.moveCaret}
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
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
        <ReviewButton
          label={translate('gallery.videoReview.discard')}
          disabled={props.busy}
          onClick={() => {
            voice.stop();
            props.onDiscard();
          }}
        />
      </div>
      {voice.state.errorCode ? (
        <p role="alert" className="text-xs">
          {translate('gallery.videoReview.voiceError')}
        </p>
      ) : null}
      <p role="status" className="text-xs text-[var(--sniptale-color-text-muted)]">
        {translate(
          props.saving || props.dirty
            ? 'gallery.videoReview.draftSaving'
            : 'gallery.videoReview.draftSaved'
        )}
      </p>
      <ReviewRegionFields
        annotation={props.annotation}
        busy={props.busy}
        drawing={props.drawing}
        onChange={props.onChange}
        onDraw={props.onDraw}
      />
    </section>
  );
}

/** Point-region editing is independent of text and speech placement. */
function ReviewRegionFields(
  props: Pick<
    Parameters<typeof ReviewComposer>[0],
    'annotation' | 'busy' | 'drawing' | 'onChange' | 'onDraw'
  >
) {
  const { anchor, region } = props.annotation;
  return anchor.kind === 'point' ? (
    <div className="space-y-2">
      <ReviewButton
        label={translate('gallery.videoReview.drawRegion')}
        aria-pressed={props.drawing}
        disabled={props.busy}
        onClick={props.onDraw}
      />
      {props.drawing ? (
        <p className="text-xs">{translate('gallery.videoReview.drawHint')}</p>
      ) : null}
      {!region ? (
        <ReviewButton
          label={translate('gallery.videoReview.selectedRegion')}
          disabled={props.busy}
          onClick={() =>
            props.onChange({
              ...props.annotation,
              region: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
            })
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            {(['x', 'y', 'width', 'height'] as const).map((key) => {
              const labels = {
                x: 'gallery.videoReview.regionLeft',
                y: 'gallery.videoReview.regionTop',
                width: 'gallery.videoReview.regionWidth',
                height: 'gallery.videoReview.regionHeight',
              } as const;
              const max =
                key === 'x'
                  ? 1 - region.width
                  : key === 'y'
                    ? 1 - region.height
                    : key === 'width'
                      ? 1 - region.x
                      : 1 - region.y;
              return (
                <label key={key} className="text-xs">
                  {translate(labels[key])}
                  <input
                    type="number"
                    min={key === 'x' || key === 'y' ? 0 : 0.1}
                    max={max * 100}
                    step={0.1}
                    disabled={props.busy}
                    value={Math.round(region[key] * 1000) / 10}
                    className="mt-1 w-full rounded border border-[var(--sniptale-color-border-soft)] bg-transparent
          p-1"
                    onChange={(event) => {
                      const value = event.currentTarget.valueAsNumber / 100;
                      if (
                        Number.isFinite(value) &&
                        value >= 0 &&
                        value <= max &&
                        (key === 'x' || key === 'y' || value > 0)
                      )
                        props.onChange({
                          ...props.annotation,
                          region: { ...region, [key]: value },
                        });
                    }}
                  />
                </label>
              );
            })}
          </div>
          <ReviewButton
            label={translate('gallery.videoReview.removeRegion')}
            disabled={props.busy}
            onClick={() => {
              const { region: _region, ...annotation } = props.annotation;
              props.onChange(annotation);
            }}
          />
        </>
      )}
    </div>
  ) : null;
}

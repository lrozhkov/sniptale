import { useRef, useState } from 'react';
import { ProductField, ProductInput, ProductTextarea } from '@sniptale/ui/product-form-controls';
import type { ReviewSpeechPhrase } from '../../features/video/review/speech-transcript';
import { parseReviewSpeechProfile } from '../../features/video/review/speech-validation';
import { ReviewButton, reviewTextButtonClassName } from './controls';
import { formatNumber, translate } from '../../platform/i18n';
import type { useReviewSpeech } from './use-speech';
type Controller = ReturnType<typeof useReviewSpeech>;
const buttonClass = `${reviewTextButtonClassName} !h-auto min-h-8! whitespace-normal text-left`;
export function PhraseRow({
  phrase,
  resultInterval,
  next,
  speech,
  tempo,
  selected,
  onSelect,
}: {
  phrase: ReviewSpeechPhrase;
  resultInterval?: { start: number; end: number } | null | undefined;
  next: ReviewSpeechPhrase | undefined;
  speech: Pick<
    Controller,
    | 'profile'
    | 'catalogs'
    | 'running'
    | 'saving'
    | 'dirty'
    | 'isChanged'
    | 'editPhrase'
    | 'split'
    | 'merge'
    | 'generate'
    | 'previews'
    | 'originalUrl'
    | 'apply'
  >;
  tempo: number;
  selected: boolean;
  onSelect(): void;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [splitTime, setSplitTime] = useState('');
  const validProfile = !!parseReviewSpeechProfile(speech.profile);
  const synthesisAvailable =
    speech.catalogs?.speech.models.some((entry) => entry.id === speech.profile?.modelId) ?? false;
  const busy = speech.running || speech.saving || speech.dirty;
  return (
    <article
      className="min-w-0 space-y-2 border-t border-[var(--sniptale-color-border-soft)] pt-3"
      data-ui="gallery.videoReview.speechPhrase"
      data-speech-phrase-id={phrase.id}
    >
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={selected} onChange={onSelect} />
        <span>{translate('gallery.videoReview.speechSelectPhrase')}</span>
        {speech.isChanged(phrase.id) ? (
          <span className="text-[var(--sniptale-color-text-muted)]">
            {translate('gallery.videoReview.speechStale')}
          </span>
        ) : null}
      </label>
      {resultInterval !== undefined ? (
        <p className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('gallery.videoReview.speechResultInterval')}:{' '}
          {resultInterval
            ? formatSpeechInterval(resultInterval)
            : translate('gallery.videoReview.speechRemovedInterval')}
        </p>
      ) : null}
      {phrase.alignment === 'range' ? (
        <p className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('gallery.videoReview.speechUnaligned')}
        </p>
      ) : null}
      <ProductField label={translate('gallery.videoReview.speechText')}>
        <ProductTextarea
          aria-label={translate('gallery.videoReview.speechText')}
          ref={textarea}
          rows={3}
          maxLength={16000}
          value={phrase.text}
          onChange={(event) => speech.editPhrase(phrase.id, { text: event.target.value })}
        />
      </ProductField>
      <div className="grid min-w-0 grid-cols-2 gap-2">
        <PhraseTimeField
          key={`${phrase.id}:start:${phrase.start}`}
          label={translate('gallery.videoReview.speechStart')}
          value={phrase.start}
          onCommit={(start) => speech.editPhrase(phrase.id, { start })}
        />
        <PhraseTimeField
          key={`${phrase.id}:end:${phrase.end}`}
          label={translate('gallery.videoReview.speechEnd')}
          value={phrase.end}
          onCommit={(end) => speech.editPhrase(phrase.id, { end })}
        />
      </div>
      <ProductField label={translate('gallery.videoReview.speechSplitTime')}>
        <ProductInput
          aria-label={translate('gallery.videoReview.speechSplitTime')}
          type="number"
          min={phrase.start}
          max={phrase.end}
          step={0.01}
          value={splitTime}
          onChange={(event) => setSplitTime(event.target.value)}
        />
      </ProductField>
      <div className="flex flex-wrap gap-1">
        <ReviewButton
          label={translate('gallery.videoReview.speechSplit')}
          className={buttonClass}
          disabled={
            busy ||
            !splitTime ||
            !Number.isFinite(Number(splitTime)) ||
            Number(splitTime) <= phrase.start ||
            Number(splitTime) >= phrase.end
          }
          onClick={() =>
            speech.split(phrase.id, textarea.current?.selectionStart ?? 0, Number(splitTime))
          }
        >
          {translate('gallery.videoReview.speechSplit')}
        </ReviewButton>
        <ReviewButton
          label={translate('gallery.videoReview.speechMerge')}
          className={buttonClass}
          disabled={busy || !next || Math.abs(phrase.end - next.start) > 1e-7}
          onClick={() => {
            if (next) speech.merge(phrase.id, next.id);
          }}
        >
          {translate('gallery.videoReview.speechMerge')}
        </ReviewButton>
        <ReviewButton
          label={translate('gallery.videoReview.speechGenerate')}
          className={buttonClass}
          disabled={busy || !validProfile || !synthesisAvailable || !phrase.text.trim()}
          onClick={() => speech.generate([phrase.id])}
        >
          {translate('gallery.videoReview.speechGenerate')}
        </ReviewButton>
      </div>
      <PhraseAudition phrase={phrase} speech={speech} tempo={tempo} busy={busy} />
    </article>
  );
}

function PhraseTimeField(props: { label: string; value: number; onCommit(value: number): void }) {
  const [value, setValue] = useState(String(props.value));
  return (
    <ProductField label={props.label}>
      <ProductInput
        aria-label={props.label}
        type="number"
        min={0}
        step={0.01}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => {
          const next = Number(value);
          if (value && Number.isFinite(next) && next !== props.value) props.onCommit(next);
        }}
      />
    </ProductField>
  );
}

function PhraseAudition({
  phrase,
  speech,
  tempo,
  busy,
}: {
  phrase: ReviewSpeechPhrase;
  speech: Pick<Controller, 'previews' | 'originalUrl' | 'apply'>;
  tempo: number;
  busy: boolean;
}) {
  const preview = speech.previews.find((entry) => entry.replacement.phraseId === phrase.id);
  const overflow = !!preview && preview.replacement.duration > phrase.end - phrase.start + 1e-7;
  return (
    <>
      {speech.originalUrl ? (
        <ProductField label={translate('gallery.videoReview.speechOriginal')}>
          <audio
            aria-label={translate('gallery.videoReview.speechOriginal')}
            className="max-w-full w-full"
            controls
            preload="none"
            src={`${speech.originalUrl}#t=${phrase.start},${phrase.end}`}
            onPlay={(event) => {
              event.currentTarget.playbackRate = tempo;
              if (
                event.currentTarget.currentTime < phrase.start ||
                event.currentTarget.currentTime >= phrase.end
              )
                event.currentTarget.currentTime = phrase.start;
            }}
            onTimeUpdate={(event) => {
              if (event.currentTarget.currentTime >= phrase.end) event.currentTarget.pause();
            }}
          />
        </ProductField>
      ) : null}
      {preview ? (
        <div className="space-y-2" data-ui="gallery.videoReview.speechPreview">
          <ProductField label={translate('gallery.videoReview.speechPreview')}>
            <audio
              aria-label={translate('gallery.videoReview.speechPreview')}
              controls
              className="max-w-full w-full"
              src={preview.url}
              onPlay={(event) => {
                event.currentTarget.playbackRate = tempo;
              }}
            />
          </ProductField>
          {overflow ? (
            <p role="status" className="text-xs text-[var(--sniptale-color-text-muted)]">
              {translate('gallery.videoReview.speechOverflow')}
            </p>
          ) : null}
          <ReviewButton
            label={translate('gallery.videoReview.speechApply')}
            className={buttonClass}
            disabled={busy || overflow}
            onClick={() => speech.apply([preview])}
          >
            {translate('gallery.videoReview.speechApply')}
          </ReviewButton>
        </div>
      ) : null}
    </>
  );
}

function formatSpeechInterval(interval: { start: number; end: number }): string {
  const start = formatNumber(interval.start, { maximumFractionDigits: 2 });
  const end = formatNumber(interval.end, {
    style: 'unit',
    unit: 'second',
    unitDisplay: 'short',
    maximumFractionDigits: 2,
  });
  return `${start}–${end}`;
}

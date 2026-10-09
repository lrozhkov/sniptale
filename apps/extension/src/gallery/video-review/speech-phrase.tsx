import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Clock3, Merge, Scissors, Trash2 } from 'lucide-react';
import { ProductGlassSwitch } from '@sniptale/ui/product-glass-controls';
import { ProductField, ProductInput, ProductTextarea } from '@sniptale/ui/product-form-controls';
import type { ReviewSpeechPhrase } from '../../features/video/review/speech-transcript';
import { parseReviewSpeechProfile } from '../../features/video/review/speech-validation';
import {
  ReviewButton,
  ReviewDetails,
  reviewDeleteButtonClassName,
  reviewTextButtonClassName,
} from './controls';
import { ReviewNumberRow } from './number-row';
import {
  reviewTextSplitBoundary,
  type ReviewTextFragment,
} from '../../features/video/review/text-document';
import type { useReviewText } from './use-review-text';
import { ReviewInspectorColumns } from './inspector-sections';
import { SpeechAudition, formatSpeechTime } from './speech-audition';
import { translate } from '../../platform/i18n';
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
  expanded = true,
  batch = false,
  index = 0,
  onToggle,
  onJump,
  mainVideo,
  nativePlayhead = null,
  bounds,
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
  expanded?: boolean;
  batch?: boolean;
  index?: number;
  onToggle?: (() => void) | undefined;
  onJump?: (() => void) | undefined;
  mainVideo?: HTMLVideoElement | undefined;
  nativePlayhead?: number | null;
  bounds?: { start: number; end: number };
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [splitTime, setSplitTime] = useState('');
  const validProfile = !!parseReviewSpeechProfile(speech.profile);
  const synthesisAvailable =
    speech.catalogs?.speech.models.some((entry) => entry.id === speech.profile?.modelId) ?? false;
  const busy = speech.running || speech.saving || speech.dirty;
  const playing =
    nativePlayhead !== null && nativePlayhead >= phrase.start && nativePlayhead < phrase.end;
  return (
    <article
      className="min-w-0 space-y-2 border-t border-[var(--sniptale-color-border-soft)] pt-3"
      data-ui="gallery.videoReview.speechPhrase"
      data-speech-phrase-id={phrase.id}
      data-speech-active={playing ? 'true' : undefined}
    >
      <PhraseSummary
        phrase={phrase}
        resultInterval={resultInterval}
        selected={selected}
        onSelect={onSelect}
        expanded={expanded}
        batch={batch}
        index={index}
        onToggle={onToggle}
        onJump={onJump}
        playing={playing}
        disabled={speech.saving || speech.dirty}
      />
      {expanded && (
        <>
          {speech.isChanged(phrase.id) ? (
            <span className="text-[var(--sniptale-color-text-muted)]">
              {translate('gallery.videoReview.speechStale')}
            </span>
          ) : null}
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
              {translate(
                phrase.words?.length
                  ? 'gallery.videoReview.speechPartialAlignment'
                  : 'gallery.videoReview.speechUnaligned'
              )}
            </p>
          ) : null}
          <ProductField label={translate('gallery.videoReview.speechText')}>
            <ProductTextarea
              aria-label={translate('gallery.videoReview.speechText')}
              ref={textarea}
              rows={3}
              maxLength={16000}
              disabled={speech.running}
              value={phrase.text}
              onChange={(event) => speech.editPhrase(phrase.id, { text: event.target.value })}
            />
          </ProductField>
          <PhraseTiming
            phrase={phrase}
            next={next}
            speech={speech}
            busy={busy}
            nativePlayhead={nativePlayhead}
            bounds={bounds}
            splitTime={splitTime}
            setSplitTime={setSplitTime}
            selectionStart={() => textarea.current?.selectionStart ?? 0}
          />
          <div className="flex flex-wrap gap-1">
            <ReviewButton
              label={translate('gallery.videoReview.speechGenerate')}
              className={buttonClass}
              disabled={busy || !validProfile || !synthesisAvailable || !phrase.text.trim()}
              onClick={() => speech.generate([phrase.id])}
            >
              {translate('gallery.videoReview.speechGenerate')}
            </ReviewButton>
          </div>
          <PhraseAudition
            phrase={phrase}
            speech={speech}
            tempo={tempo}
            busy={busy}
            mainVideo={mainVideo}
          />
        </>
      )}
    </article>
  );
}

/** List navigation remains independent of the expanded phrase editor. */
function PhraseSummary({
  phrase,
  resultInterval,
  selected,
  onSelect,
  expanded,
  batch,
  index,
  onToggle,
  onJump,
  playing,
  disabled,
}: Pick<
  Parameters<typeof PhraseRow>[0],
  | 'phrase'
  | 'resultInterval'
  | 'selected'
  | 'onSelect'
  | 'expanded'
  | 'batch'
  | 'index'
  | 'onToggle'
  | 'onJump'
> & { playing: boolean; disabled: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-xs">
      {batch && (
        <label
          className="review-history-checkbox"
          title={translate('gallery.videoReview.speechSelectPhrase')}
        >
          <input
            type="checkbox"
            aria-label={translate('gallery.videoReview.speechSelectPhrase')}
            checked={selected}
            onChange={onSelect}
          />
          <span aria-hidden="true">{selected && <Check size={12} />}</span>
        </label>
      )}
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        disabled={disabled}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        title={phrase.text}
      >
        <ChevronDown size={14} className={`shrink-0 ${expanded ? '' : '-rotate-90'}`} />
        <span className="shrink-0 tabular-nums text-[var(--sniptale-color-text-muted)]">
          {(index ?? 0) + 1}
        </span>
        {playing && (
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--sniptale-color-accent)]"
          />
        )}
        {!expanded && (
          <span className="min-w-0 flex-1 truncate">
            {phrase.text || translate('gallery.videoReview.speechText')}
          </span>
        )}
        <span className="shrink-0 tabular-nums text-[var(--sniptale-color-text-muted)]">
          {formatSpeechTime(phrase.start)}–{formatSpeechTime(phrase.end)}
        </span>
      </button>
      {onJump && (
        <ReviewButton
          label={translate('gallery.videoReview.speechJump')}
          className={`${reviewTextButtonClassName} !w-8 !px-0`}
          onClick={onJump}
          disabled={resultInterval === null}
        >
          <Clock3 size={14} />
        </ReviewButton>
      )}
    </div>
  );
}

/** Standalone text uses the same phrase row and form controls without an audio controller. */
export function ReviewTextPhrase(props: {
  fragment: ReviewTextFragment;
  next?: ReviewTextFragment | undefined;
  editor: Pick<
    ReturnType<typeof useReviewText>,
    'change' | 'split' | 'merge' | 'remove' | 'playhead'
  >;
  expanded: boolean;
  selected?: boolean;
  batch?: boolean;
  index?: number;
  busy: boolean;
  limit: number;
  focus?: boolean;
  onToggle?(): void;
  onSelect?(): void;
  onJump(): void;
  actions?: React.ReactNode;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const fragment = props.fragment;
  const playhead = props.editor.playhead(fragment);
  const boundary = reviewTextSplitBoundary(fragment, caret);
  const canSplit =
    caret > 0 &&
    caret < fragment.text.length &&
    (!!boundary || (playhead > fragment.start && playhead < fragment.end));
  useEffect(() => {
    if (props.focus && props.expanded) {
      textarea.current?.focus({ preventScroll: true });
      textarea.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [props.focus, props.expanded]);
  return (
    <article
      className="min-w-0 space-y-2 border-t border-[var(--sniptale-color-border-soft)] py-2"
      data-ui="gallery.videoReview.textPhrase"
      data-text-id={fragment.id}
    >
      <PhraseSummary
        phrase={fragment}
        selected={props.selected ?? false}
        onSelect={props.onSelect ?? (() => undefined)}
        expanded={props.expanded}
        batch={props.batch ?? false}
        index={props.index ?? 0}
        onToggle={props.onToggle}
        onJump={props.onJump}
        playing={playhead >= fragment.start && playhead < fragment.end}
        disabled={props.busy}
      />
      {props.expanded && (
        <>
          <ProductTextarea
            ref={textarea}
            rows={3}
            maxLength={16000}
            aria-label={translate('gallery.videoReview.speechText')}
            value={fragment.text}
            disabled={props.busy}
            onChange={(event) => props.editor.change(fragment.id, { text: event.target.value })}
            onSelect={() => setCaret(textarea.current?.selectionStart ?? 0)}
          />
          <div className="flex items-center gap-1">
            <ReviewButton
              label={translate('gallery.videoReview.textFragmentSplit')}
              className={`${reviewTextButtonClassName} !w-8 !px-0`}
              disabled={props.busy || !canSplit}
              title={
                canSplit
                  ? translate('gallery.videoReview.textFragmentSplit')
                  : translate('gallery.videoReview.textFragmentSplitHint')
              }
              onClick={() =>
                props.editor.split(fragment.id, caret, boundary ? undefined : playhead)
              }
            >
              <Scissors size={14} />
            </ReviewButton>
            {props.next && (
              <ReviewButton
                label={translate('gallery.videoReview.textFragmentMerge')}
                className={`${reviewTextButtonClassName} !w-8 !px-0`}
                disabled={props.busy}
                onClick={() => {
                  if (props.next) props.editor.merge(fragment.id, props.next.id);
                }}
              >
                <Merge size={14} />
              </ReviewButton>
            )}
            {props.actions}
            <ReviewButton
              label={translate('gallery.videoReview.textFragmentDelete')}
              className={`${reviewDeleteButtonClassName} ml-auto !w-8 !px-0`}
              disabled={props.busy}
              onClick={() => props.editor.remove([fragment.id])}
            >
              <Trash2 size={14} />
            </ReviewButton>
          </div>
          <div
            className={[
              'flex min-h-8 items-center justify-between gap-2 text-xs',
              'text-[var(--sniptale-color-text-secondary)]',
            ].join(' ')}
          >
            <span>{translate('gallery.videoReview.textFragmentShown')}</span>
            <ProductGlassSwitch
              role="switch"
              aria-label={translate('gallery.videoReview.textFragmentShown')}
              aria-checked={fragment.showInVideo}
              on={fragment.showInVideo}
              disabled={props.busy}
              onClick={() =>
                props.editor.change(fragment.id, { showInVideo: !fragment.showInVideo })
              }
            />
          </div>
          <ReviewDetails
            preferenceId="group:text-timing"
            label={translate('gallery.videoReview.speechPhraseTiming')}
          >
            <ReviewNumberRow
              label={translate('gallery.videoReview.textFragmentStart')}
              value={fragment.start}
              min={0}
              max={fragment.end - 0.01}
              step={0.01}
              precision={2}
              disabled={props.busy}
              onChange={(start) => props.editor.change(fragment.id, { start })}
            />
            <ReviewNumberRow
              label={translate('gallery.videoReview.textFragmentEnd')}
              value={fragment.end}
              min={fragment.start + 0.01}
              max={props.limit}
              step={0.01}
              precision={2}
              disabled={props.busy}
              onChange={(end) => props.editor.change(fragment.id, { end })}
            />
          </ReviewDetails>
        </>
      )}
    </article>
  );
}

/** Native timing and segmentation have their own validation, separate from audition and synthesis. */
function PhraseTiming({
  phrase,
  next,
  speech,
  busy,
  nativePlayhead,
  bounds,
  splitTime,
  setSplitTime,
  selectionStart,
}: {
  phrase: ReviewSpeechPhrase;
  next: ReviewSpeechPhrase | undefined;
  speech: Pick<Controller, 'editPhrase' | 'split' | 'merge'>;
  busy: boolean;
  nativePlayhead: number | null;
  bounds: { start: number; end: number } | undefined;
  splitTime: string;
  setSplitTime(value: string): void;
  selectionStart(): number;
}) {
  return (
    <ReviewDetails
      label={translate('gallery.videoReview.speechPhraseTiming')}
      preferenceId="speech.phrase.timing"
    >
      <ReviewInspectorColumns>
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
      </ReviewInspectorColumns>
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
          label={translate('gallery.videoReview.speechStartAtPlayhead')}
          className={buttonClass}
          disabled={
            busy ||
            nativePlayhead === null ||
            nativePlayhead < (bounds?.start ?? phrase.start) ||
            nativePlayhead >= phrase.end
          }
          onClick={() => {
            if (nativePlayhead !== null) speech.editPhrase(phrase.id, { start: nativePlayhead });
          }}
        />
        <ReviewButton
          label={translate('gallery.videoReview.speechEndAtPlayhead')}
          className={buttonClass}
          disabled={
            busy ||
            nativePlayhead === null ||
            nativePlayhead <= phrase.start ||
            nativePlayhead > (bounds?.end ?? phrase.end)
          }
          onClick={() => {
            if (nativePlayhead !== null) speech.editPhrase(phrase.id, { end: nativePlayhead });
          }}
        />
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
          onClick={() => speech.split(phrase.id, selectionStart(), Number(splitTime))}
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
      </div>
    </ReviewDetails>
  );
}

function PhraseTimeField(props: { label: string; value: number; onCommit(value: number): void }) {
  const display = () => String(Number(props.value.toFixed(2)));
  const [value, setValue] = useState(display);
  const dirty = useRef(false);
  const commit = () => {
    if (!dirty.current) return;
    const next = Number(value);
    if (value && Number.isFinite(next) && next !== props.value) props.onCommit(next);
    dirty.current = false;
  };
  return (
    <ProductField label={props.label}>
      <ProductInput
        aria-label={props.label}
        type="number"
        min={0}
        step={0.01}
        value={value}
        onChange={(event) => {
          dirty.current = true;
          setValue(event.target.value);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
            event.currentTarget.blur();
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            dirty.current = false;
            setValue(display());
            event.currentTarget.blur();
          }
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
  mainVideo,
}: {
  phrase: ReviewSpeechPhrase;
  speech: Pick<Controller, 'previews' | 'originalUrl' | 'apply'>;
  tempo: number;
  busy: boolean;
  mainVideo: HTMLVideoElement | undefined;
}) {
  const preview = speech.previews.find((entry) => entry.replacement.phraseId === phrase.id);
  const overflow = !!preview && preview.replacement.duration > phrase.end - phrase.start + 1e-7;
  return (
    <>
      <SpeechAudition
        originalUrl={speech.originalUrl}
        interval={phrase}
        tempo={tempo}
        mainVideo={mainVideo}
        result={preview ? { url: preview.url, duration: preview.replacement.duration } : undefined}
      />
      {preview && (
        <div className="space-y-2" data-ui="gallery.videoReview.speechPreview">
          {overflow && (
            <p role="status" className="text-xs text-[var(--sniptale-color-text-muted)]">
              {translate('gallery.videoReview.speechOverflow')}
            </p>
          )}
          <ReviewButton
            label={translate('gallery.videoReview.speechApply')}
            className={buttonClass}
            disabled={busy || overflow}
            onClick={() => speech.apply([preview])}
          >
            {translate('gallery.videoReview.speechApply')}
          </ReviewButton>
        </div>
      )}
    </>
  );
}

function formatSpeechInterval(interval: { start: number; end: number }): string {
  return `${formatSpeechTime(interval.start)}–${formatSpeechTime(interval.end)}`;
}

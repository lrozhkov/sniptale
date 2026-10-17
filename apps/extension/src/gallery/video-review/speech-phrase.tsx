import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, LocateFixed, Merge, Scissors, Trash2 } from 'lucide-react';
import { TextareaField } from '../../ui/compact-inspector-controls';
import type { ReviewSpeechPhrase } from '../../features/video/review/speech-transcript';
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
import { formatSpeechTime } from './speech-audition';
import { translate } from '../../platform/i18n';
import { ReviewFragmentCaptionControls } from './caption-controls';
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
}: {
  phrase: Pick<ReviewSpeechPhrase, 'start' | 'end' | 'text'>;
  resultInterval?: { start: number; end: number } | null | undefined;
  selected: boolean;
  onSelect(): void;
  expanded: boolean;
  batch: boolean;
  index?: number | undefined;
  onToggle?: (() => void) | undefined;
  onJump?: (() => void) | undefined;
  playing: boolean;
  disabled: boolean;
}) {
  const interval = `${formatSpeechTime(phrase.start)}–${formatSpeechTime(phrase.end)}`;
  const jumpDescription = `${index === undefined ? '' : `${index + 1} · `}${interval}`;
  const content = (
    <>
      {onToggle ? (
        <ChevronDown size={14} className={`shrink-0 ${expanded ? '' : '-rotate-90'}`} />
      ) : null}
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
      {!onJump && (
        <>
          {index !== undefined ? (
            <span className="shrink-0 tabular-nums text-[var(--sniptale-color-text-muted)]">
              {index + 1}
            </span>
          ) : null}
          <span className="shrink-0 tabular-nums text-[var(--sniptale-color-text-muted)]">
            {interval}
          </span>
        </>
      )}
    </>
  );
  return (
    <div
      className={[
        'flex min-w-0 items-center gap-2 text-xs',
        onToggle ? '' : 'border-b border-[var(--sniptale-color-border-soft)] pb-2',
      ].join(' ')}
    >
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
      {onToggle ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={onToggle}
          disabled={disabled}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          title={phrase.text}
        >
          {content}
        </button>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-2">{content}</span>
      )}
      {onJump && (
        <ReviewButton
          label={translate('gallery.videoReview.speechJump')}
          aria-description={jumpDescription}
          className={`${reviewTextButtonClassName} shrink-0 gap-1 !px-1`}
          onClick={onJump}
          disabled={resultInterval === null}
        >
          {index !== undefined ? (
            <span className="shrink-0 tabular-nums text-[var(--sniptale-color-text-muted)]">
              {index + 1}
            </span>
          ) : null}
          <span className="shrink-0 tabular-nums text-[var(--sniptale-color-text-muted)]">
            {interval}
          </span>
          <LocateFixed size={14} aria-hidden="true" />
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
    'change' | 'split' | 'merge' | 'remove' | 'playhead' | 'captions' | 'endTyping'
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
      className={[
        'min-w-0 space-y-2 py-2',
        props.onToggle ? 'border-t border-[var(--sniptale-color-border-soft)]' : '',
      ].join(' ')}
      data-ui="gallery.videoReview.textPhrase"
      data-text-id={fragment.id}
    >
      <PhraseSummary
        phrase={fragment}
        selected={props.selected ?? false}
        onSelect={props.onSelect ?? (() => undefined)}
        expanded={props.expanded}
        batch={props.batch ?? false}
        index={props.index}
        onToggle={props.onToggle}
        onJump={props.onJump}
        playing={playhead >= fragment.start && playhead < fragment.end}
        disabled={props.busy}
      />
      {props.expanded && (
        <>
          <TextareaField
            ref={textarea}
            rows={6}
            maxLength={16000}
            label={translate('gallery.videoReview.speechText')}
            value={fragment.text}
            disabled={props.busy}
            onChange={(text) => props.editor.change(fragment.id, { text })}
            onBlur={() => props.editor.endTyping()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') props.editor.endTyping();
            }}
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
          <ReviewFragmentCaptionControls
            fragment={fragment}
            settings={props.editor.captions}
            disabled={props.busy}
            onChange={(patch) => props.editor.change(fragment.id, patch)}
          />
          <ReviewDetails
            preferenceId="group:text-timing"
            label={translate('gallery.videoReview.intervalBounds')}
          >
            <ReviewNumberRow
              label={translate('gallery.videoReview.textFragmentStart')}
              unit="s"
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
              unit="s"
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

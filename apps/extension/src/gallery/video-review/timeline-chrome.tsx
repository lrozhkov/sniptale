import './timeline-toolbar.css';
import { useReviewToolbarLayout } from './use-toolbar-layout';
import { formatPreciseTime } from '../../composition/library-preview/time-format';
import { Play, BetweenHorizontalStart, Undo2, Redo2, StickyNote } from 'lucide-react';
import type { ReactNode, CSSProperties } from 'react';
import { CompactRange } from '../../ui/compact-inspector-controls';
import { translate } from '../../platform/i18n';
import { reviewIconButtonClassName, ReviewButton, reviewTimeLabel } from './controls';

/** Useful ruler units at the current zoom; labels do not contribute to canvas width. */
export function ReviewRuler({ duration, width }: { duration: number; width: number }) {
  const required = duration / Math.max(1, width / 80);
  const magnitude = 10 ** Math.floor(Math.log10(required));
  const major =
    [1, 2, 5, 10].map((value) => value * magnitude).find((value) => value >= required) ??
    magnitude * 10;
  const minor = major / 5;
  const count = Math.min(2000, Math.floor(duration / minor));
  return (
    <div
      data-ui="gallery.videoReview.ruler"
      aria-hidden="true"
      className="relative h-7 select-none overflow-hidden"
    >
      {Array.from({ length: count + 1 }, (_, index) => {
        const time = index * minor;
        const labelled = index % 5 === 0;
        return (
          <div
            key={index}
            className="absolute bottom-0 border-l border-[var(--sniptale-color-border-soft)]"
            style={{ left: `${(time / duration) * 100}%`, height: labelled ? 9 : 4 }}
          >
            {labelled ? (
              <span
                className="absolute -top-4 left-1 whitespace-nowrap text-[10px] tabular-nums
                  text-[var(--sniptale-color-text-muted)]"
              >
                {major >= 1 ? reviewTimeLabel(time).replace(/\.0$/, '') : reviewTimeLabel(time)}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

const plain = reviewIconButtonClassName;

/** Editing tools, centered transport and viewport controls share one quiet toolbar. */
export function ReviewToolbar(props: {
  duration: number;
  time: number;
  playing: boolean;
  resultDuration?: number;
  historyControls?: ReactNode;
  tools?: ReactNode;
  expandedTools?: boolean;
  onPlay(): void;
  zoom: number;
  onZoom(value: number): void;
}) {
  const toolbar = useReviewToolbarLayout();
  return (
    <div ref={toolbar} data-ui="gallery.videoReview.toolbar" className="review-timeline-toolbar">
      <div data-toolbar-side="leading" className="flex min-w-0 items-center">
        {props.tools}
      </div>
      <div data-toolbar-transport className="flex shrink-0 items-center justify-center gap-2">
        <ReviewButton
          label={translate(
            props.playing ? 'gallery.videoReview.pause' : 'gallery.videoReview.play'
          )}
          toolbarPriority={3}
          toolbarLabel={translate(
            props.playing ? 'gallery.videoReview.pause' : 'gallery.videoReview.play'
          )}
          onClick={props.onPlay}
          className={plain}
          aria-pressed={props.playing}
        >
          {props.playing ? (
            <svg viewBox="0 0 16 16" className="size-4" fill="currentColor" aria-hidden="true">
              <rect x="4" y="3" width="2" height="10" />
              <rect x="10" y="3" width="2" height="10" />
            </svg>
          ) : (
            <Play size={16} strokeWidth={2.2} />
          )}
        </ReviewButton>
        <span className="whitespace-nowrap text-xs font-semibold tabular-nums">
          {formatPreciseTime(props.time)} / {formatPreciseTime(props.duration)}
        </span>
        {props.resultDuration !== undefined &&
        Math.abs(props.resultDuration - props.duration) > 0.05 ? (
          <output
            title={translate('gallery.videoReview.resultDuration')}
            className="ml-1 text-xs tabular-nums text-[var(--sniptale-color-text-muted)]"
          >
            → {reviewTimeLabel(props.resultDuration)}
          </output>
        ) : null}
      </div>
      <div data-toolbar-side="trailing" className="flex min-w-0 items-center justify-end gap-0.5">
        <div
          data-ui="gallery.videoReview.noteHistoryTools"
          className="flex min-w-max flex-1 items-center justify-center"
        >
          {props.historyControls}
        </div>
        <CompactRange
          aria-label={translate('videoEditor.timeline.zoom')}
          title={translate('videoEditor.timeline.zoom')}
          min={0}
          max={100}
          step={0.1}
          value={Math.log2(props.zoom) * 25}
          onChange={(event) => props.onZoom(2 ** (event.currentTarget.valueAsNumber / 25))}
          style={
            {
              width: 80,
              minWidth: 80,
              '--sniptale-range-track-height': '3px',
              '--sniptale-color-accent': 'var(--sniptale-color-text-dim)',
            } as CSSProperties
          }
        />
        <ReviewButton
          label={translate('gallery.videoReview.fit')}
          toolbarPriority={0}
          toolbarLabel={translate('gallery.videoReview.fit')}
          className={plain}
          onClick={() => props.onZoom(1)}
        >
          <BetweenHorizontalStart size={16} strokeWidth={2} />
        </ReviewButton>
      </div>
    </div>
  );
}

/** History commands share the session transaction path used by keyboard shortcuts. */
export function ReviewHistoryControls(props: {
  busy: boolean;
  cursor: number;
  length: number;
  onHistory(direction: 'undo' | 'redo'): void;
  onAddNote?(): void;
}) {
  return (
    <>
      {props.onAddNote ? (
        <ReviewButton
          label={translate('gallery.videoReview.addComment')}
          toolbarPriority={2}
          toolbarLabel={translate('gallery.videoReview.toolbarNote')}
          className={plain}
          disabled={props.busy}
          onClick={props.onAddNote}
        >
          <StickyNote size={16} aria-hidden="true" />
        </ReviewButton>
      ) : null}
      {(['undo', 'redo'] as const).map((direction) => (
        <ReviewButton
          key={direction}
          label={translate(`gallery.videoReview.${direction}`)}
          toolbarPriority={1}
          toolbarLabel={translate(
            direction === 'undo'
              ? 'gallery.videoReview.toolbarUndo'
              : 'gallery.videoReview.toolbarRedo'
          )}
          className={plain}
          disabled={
            props.busy || (direction === 'undo' ? props.cursor === 0 : props.cursor >= props.length)
          }
          onClick={() => props.onHistory(direction)}
        >
          {direction === 'undo' ? <Undo2 size={16} /> : <Redo2 size={16} />}
        </ReviewButton>
      ))}
    </>
  );
}

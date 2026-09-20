import { Play, Pause, Scan } from 'lucide-react';
import type { ReactNode, CSSProperties } from 'react';
import { CompactRange } from '../../ui/compact-inspector-controls';
import { translate } from '../../platform/i18n';
import { ReviewButton, reviewTimeLabel } from './controls';

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

const plain = '!border-0 !bg-transparent !shadow-none !h-8 !w-8 !min-h-8';

/** Editing tools, centered transport and viewport controls share one quiet toolbar. */
export function ReviewToolbar(props: {
  duration: number;
  time: number;
  playing: boolean;
  resultDuration?: number;
  tools?: ReactNode;
  onPlay(): void;
  zoom: number;
  onZoom(value: number): void;
}) {
  return (
    <div
      data-ui="gallery.videoReview.toolbar"
      className="flex min-w-0 flex-wrap items-center gap-1 border-b border-[var(--sniptale-color-border-soft)]
        px-2 py-1"
    >
      {props.tools}
      <div className="mx-auto flex shrink-0 items-center gap-1">
        <span className="min-w-8 text-right text-xs tabular-nums">
          {reviewTimeLabel(props.time)}
        </span>
        <ReviewButton
          label={translate(
            props.playing ? 'gallery.videoReview.pause' : 'gallery.videoReview.play'
          )}
          onClick={props.onPlay}
          className={plain}
        >
          {props.playing ? (
            <Pause size={18} fill="currentColor" />
          ) : (
            <Play size={18} fill="currentColor" />
          )}
        </ReviewButton>
        <span className="min-w-8 text-xs tabular-nums text-[var(--sniptale-color-text-muted)]">
          {reviewTimeLabel(props.duration)}
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
      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        <CompactRange
          aria-label={translate('videoEditor.timeline.zoom')}
          title={translate('videoEditor.timeline.zoom')}
          min={0}
          max={100}
          step={0.1}
          value={Math.log2(props.zoom) * 25}
          onChange={(event) => props.onZoom(2 ** (event.currentTarget.valueAsNumber / 25))}
          style={
            { width: 80, minWidth: 80, '--sniptale-range-track-height': '3px' } as CSSProperties
          }
        />
        <ReviewButton
          label={translate('gallery.videoReview.fit')}
          className={plain}
          onClick={() => props.onZoom(1)}
        >
          <Scan size={14} />
        </ReviewButton>
      </div>
    </div>
  );
}

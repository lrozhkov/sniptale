import { Play, Pause, Minus, Plus, Scan, Volume2 } from 'lucide-react';
import type { ReactNode } from 'react';
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
  volume?: number;
  onVolume?(value: number): void;
  tools?: ReactNode;
  onPlay(): void;
  zoom: number;
  onZoom(value: number): void;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 py-1">
      <div className="flex min-w-0 flex-wrap items-center gap-1">{props.tools}</div>
      <div className="flex items-center gap-1">
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
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-0.5">
        {props.onVolume ? (
          <label className="mr-2 flex items-center gap-1">
            <Volume2 size={14} aria-hidden="true" />
            <CompactRange
              aria-label={translate('gallery.videoReview.volume')}
              min={0}
              max={1}
              step={0.05}
              value={props.volume ?? 1}
              onChange={(event) => props.onVolume?.(event.currentTarget.valueAsNumber)}
              style={{ width: 48, minWidth: 48 }}
            />
          </label>
        ) : null}
        <ReviewButton
          label={translate('gallery.videoReview.zoomOut')}
          disabled={props.zoom === 1}
          className={plain}
          onClick={() => props.onZoom(Math.max(1, props.zoom / 2))}
        >
          <Minus size={14} />
        </ReviewButton>
        <ReviewButton
          label={translate('gallery.videoReview.zoomIn')}
          disabled={props.zoom === 16}
          className={plain}
          onClick={() => props.onZoom(Math.min(16, props.zoom * 2))}
        >
          <Plus size={14} />
        </ReviewButton>
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

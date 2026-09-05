import { Play, Pause, Minus, Plus, Scan } from 'lucide-react';
import { CompactRange } from '../../ui/compact-inspector-controls';
import { translate } from '../../platform/i18n';
import type { ReviewAnchor } from '../../features/video/review/types';
import { ReviewButton, reviewTimeLabel } from './controls';

const percent = (time: number, duration: number) => `${(time / duration) * 100}%`;
const groupClass = `flex shrink-0 items-center gap-0.5 rounded-[var(--sniptale-radius-sm)]
  border border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)] p-0.5`;

/** Ruler labels follow useful time units and available width; minor ticks never carry labels. */
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
      aria-hidden="true"
      className="relative h-7 select-none border-b border-[var(--sniptale-color-border-soft)]"
    >
      {Array.from({ length: count + 1 }, (_, index) => {
        const time = index * minor;
        const labelled = index % 5 === 0;
        const clock = reviewTimeLabel(time);
        const label = major >= 1 ? clock.slice(0, -4) : clock.slice(0, major >= 0.1 ? -2 : -1);
        return (
          <div
            key={index}
            className="absolute bottom-0 border-l border-[var(--sniptale-color-border-soft)]"
            style={{ left: percent(time, duration), height: labelled ? 10 : 4 }}
          >
            {labelled ? (
              <span
                style={{
                  transform: time >= duration - minor / 2 ? 'translateX(-100%)' : undefined,
                }}
                className="absolute -top-3.5 left-1 text-[10px] tabular-nums text-[var(--sniptale-color-text-muted)]"
              >
                {label}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function ReviewToolbar(
  props: {
    duration: number;
    time: number;
    playing: boolean;
    selection: ReviewAnchor;
    onPlay(): void;
    onSelect(value: ReviewAnchor): void;
  } & { zoom: number; onZoom(value: number): void }
) {
  const { zoom, onZoom: setZoom } = props;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className={groupClass}>
        <ReviewButton
          label={translate(
            props.playing ? 'gallery.videoReview.pause' : 'gallery.videoReview.play'
          )}
          onClick={props.onPlay}
          className="!h-8 !w-8 !min-h-8"
        >
          {props.playing ? (
            <Pause size={15} fill="currentColor" />
          ) : (
            <Play size={15} fill="currentColor" />
          )}
        </ReviewButton>
        <output className="flex min-w-32 items-baseline gap-1.5 px-2 text-xs tabular-nums">
          <span className="font-medium">{reviewTimeLabel(props.time)}</span>
          <span className="text-[var(--sniptale-color-text-muted)]">
            / {reviewTimeLabel(props.duration)}
          </span>
        </output>
      </div>
      <div className={groupClass}>
        <ReviewButton
          label={translate('gallery.videoReview.point')}
          aria-pressed={props.selection.kind === 'point'}
          className="!h-8 !min-h-8 aria-pressed:!bg-[var(--sniptale-color-surface-hover)]"
          onClick={() => props.onSelect({ kind: 'point', time: props.time })}
        />
        <ReviewButton
          label={translate('gallery.videoReview.range')}
          aria-pressed={props.selection.kind === 'range'}
          className="!h-8 !min-h-8 aria-pressed:!bg-[var(--sniptale-color-surface-hover)]"
          onClick={() =>
            props.onSelect({
              kind: 'range',
              start: Math.min(props.time, Math.max(0, props.duration - 1)),
              end: Math.min(props.duration, props.time + 1),
            })
          }
        />
      </div>
      <div className={`${groupClass} ml-auto`}>
        <ReviewButton
          label={translate('gallery.videoReview.zoomOut')}
          disabled={zoom === 1}
          className="!h-8 !w-7 !min-h-8"
          onClick={() => setZoom(Math.max(1, zoom / 2))}
        >
          <Minus size={14} />
        </ReviewButton>
        <CompactRange
          aria-label={translate('gallery.videoReview.timelineZoom')}
          min={0}
          max={4}
          step={1}
          value={Math.log2(zoom)}
          onChange={(event) => setZoom(2 ** event.currentTarget.valueAsNumber)}
          className="w-14"
        />
        <ReviewButton
          label={translate('gallery.videoReview.zoomIn')}
          disabled={zoom === 16}
          className="!h-8 !w-7 !min-h-8"
          onClick={() => setZoom(Math.min(16, zoom * 2))}
        >
          <Plus size={14} />
        </ReviewButton>
        <span
          aria-hidden="true"
          className="mx-1 h-4 border-l border-[var(--sniptale-color-border-soft)]"
        />
        <ReviewButton
          label={translate('gallery.videoReview.fit')}
          className="!h-8 !w-8 !min-h-8"
          onClick={() => setZoom(1)}
        >
          <Scan size={14} />
        </ReviewButton>
      </div>
    </div>
  );
}

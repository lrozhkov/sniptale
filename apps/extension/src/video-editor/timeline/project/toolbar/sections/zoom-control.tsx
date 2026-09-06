import { Minus, Plus } from 'lucide-react';

import { translate } from '../../../../../platform/i18n';
import { CompactRange } from '../../../../../ui/compact-inspector-controls';
import { formatTimelineVisibleRange } from '../../interaction-state/helpers';
import {
  mapTimelinePixelsPerSecondToSliderValue,
  mapTimelineZoomSliderToPixelsPerSecond,
} from '../../interaction-state/zoom';
import type { ProjectTimelineToolbarProps } from '../types';

const TIMELINE_ZOOM_SLIDER_MIN = 0;
const TIMELINE_ZOOM_SLIDER_MAX = 100;

function TimelineZoomIcon({ direction }: { direction: 'in' | 'out' }) {
  const Icon = direction === 'in' ? Plus : Minus;
  return (
    <Icon size={14} strokeWidth={2} className="shrink-0 text-[var(--sniptale-color-text-muted)]" />
  );
}

export function ProjectTimelineZoomControl({
  onPreviewSuspendedChange,
  pixelsPerSecond,
  visibleRangeSeconds,
  onZoomChange,
}: Pick<ProjectTimelineToolbarProps, 'pixelsPerSecond' | 'onZoomChange'> & {
  onPreviewSuspendedChange: (suspended: boolean) => void;
  visibleRangeSeconds: number;
}) {
  const visibleRangeSummary = formatTimelineVisibleRange(visibleRangeSeconds);
  const commitZoomValue = (value: number) => {
    onZoomChange(mapTimelineZoomSliderToPixelsPerSecond(value));
    onPreviewSuspendedChange(false);
  };

  return (
    <div className="flex h-7 min-w-0 items-center gap-1 px-1 text-[var(--sniptale-color-text-secondary)]">
      <span
        className={[
          '@max-[1360px]/timeline:hidden whitespace-nowrap text-[11px] font-medium',
          'text-[var(--sniptale-color-text-muted)]',
        ].join(' ')}
      >
        {translate('videoEditor.timeline.zoom')}
      </span>
      <TimelineZoomIcon direction="out" />
      <span className="flex w-28 shrink-0 @max-[900px]/timeline:w-14">
        <CompactRange
          aria-label={translate('videoEditor.timeline.zoom')}
          className="w-full"
          min={TIMELINE_ZOOM_SLIDER_MIN}
          max={TIMELINE_ZOOM_SLIDER_MAX}
          step={1}
          value={mapTimelinePixelsPerSecondToSliderValue(pixelsPerSecond)}
          onBlur={(event) => commitZoomValue(Number(event.currentTarget.value))}
          onChange={(event) => {
            onPreviewSuspendedChange(true);
            onZoomChange(mapTimelineZoomSliderToPixelsPerSecond(Number(event.currentTarget.value)));
          }}
          onKeyUp={(event) => commitZoomValue(Number(event.currentTarget.value))}
          onPointerCancel={() => onPreviewSuspendedChange(false)}
          onPointerUp={(event) => commitZoomValue(Number(event.currentTarget.value))}
        />
      </span>
      <TimelineZoomIcon direction="in" />
      <span
        className={[
          '@max-[1360px]/timeline:hidden min-w-[3rem] text-right text-[11px] font-medium',
          'text-[var(--sniptale-color-text-primary)]',
        ].join(' ')}
      >
        {visibleRangeSummary}
      </span>
    </div>
  );
}

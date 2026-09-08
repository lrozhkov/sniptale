import { translate } from '../../../../../platform/i18n';
import { CompactRange } from '../../../../../ui/compact-inspector-controls';
import {
  mapTimelinePixelsPerSecondToSliderValue,
  mapTimelineZoomSliderToPixelsPerSecond,
} from '../../interaction-state/zoom';
import type { ProjectTimelineToolbarProps } from '../types';

const TIMELINE_ZOOM_SLIDER_MIN = 0;
const TIMELINE_ZOOM_SLIDER_MAX = 100;

export function ProjectTimelineZoomControl({
  onPreviewSuspendedChange,
  pixelsPerSecond,
  onZoomChange,
}: Pick<ProjectTimelineToolbarProps, 'pixelsPerSecond' | 'onZoomChange'> & {
  onPreviewSuspendedChange: (suspended: boolean) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1 px-1 text-[var(--sniptale-color-text-secondary)]">
      <span className="flex w-[clamp(80px,10cqw,192px)] shrink-0">
        <CompactRange
          aria-label={translate('videoEditor.timeline.zoom')}
          title={translate('videoEditor.timeline.zoom')}
          className="w-full"
          min={TIMELINE_ZOOM_SLIDER_MIN}
          max={TIMELINE_ZOOM_SLIDER_MAX}
          step={1}
          value={mapTimelinePixelsPerSecondToSliderValue(pixelsPerSecond)}
          onBlur={() => onPreviewSuspendedChange(false)}
          onChange={(event) => {
            onPreviewSuspendedChange(true);
            onZoomChange(mapTimelineZoomSliderToPixelsPerSecond(Number(event.currentTarget.value)));
          }}
          onKeyUp={() => onPreviewSuspendedChange(false)}
          onPointerCancel={() => onPreviewSuspendedChange(false)}
          onPointerUp={() => onPreviewSuspendedChange(false)}
        />
      </span>
    </div>
  );
}

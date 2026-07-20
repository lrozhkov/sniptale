import type { TimelineTrackLayout } from '../../tracks/layout';
import type { TimelineClipDragGhost } from '../../types';

export function ProjectTimelineClipDragGhost({
  dragGhost,
  pixelsPerSecond,
  trackId,
  trackLayout,
}: {
  dragGhost: TimelineClipDragGhost | null;
  pixelsPerSecond: number;
  trackId: string;
  trackLayout: TimelineTrackLayout | undefined;
}) {
  if (!dragGhost || dragGhost.trackId !== trackId) {
    return null;
  }

  const metrics = resolveDragGhostLaneMetrics(trackLayout, dragGhost.timelineLaneId);
  const top = metrics ? metrics.clipTop + 8 : 8;
  const height = Math.max(22, (metrics?.clipRowHeight ?? 40) - 18);
  return (
    <div
      data-ui="video-editor.timeline.clip-drag-ghost"
      className={[
        'pointer-events-none absolute z-30 overflow-hidden rounded-[8px] border border-dashed',
        'border-[color:var(--sniptale-color-accent-emphasis)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_94%,transparent)]',
        'px-2 text-xs font-semibold text-[var(--sniptale-color-text-primary)] shadow-sm',
        'shadow-[0_4px_14px_color-mix(in_srgb,var(--sniptale-color-text-primary)_14%,transparent)]',
      ].join(' ')}
      style={{
        height,
        left: dragGhost.startTime * pixelsPerSecond,
        top,
        width: Math.max(52, dragGhost.duration * pixelsPerSecond),
      }}
    >
      <span className="block truncate leading-[22px]">{dragGhost.name}</span>
    </div>
  );
}

function resolveDragGhostLaneMetrics(
  trackLayout: TimelineTrackLayout | undefined,
  timelineLaneId: string | null
): {
  clipRowHeight: number;
  clipTop: number;
} | null {
  if (!trackLayout || !timelineLaneId) {
    return null;
  }

  const metrics = trackLayout.logicalLaneMetrics.get(timelineLaneId);
  if (metrics) {
    return {
      clipRowHeight: metrics.clipRowHeight,
      clipTop: metrics.clipTop,
    };
  }

  const rowIndex = parseLogicalLaneRowIndex(timelineLaneId);
  if (rowIndex === null) {
    return null;
  }
  return {
    clipRowHeight: trackLayout.trackBaseRowHeight,
    clipTop: rowIndex * trackLayout.logicalRowHeight,
  };
}

function parseLogicalLaneRowIndex(timelineLaneId: string): number | null {
  const match = /^line-(\d+)$/.exec(timelineLaneId);
  if (!match) {
    return null;
  }
  return Math.max(0, Number.parseInt(match[1]!, 10) - 1);
}

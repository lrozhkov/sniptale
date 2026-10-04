import { useState, type DragEvent } from 'react';
import { useMaterialDrag } from '../../../../chrome/material-drag';
import {
  getMaterialDropError,
  getMaterialDuration,
} from '../../../../project/state/insertion/material-plan';
import type { VideoProject } from '../../../../../features/video/project/types';
import type { TimelineTrackLayout } from '../../tracks/layout';
import type { TimelineProjection } from '../../interaction-state/projection';
import type { VideoEditorMaterialTarget } from '../../../../contracts/insertion';

/** Converts the visible lane geometry into the same exact target validated by the command. */
export function useTrackMaterialDrop(args: {
  project: VideoProject;
  trackId: string;
  trackLayout: TimelineTrackLayout | undefined;
  pixelsPerSecond: number;
  projection: TimelineProjection | undefined;
}) {
  const session = useMaterialDrag();
  const [hover, setHover] = useState<{ target: VideoEditorMaterialTarget; token: string } | null>(
    null
  );
  const resolve = (event: DragEvent<HTMLDivElement>): VideoEditorMaterialTarget => {
    const rect = event.currentTarget.getBoundingClientRect();
    const y = event.clientY - rect.top;
    const lane = [...(args.trackLayout?.logicalLaneMetrics.values() ?? [])].find(
      (metric) => y >= metric.rowTop && y < metric.rowTop + metric.rowHeight
    );
    const time =
      (args.projection?.startTime ?? 0) + (event.clientX - rect.left) / args.pixelsPerSecond;
    return {
      trackId: args.trackId,
      startTime: Math.max(0, Math.round(time * args.project.fps) / args.project.fps),
      timelineLaneId: lane?.logicalLaneId ?? '',
    };
  };
  const target = session.drag?.token === hover?.token ? hover?.target : null;
  const asset = args.project.assets.find((asset) => asset.id === session.drag?.assetId);
  const valid = Boolean(
    session.drag?.project === args.project &&
    target &&
    asset &&
    !getMaterialDropError(args.project, asset.id, target)
  );
  const metrics = target ? args.trackLayout?.logicalLaneMetrics.get(target.timelineLaneId) : null;
  const preview =
    valid && asset && target && metrics ? (
      <div
        aria-hidden="true"
        data-ui="timeline.material-drop-preview"
        className={[
          'pointer-events-none absolute z-40 rounded-sm border border-dashed',
          'border-[var(--sniptale-color-accent)]',
          'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent)_15%,transparent)]',
        ].join(' ')}
        style={{
          left: (target.startTime - (args.projection?.startTime ?? 0)) * args.pixelsPerSecond,
          width: getMaterialDuration(asset) * args.pixelsPerSecond,
          top: metrics.rowTop + 4,
          height: Math.max(8, metrics.rowHeight - 8),
        }}
      />
    ) : null;
  return {
    preview,
    onDragOver(event: DragEvent<HTMLDivElement>): boolean {
      if (!session.drag) return false;
      event.stopPropagation();
      const next = resolve(event);
      const allowed =
        session.accepts(event.dataTransfer) &&
        !getMaterialDropError(args.project, session.drag.assetId, next);
      event.dataTransfer.dropEffect = allowed ? 'copy' : 'none';
      if (allowed) event.preventDefault();
      setHover(allowed ? { target: next, token: session.drag.token } : null);
      return true;
    },
    onDragLeave(event: DragEvent<HTMLDivElement>) {
      if (
        !(event.relatedTarget instanceof Node) ||
        !event.currentTarget.contains(event.relatedTarget)
      )
        setHover(null);
    },
    onDrop(event: DragEvent<HTMLDivElement>): boolean {
      if (!session.drag) return false;
      event.preventDefault();
      event.stopPropagation();
      setHover(null);
      const next = resolve(event);
      if (
        session.accepts(event.dataTransfer, true) &&
        !getMaterialDropError(args.project, session.drag.assetId, next)
      )
        session.drop(next);
      return true;
    },
  };
}

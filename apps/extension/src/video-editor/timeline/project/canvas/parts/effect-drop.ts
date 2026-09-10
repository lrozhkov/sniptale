import type React from 'react';
import type { VideoProject, VideoProjectTrack } from '../../../../../features/video/project/types';
import {
  hasVideoEditorEffectDocumentDragType,
  readVideoEditorEffectDocumentDragPayload,
} from '../../../../contracts/effect-document-drag';
import type { ProjectTimelineProps } from '../../types';
import {
  timelineViewportXToTime,
  type TimelineProjection,
} from '../../interaction-state/projection';

export function createTrackEffectDropHandlers(args: {
  project: VideoProject;
  track: VideoProjectTrack;
  projection?: TimelineProjection | undefined;
  pixelsPerSecond: number;
  onDrop: ProjectTimelineProps['onDropEffectDocument'];
  resolveTimelineLaneId?: (event: React.DragEvent<HTMLDivElement>) => string | null;
  onHighlight(trackId: string | null): void;
}) {
  const editable =
    args.track.kind === 'PRIMARY' && !args.track.locked && args.track.role !== 'CAMERA';
  return {
    onDragOver(event: React.DragEvent<HTMLDivElement>): boolean {
      if (!hasVideoEditorEffectDocumentDragType(event.dataTransfer)) return false;
      event.stopPropagation();
      if (!editable || !args.onDrop) {
        event.dataTransfer.dropEffect = 'none';
        args.onHighlight(null);
        return true;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      args.onHighlight(args.track.id);
      return true;
    },
    onDrop(event: React.DragEvent<HTMLDivElement>): boolean {
      if (!hasVideoEditorEffectDocumentDragType(event.dataTransfer)) return false;
      event.preventDefault();
      event.stopPropagation();
      args.onHighlight(null);
      const payload = readVideoEditorEffectDocumentDragPayload(event.dataTransfer);
      if (!editable || !payload || !args.onDrop) return true;
      const x = event.clientX - event.currentTarget.getBoundingClientRect().left;
      const time = Math.max(
        0,
        args.projection ? timelineViewportXToTime(args.projection, x) : x / args.pixelsPerSecond
      );
      if (payload.kind === 'standalone') {
        args.onDrop(
          payload,
          { kind: 'scene' },
          time,
          args.track.id,
          args.resolveTimelineLaneId?.(event) ?? null
        );
      } else if (payload.kind === 'targetEffect') {
        const element =
          event.target instanceof Element
            ? event.target.closest('[data-project-timeline-clip]')
            : null;
        const clip = args.project.clips.find(
          (clip) =>
            clip.id === element?.getAttribute('data-project-timeline-clip') &&
            clip.trackId === args.track.id
        );
        if (clip && clip.type !== 'AUDIO' && clip.type !== 'EFFECT')
          args.onDrop(payload, { kind: 'clip', clipId: clip.id }, clip.startTime);
      }
      return true;
    },
  };
}

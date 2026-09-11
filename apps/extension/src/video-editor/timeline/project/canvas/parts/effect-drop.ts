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
  dragKind?: string | undefined;
  header?: boolean;
  project: VideoProject;
  track: VideoProjectTrack;
  projection?: TimelineProjection | undefined;
  pixelsPerSecond: number;
  onDrop: ProjectTimelineProps['onDropEffectDocument'];
  resolveTimelineLaneId?: (event: React.DragEvent<HTMLDivElement>) => string | null;
  onHighlight(trackId: string | null, clipId?: string | null): void;
}) {
  const editable =
    args.track.kind === 'PRIMARY' && !args.track.locked && args.track.role !== 'CAMERA';
  const resolveClip = (event: React.DragEvent<HTMLDivElement>) => {
    if (args.header) return undefined;
    const element =
      event.target instanceof Element ? event.target.closest('[data-project-timeline-clip]') : null;
    return args.project.clips.find(
      (clip) =>
        clip.id === element?.getAttribute('data-project-timeline-clip') &&
        clip.trackId === args.track.id &&
        clip.type !== 'AUDIO'
    );
  };
  return {
    onDragOver(event: React.DragEvent<HTMLDivElement>): boolean {
      if (!hasVideoEditorEffectDocumentDragType(event.dataTransfer)) return false;
      event.stopPropagation();
      if (
        !editable ||
        !args.onDrop ||
        args.dragKind === 'transition' ||
        (args.header && args.dragKind !== 'targetEffect')
      ) {
        event.dataTransfer.dropEffect = 'none';
        args.onHighlight(null);
        return true;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      args.onHighlight(
        args.track.id,
        args.dragKind === 'targetEffect' ? (resolveClip(event)?.id ?? null) : null
      );
      return true;
    },
    onDrop(event: React.DragEvent<HTMLDivElement>): boolean {
      if (!hasVideoEditorEffectDocumentDragType(event.dataTransfer)) return false;
      event.preventDefault();
      event.stopPropagation();
      args.onHighlight(null);
      const payload = readVideoEditorEffectDocumentDragPayload(event.dataTransfer);
      if (!editable || !payload || !args.onDrop || (args.header && payload.kind !== 'targetEffect'))
        return true;
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
        const clip = resolveClip(event);
        if (clip) args.onDrop(payload, { kind: 'clip', clipId: clip.id }, clip.startTime);
        else args.onDrop(payload, { kind: 'track', trackId: args.track.id }, time);
      }
      return true;
    },
  };
}

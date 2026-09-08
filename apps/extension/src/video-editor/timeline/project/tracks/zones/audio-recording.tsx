import { useContext } from 'react';
import { Mic } from 'lucide-react';
import { translate } from '../../../../../platform/i18n';
import type { VideoProject } from '../../../../../features/video/project/types';
import {
  isAudioRecordingRangeAvailable,
  buildVideoEditorTrackGapCandidates,
} from '../../../../project/operations/timeline-gaps';
import {
  WorkspaceDialogsContext,
  WorkspacePlaybackRangeContext,
} from '../../../../runtime/controller/composition/contexts';
import {
  projectTimelineInterval,
  type TimelineProjection,
} from '../../interaction-state/projection';
import { TIMELINE_OBJECT_MARKER_PROPS } from '../../canvas/hover-preview';

export function AudioRecordingZones(props: {
  project: VideoProject;
  trackId: string;
  pixelsPerSecond: number;
  projection?: TimelineProjection | undefined;
}) {
  const dialogs = useContext(WorkspaceDialogsContext);
  const ranges = useContext(WorkspacePlaybackRangeContext);
  if (!dialogs || !ranges) return null;
  const selected = ranges.playbackRange;
  const selectedAvailable =
    selected &&
    isAudioRecordingRangeAvailable(props.project, props.trackId, selected.start, selected.end);
  const candidates = selectedAvailable
    ? [selected]
    : buildVideoEditorTrackGapCandidates(props.project, props.trackId);
  return candidates
    .filter((range) =>
      isAudioRecordingRangeAvailable(props.project, props.trackId, range.start, range.end)
    )
    .map((range) => {
      const geometry = props.projection
        ? projectTimelineInterval(props.projection, range.start, range.end)
        : {
            left: range.start * props.pixelsPerSecond,
            width: (range.end - range.start) * props.pixelsPerSecond,
          };
      if (!geometry) return null;
      return (
        <div
          key={`${range.start}:${range.end}`}
          className={[
            'pointer-events-none absolute inset-y-1 z-10 flex items-center justify-center opacity-0',
            'group-hover/audio:opacity-100 focus-within:opacity-100',
          ].join(' ')}
          style={{ left: geometry.left, width: geometry.width }}
        >
          <button
            {...TIMELINE_OBJECT_MARKER_PROPS}
            type="button"
            data-ui="video-editor.timeline.record-range"
            className={[
              'pointer-events-auto ml-14 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border',
              'border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]',
              'text-[var(--sniptale-color-text-primary)]',
            ].join(' ')}
            title={translate('videoEditor.app.recordAudioButton')}
            aria-label={translate('videoEditor.app.recordAudioButton')}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              dialogs.openTrackAudioRecordingDialog({
                projectId: props.project.id,
                trackId: props.trackId,
                startTime: range.start,
                endTime: range.end,
              });
            }}
          >
            <Mic size={15} aria-hidden="true" />
          </button>
        </div>
      );
    });
}

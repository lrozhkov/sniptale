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

type RecordingRange = { start: number; end: number };

function RecordingButton(props: { project: VideoProject; trackId: string; range: RecordingRange }) {
  const dialogs = useContext(WorkspaceDialogsContext);
  if (!dialogs) return null;
  return (
    <button
      {...TIMELINE_OBJECT_MARKER_PROPS}
      type="button"
      data-ui="video-editor.timeline.record-range"
      className={[
        'pointer-events-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
        'bg-[var(--sniptale-color-surface-panel)] text-[var(--sniptale-color-text-primary)]',
        'hover:bg-[var(--sniptale-color-surface-hover)]',
      ].join(' ')}
      title={translate('videoEditor.app.recordAudioMicrophone')}
      aria-label={translate('videoEditor.app.recordAudioMicrophone')}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        dialogs.openTrackAudioRecordingDialog({
          projectId: props.project.id,
          trackId: props.trackId,
          startTime: props.range.start,
          endTime: props.range.end,
        });
      }}
    >
      <Mic size={15} aria-hidden="true" />
    </button>
  );
}

export function AudioGapRecordingAction(props: {
  project: VideoProject;
  trackId: string;
  range: RecordingRange;
}) {
  const ranges = useContext(WorkspacePlaybackRangeContext);
  const selected = ranges?.playbackRange;
  const range =
    selected &&
    selected.start >= props.range.start &&
    selected.end <= props.range.end &&
    isAudioRecordingRangeAvailable(props.project, props.trackId, selected.start, selected.end)
      ? selected
      : props.range;
  if (!isAudioRecordingRangeAvailable(props.project, props.trackId, range.start, range.end))
    return null;
  return <RecordingButton {...props} range={range} />;
}

export function AudioRecordingZones(props: {
  project: VideoProject;
  trackId: string;
  pixelsPerSecond: number;
  projection?: TimelineProjection | undefined;
}) {
  const ranges = useContext(WorkspacePlaybackRangeContext);
  const selected = ranges?.playbackRange;
  if (
    !selected ||
    !isAudioRecordingRangeAvailable(props.project, props.trackId, selected.start, selected.end)
  )
    return null;
  // Existing gaps own their complete action group. Only an otherwise empty range needs a separate affordance.
  if (
    buildVideoEditorTrackGapCandidates(props.project, props.trackId).some(
      (gap) => selected.start >= gap.start && selected.end <= gap.end
    )
  )
    return null;
  const geometry = props.projection
    ? projectTimelineInterval(props.projection, selected.start, selected.end)
    : {
        left: selected.start * props.pixelsPerSecond,
        width: (selected.end - selected.start) * props.pixelsPerSecond,
      };
  if (!geometry) return null;
  return (
    <div
      className={[
        'pointer-events-none absolute inset-y-1 z-20 flex items-center justify-center opacity-0',
        'group-hover/audio:opacity-100 focus-within:opacity-100',
      ].join(' ')}
      style={{ left: geometry.left, width: geometry.width }}
    >
      <RecordingButton project={props.project} trackId={props.trackId} range={selected} />
    </div>
  );
}

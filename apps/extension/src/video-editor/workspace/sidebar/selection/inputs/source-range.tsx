import { translate } from '../../../../../platform/i18n';
import { NumericRow } from '../../../../../ui/compact-inspector-controls';
import {
  areProjectClipsEditable,
  getLinkedClipIds,
} from '../../../../../features/video/project/timeline';
import { normalizeClipPlaybackRate } from '../../../../../features/video/project/timeline/basics';
import type { VideoProject } from '../../../../../features/video/project/types';
import type { VideoEditorProjectActions } from '../../../../contracts/commands/project';
import {
  isSourceTimedClip,
  type SourceTimedClip,
} from '../../../../project/operations/source-timed-clips';
import {
  trimProjectClipStart,
  trimProjectClipEnd,
} from '../../../../project/state/clip-timeline/mutations';

type SourceRangeProps = {
  project: VideoProject;
  clip: SourceTimedClip;
  locked: boolean;
  onTrimClipStart: VideoEditorProjectActions['trimClipStart'];
  onTrimClipEnd: VideoEditorProjectActions['trimClipEnd'];
};
type Edge = 'start' | 'end';
const SOURCE_TIME_PRECISION = 3;

export function ClipSourceRangeControls(props: SourceRangeProps) {
  const disabled =
    props.locked ||
    !areProjectClipsEditable(props.project, getLinkedClipIds(props.project, props.clip.id));
  return (
    <div
      data-ui="video-editor.inspector.source-range"
      title={translate('videoEditor.sidebar.sourceRangeHint')}
    >
      <SourceBoundaryField {...props} edge="start" disabled={disabled} />
      <SourceBoundaryField {...props} edge="end" disabled={disabled} />
    </div>
  );
}

function SourceBoundaryField(props: SourceRangeProps & { edge: Edge; disabled: boolean }) {
  const value = sourceBoundary(props.clip, props.edge);
  const normalizeValue = (requested: number) => {
    if (!Number.isFinite(requested)) return value;
    // Re-entering the rounded display must preserve the exact frame-derived boundary.
    if (requested === Number(value.toFixed(SOURCE_TIME_PRECISION))) return value;
    const time = projectBoundary(props.clip, props.edge, requested);
    const mutate = props.edge === 'start' ? trimProjectClipStart : trimProjectClipEnd;
    const next = mutate(props.project, props.clip.id, time).clips.find(
      (clip) => clip.id === props.clip.id
    );
    return next && isSourceTimedClip(next) ? sourceBoundary(next, props.edge) : value;
  };
  const commit = (next: number) => {
    if (Math.abs(next - value) < 0.000001) return;
    const trim = props.edge === 'start' ? props.onTrimClipStart : props.onTrimClipEnd;
    trim(props.clip.id, projectBoundary(props.clip, props.edge, next));
  };
  return (
    <NumericRow
      appearance="plain"
      className="min-h-8! py-0! grid-cols-[minmax(0,1fr)_auto]!"
      label={translate(
        props.edge === 'start' ? 'videoEditor.sidebar.sourceIn' : 'videoEditor.sidebar.sourceOut'
      )}
      value={value}
      unit="s"
      step={0.01}
      precision={SOURCE_TIME_PRECISION}
      disabled={props.disabled}
      normalizeValue={normalizeValue}
      onPreviewValue={() => undefined}
      onCommitValue={commit}
    />
  );
}

function sourceBoundary(clip: SourceTimedClip, edge: Edge): number {
  return clip.sourceStart + (edge === 'end' ? clip.sourceDuration : 0);
}

function projectBoundary(clip: SourceTimedClip, edge: Edge, sourceTime: number): number {
  const current = clip.startTime + (edge === 'end' ? clip.duration : 0);
  return (
    current +
    (sourceTime - sourceBoundary(clip, edge)) / normalizeClipPlaybackRate(clip.playbackRate ?? 1)
  );
}

import { interpolateCursorSample } from '../../../../features/video/composition/timeline/frame/cursor';
import { normalizeClipPlaybackRate } from '../../../../features/video/project/timeline/basics';
import type {
  VideoProject,
  VideoProjectCursorSample,
  VideoProjectSourceTimeAnchor,
} from '../../../../features/video/project/types';
import { VideoCursorCaptureMode } from '../../../../features/video/project/types';
import type { SourceTimedClip } from '../../operations/source-timed-anchor-projection';
import { isSourceTimedClip } from '../../operations/source-timed-clips';

/** Opens a cursor-free interval while retaining both parts of the original motion curve. */
export function insertMaterialCursorGap(
  previousProject: VideoProject,
  project: VideoProject,
  time: number,
  duration: number,
  trailingClipIdsBySourceId: ReadonlyMap<string, string>
): VideoProject {
  const track = project.cursorTrack;
  const previousTrack = previousProject.cursorTrack;
  if (!track || !previousTrack) return project;
  const samples = track.samples.map((sample) =>
    !sample.sourceAnchor && sample.time >= time
      ? { ...sample, time: sample.time + duration, timeBasis: 'project' as const }
      : sample
  );
  const previous = previousTrack.samples.filter((sample) => sample.time < time).at(-1);
  const next = previousTrack.samples.find((sample) => sample.time >= time);
  const result = { ...project, cursorTrack: { ...track, samples } };
  if (!previous) return result;
  const owner =
    previous.sourceAnchor &&
    previousProject.clips.find(({ id }) => id === previous.sourceAnchor?.sourceClipId);
  if (
    previous.sourceAnchor &&
    (!owner ||
      !isSourceTimedClip(owner) ||
      time < owner.startTime ||
      time > owner.startTime + owner.duration)
  )
    return result;
  const boundary =
    next && track.captureMode === VideoCursorCaptureMode.SEPARATE
      ? interpolateCursorSample(previous, next, time)
      : { ...previous, time };
  const hidden = bindCursorBoundary(
    { ...boundary, id: crypto.randomUUID(), time, visible: false },
    owner && isSourceTimedClip(owner) ? owner : undefined,
    previous.sourceAnchor
  );
  delete hidden.interpolationRange;
  samples.push(hidden);
  const tailId =
    previous.sourceAnchor && trailingClipIdsBySourceId.get(previous.sourceAnchor.sourceClipId);
  const tail = project.clips.find(({ id }) => id === tailId);
  const restore = bindCursorBoundary(
    { ...boundary, id: crypto.randomUUID(), time: time + duration },
    tail && isSourceTimedClip(tail) ? tail : undefined,
    previous.sourceAnchor
  );
  if (next && next.time > time && track.captureMode === VideoCursorCaptureMode.SEPARATE) {
    retainCursorCurve(samples, previous, next, restore, time);
  }
  if (next?.time !== time && (!previous.sourceAnchor || tail)) samples.push(restore);
  samples.sort((left, right) => left.time - right.time);
  return result;
}

function bindCursorBoundary(
  sample: VideoProjectCursorSample,
  owner: SourceTimedClip | undefined,
  anchor: VideoProjectSourceTimeAnchor | undefined
): VideoProjectCursorSample {
  if (anchor && owner) {
    sample.sourceAnchor = {
      ...anchor,
      sourceClipId: owner.id,
      sourceTime:
        owner.sourceStart +
        (sample.time - owner.startTime) * normalizeClipPlaybackRate(owner.playbackRate ?? 1),
    };
    delete sample.timeBasis;
  } else {
    delete sample.sourceAnchor;
    sample.timeBasis = 'project';
  }
  return sample;
}

function retainCursorCurve(
  samples: VideoProjectCursorSample[],
  previous: VideoProjectCursorSample,
  next: VideoProjectCursorSample,
  restore: VideoProjectCursorSample,
  time: number
): void {
  const range = previous.interpolationRange ?? { start: 0, end: 1 };
  const split =
    range.start +
    ((time - previous.time) / (next.time - previous.time)) * (range.end - range.start);
  const index = samples.findIndex((sample) => sample.id === previous.id);
  if (index >= 0)
    samples[index] = { ...samples[index]!, interpolationRange: { ...range, end: split } };
  restore.interpolationRange = { ...range, start: split };
}

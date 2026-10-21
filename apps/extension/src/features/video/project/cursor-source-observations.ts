import { MAX_VIDEO_PROJECT_ITEMS } from './validation/primitives';
import type { VideoProject, VideoProjectCursorSample, VideoProjectVideoClip } from './types';
import { recordingIdForProjectAsset } from './source-interactions';

/** Source observations belong to a live recording instance, including its trimmed-away source. */
export function hasValidVideoProjectCursorSourceObservations(project: VideoProject): boolean {
  const groups = project.cursorTrack?.sourceObservations ?? [];
  if (!groups.length) return true;
  const clips = new Map(project.clips.map((clip) => [clip.id, clip]));
  let maximumProjected = 0;
  const valid = groups.every((group) => {
    const owners = project.clips.filter(
      (clip): clip is VideoProjectVideoClip =>
        clip.type === 'VIDEO' && clip.sourceInstanceId === group.sourceInstanceId
    );
    if (!owners.length || new Set(owners.map((clip) => clip.assetId)).size !== 1) return false;
    maximumProjected += (group.samples.length + 2) * owners.length;
    const asset = project.assets.find((item) => item.id === owners[0]!.assetId);
    const duration = asset?.metadata.duration;
    return (
      recordingIdForProjectAsset(asset) === group.recordingId &&
      typeof duration === 'number' &&
      Number.isFinite(duration) &&
      duration > 0 &&
      group.samples.every((sample) => sample.time <= duration)
    );
  });
  if (!valid) return false;
  let projected = 0;
  let manual = 0;
  for (const sample of project.cursorTrack?.samples ?? []) {
    const clip = sample.sourceAnchor && clips.get(sample.sourceAnchor.sourceClipId);
    const grouped =
      clip?.type === 'VIDEO' &&
      groups.some(
        (group) =>
          group.sourceInstanceId === clip.sourceInstanceId &&
          group.recordingId === sample.sourceAnchor?.recordingId
      );
    if (grouped) projected++;
    else manual++;
  }
  // Source projections inherit the admitted full recording size. Manual authoring keeps its existing budget.
  return projected <= maximumProjected && manual <= MAX_VIDEO_PROJECT_ITEMS;
}

function observed(sample: VideoProjectCursorSample) {
  return (
    sample.visible &&
    sample.recordingPoint !== undefined &&
    sample.recordingPoint !== null &&
    (sample.observation === undefined || sample.observation === 'observed')
  );
}

/** Capture observations are linear facts; preferred focus smoothing has a separate owner. */
function sourceBoundarySample(
  samples: readonly VideoProjectCursorSample[],
  time: number
): VideoProjectCursorSample | null {
  const index = samples.findLastIndex((sample) => sample.time <= time);
  const previous = samples[index];
  if (!previous) return null;
  if (previous.time === time) return previous;
  const next = samples[index + 1];
  if (
    !observed(previous) ||
    !next ||
    !observed(next) ||
    previous.captureSegment !== next.captureSegment ||
    previous.observationClockId !== next.observationClockId
  )
    return { ...previous, time };
  const progress = (time - previous.time) / (next.time - previous.time);
  return {
    ...previous,
    time,
    x: previous.x + (next.x - previous.x) * progress,
    y: previous.y + (next.y - previous.y) * progress,
    ...(previous.recordingPoint === undefined
      ? {}
      : {
          recordingPoint:
            previous.recordingPoint && next.recordingPoint
              ? {
                  x:
                    previous.recordingPoint.x +
                    (next.recordingPoint.x - previous.recordingPoint.x) * progress,
                  y:
                    previous.recordingPoint.y +
                    (next.recordingPoint.y - previous.recordingPoint.y) * progress,
                }
              : previous.recordingPoint,
        }),
  };
}

/** Project full captured facts into ordinary per-clip samples without modifying the source groups. */
export function materializeVideoProjectCursorSourceObservations(
  project: VideoProject,
  inheritedClips?: ReadonlyMap<string, VideoProjectVideoClip>
): VideoProject['cursorTrack'] {
  const track = project.cursorTrack;
  const groups = track?.sourceObservations;
  if (!track || !groups?.length) return track;
  const clips = new Map(project.clips.map((clip) => [clip.id, clip]));
  const previousSamples = new Map(track.samples.map((sample) => [sample.id, sample]));
  const samples = track.samples.filter((sample) => {
    if (!sample.sourceAnchor) return true;
    const clip = clips.get(sample.sourceAnchor.sourceClipId);
    if (!clip) return false;
    return !groups.some(
      (group) =>
        group.recordingId === sample.sourceAnchor?.recordingId &&
        clip.type === 'VIDEO' &&
        clip.sourceInstanceId === group.sourceInstanceId
    );
  });
  for (const group of groups) {
    for (const clip of project.clips) {
      if (
        clip.type !== 'VIDEO' ||
        clip.sourceInstanceId !== group.sourceInstanceId ||
        recordingIdForProjectAsset(project.assets.find((asset) => asset.id === clip.assetId)) !==
          group.recordingId
      )
        continue;
      const start = clip.sourceStart;
      const end = clip.sourceStart + clip.sourceDuration;
      const retained = group.samples
        .filter((sample) => sample.time >= start && sample.time <= end)
        .map((sample) => ({ sample, key: `sample:${sample.id}` }));
      for (const time of [start, end]) {
        if (retained.some(({ sample }) => sample.time === time)) continue;
        const boundary = sourceBoundarySample(group.samples, time);
        if (boundary) retained.push({ sample: boundary, key: `boundary:${time}` });
      }
      for (const { sample, key } of retained) {
        const {
          interpolationRange: _range,
          sourceAnchor: _anchor,
          timeBasis: _basis,
          ...raw
        } = sample;
        const id = JSON.stringify([group.sourceInstanceId, key, clip.id]);
        const inherited = inheritedClips?.get(clip.id);
        // Explicit split/copy lineage preserves placement edits without mixing independent uses.
        const previous =
          previousSamples.get(id) ??
          (inherited
            ? previousSamples.get(JSON.stringify([inherited.sourceInstanceId, key, inherited.id]))
            : undefined);
        samples.push({
          ...raw,
          ...(previous && 'skinOverride' in previous
            ? { skinOverride: previous.skinOverride }
            : {}),
          id,
          time: clip.startTime + (sample.time - clip.sourceStart) / (clip.playbackRate ?? 1),
          interpolation: previous?.interpolation ?? 'LINEAR',
          sourceAnchor: {
            kind: 'recording-source',
            recordingId: group.recordingId,
            sourceClipId: clip.id,
            sourceTime: sample.time,
          },
        });
      }
    }
  }
  return {
    ...track,
    samples: samples.toSorted((a, b) => a.time - b.time || a.id.localeCompare(b.id)),
  };
}

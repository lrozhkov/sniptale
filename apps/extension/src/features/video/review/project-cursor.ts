import { isCursorTrack } from '../project/validation/interaction';
import { isRecord } from '../project/validation/primitives';
import type {
  VideoProject,
  VideoProjectCursorTrack,
  VideoProjectVideoClip,
} from '../project/types';

/** Admit captured full-source facts before their ordinary timeline samples are materialized. */
export function planReviewProjectCursor(args: {
  seed: VideoProject;
  video: VideoProjectVideoClip;
  recordingId: string | null | undefined;
  sourceInstanceId: string;
}): { status: 'prepared'; track: VideoProjectCursorTrack | null } | { status: 'blocked' } {
  const track = args.seed.cursorTrack;
  if (track === null) return { status: 'prepared', track: null };
  const recordingId = args.recordingId;
  if (
    !isRecord(track) ||
    !Array.isArray(track.samples) ||
    !recordingId ||
    track.sourceObservations !== undefined ||
    Object.keys(track).some(
      (key) => !['captureMode', 'skin', 'samples', 'sourceObservations'].includes(key)
    ) ||
    !isCursorTrack({ ...track, samples: [] })
  )
    return { status: 'blocked' };
  const duration = args.seed.assets.find((asset) => asset.id === args.video.assetId)?.metadata
    .duration;
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0)
    return { status: 'blocked' };
  const ids = new Set<string>();
  for (const sample of track.samples) {
    if (!isRecord(sample)) return { status: 'blocked' };
    const anchor = sample.sourceAnchor;
    if (
      !isRecord(anchor) ||
      anchor.kind !== 'recording-source' ||
      anchor.recordingId !== recordingId ||
      anchor.sourceClipId !== args.video.id ||
      anchor.sourceTime !== sample.time ||
      sample.time < 0 ||
      sample.timeBasis !== undefined ||
      sample.interpolationRange !== undefined ||
      (sample.interpolation !== undefined && sample.interpolation !== 'LINEAR') ||
      (sample.skinOverride !== undefined && sample.skinOverride !== null) ||
      ids.has(sample.id)
    )
      return { status: 'blocked' };
    ids.add(sample.id);
  }
  const prepared: VideoProjectCursorTrack = {
    captureMode: track.captureMode,
    // Gallery does not paint an independent pointer. Preserve the captured skin as dormant controls.
    skin: { ...structuredClone(track.skin), hidden: true },
    samples: [],
    sourceObservations: [
      {
        recordingId,
        sourceInstanceId: args.sourceInstanceId,
        samples: track.samples.map((sample) => {
          const { sourceAnchor, timeBasis: _basis, ...fact } = structuredClone(sample);
          return { ...fact, time: sourceAnchor!.sourceTime };
        }),
      },
    ],
  };
  return isCursorTrack(prepared) ? { status: 'prepared', track: prepared } : { status: 'blocked' };
}

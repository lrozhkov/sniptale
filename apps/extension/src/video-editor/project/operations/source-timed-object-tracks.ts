import { mapProjectTimeToSourcePoint } from '../../../features/video/project/timeline/source-time';
import type {
  VideoObjectTrack,
  VideoObjectTrackAnalysisMetadata,
} from '../../../features/video/project/object-tracks';
import type { VideoProject } from '../../../features/video/project/types/model';
import { projectSourceTimeAnchor, type SourceTimedClip } from './source-timed-anchor-projection';

interface ObjectTrackSourceProjection {
  sourceClipId: string;
  time: number;
}

interface SourceBoundObjectTrackReconciliationParams {
  nextClips: SourceTimedClip[];
  nextProject: VideoProject;
  previousClips: SourceTimedClip[];
  previousProject: VideoProject;
  recordingId: string;
}

export function reconcileSourceBoundObjectTracks(
  params: SourceBoundObjectTrackReconciliationParams
): VideoProject['objectTracks'] {
  if (
    params.nextProject.objectTracks !== params.previousProject.objectTracks ||
    params.nextProject.objectTracks === undefined
  ) {
    return params.nextProject.objectTracks;
  }

  return params.nextProject.objectTracks.flatMap((track) => {
    const analysis = track.analysis;
    if (!analysis) {
      return [track];
    }
    const projector = createObjectTrackTimeProjector(
      analysis,
      params.nextClips,
      params.previousClips,
      params.recordingId
    );
    if (!projector) {
      return [track];
    }

    const projectedTrack = projectSourceBoundObjectTrack(track, analysis, projector);
    return projectedTrack ? [projectedTrack] : [];
  });
}

function createObjectTrackTimeProjector(
  analysis: VideoObjectTrackAnalysisMetadata,
  nextClips: SourceTimedClip[],
  previousClips: SourceTimedClip[],
  recordingId: string
) {
  const previousAssetClips = previousClips.filter(
    (clip) => clip.assetId === analysis.sourceAssetId
  );
  if (previousAssetClips.length === 0) {
    return null;
  }

  return (time: number) => {
    const previousPoint = mapProjectTimeToSourcePoint(
      previousAssetClips,
      time,
      analysis.sourceClipId
    );
    if (!previousPoint) {
      return null;
    }

    const projection = projectSourceTimeAnchor(
      {
        kind: 'recording-source',
        recordingId,
        sourceClipId: previousPoint.clipId,
        sourceTime: previousPoint.sourceTime,
      },
      recordingId,
      previousClips,
      nextClips
    );
    return projection
      ? { sourceClipId: projection.anchor.sourceClipId, time: projection.time }
      : null;
  };
}

function projectSourceBoundObjectTrack(
  track: VideoObjectTrack,
  analysis: VideoObjectTrackAnalysisMetadata,
  projectTime: (time: number) => ObjectTrackSourceProjection | null
): VideoObjectTrack | null {
  const projectedSamples = projectTimedValues(track.samples, projectTime);
  if (projectedSamples.length === 0) {
    return null;
  }

  const samples = projectedSamples.map(({ value }) => value);
  const correctionAnchors = track.correctionAnchors
    ? projectTimedValues(track.correctionAnchors, projectTime).map(({ value }) => value)
    : undefined;
  return {
    ...track,
    analysis: {
      ...analysis,
      projectEndTime: samples.at(-1)!.time,
      projectStartTime: samples[0]!.time,
      sourceClipId: projectedSamples[0]!.sourceClipId,
    },
    ...(correctionAnchors === undefined ? {} : { correctionAnchors }),
    samples,
  };
}

function projectTimedValues<T extends { time: number }>(
  values: T[],
  projectTime: (time: number) => ObjectTrackSourceProjection | null
) {
  return values
    .flatMap((value) => {
      const projection = projectTime(value.time);
      return projection
        ? [{ sourceClipId: projection.sourceClipId, value: { ...value, time: projection.time } }]
        : [];
    })
    .sort((left, right) => left.value.time - right.value.time);
}

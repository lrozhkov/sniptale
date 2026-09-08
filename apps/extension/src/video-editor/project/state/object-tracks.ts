import type { VideoProject } from '../../../features/video/project/types/model';
import { applyVideoProjectMutationPatch } from '../../../features/video/project/mutation';
import {
  normalizeVideoObjectTrack,
  type VideoObjectTrack,
  type VideoObjectTrackCorrectionAnchor,
  type VideoObjectTrackSample,
} from '../../../features/video/project/object-tracks';
import { createObjectTrackAnchorPlacementMode } from '../selection/placement';
import type { VideoEditorProjectSliceSet } from './contracts';
import { applyProjectUpdate } from './helpers';

type VideoEditorStoreSet = VideoEditorProjectSliceSet;

export function createObjectTrackUpserter(set: VideoEditorStoreSet) {
  return (track: VideoObjectTrack) =>
    set((state) =>
      applyProjectUpdate(state, (project) => {
        const normalizedTrack = normalizeVideoObjectTrack(track);
        const tracks = project.objectTracks ?? [];
        const exists = tracks.some((item) => item.id === normalizedTrack.id);

        return applyVideoProjectMutationPatch(project, {
          objectTracks: exists
            ? tracks.map((item) => (item.id === normalizedTrack.id ? normalizedTrack : item))
            : [...tracks, normalizedTrack],
        });
      })
    );
}

export function createObjectTrackDeleter(set: VideoEditorStoreSet) {
  return (trackId: string) =>
    set((state) =>
      applyProjectUpdate(state, (project) =>
        applyVideoProjectMutationPatch(project, {
          objectTracks: (project.objectTracks ?? []).filter((track) => track.id !== trackId),
        })
      )
    );
}

export function createObjectTrackCorrectionAnchorUpserter(set: VideoEditorStoreSet) {
  return (
    trackId: string,
    anchorInput: Omit<VideoObjectTrackCorrectionAnchor, 'id'> & { id?: string }
  ) =>
    set((state) =>
      applyProjectUpdate(state, (project) => {
        const tracks = project.objectTracks ?? [];
        const track = tracks.find((item) => item.id === trackId);
        if (!track) {
          return project;
        }

        const sourceClipId = resolveCorrectionSourceClipId(project, track, anchorInput.time);
        if (track.analysis && !sourceClipId) return project;

        const anchor: VideoObjectTrackCorrectionAnchor = {
          ...anchorInput,
          ...(sourceClipId === undefined ? {} : { sourceClipId }),
          confidence: anchorInput.confidence ?? 1,
          id: anchorInput.id ?? crypto.randomUUID(),
        };
        const samples = upsertSampleAtAnchor(track.samples, anchor);
        const correctionAnchors = upsertAnchor(track.correctionAnchors ?? [], anchor);
        const normalizedTrack = normalizeVideoObjectTrack({
          ...track,
          correctionAnchors,
          samples,
        });

        return applyVideoProjectMutationPatch(project, {
          objectTracks: tracks.map((item) => (item.id === trackId ? normalizedTrack : item)),
        });
      })
    );
}

export function createObjectTrackAnchorPlacementStarter(set: VideoEditorStoreSet) {
  return (objectTrackId: string) =>
    set((state) =>
      state.project?.objectTracks?.some((track) => track.id === objectTrackId)
        ? { placementMode: createObjectTrackAnchorPlacementMode(objectTrackId) }
        : {}
    );
}

function upsertAnchor(
  anchors: VideoObjectTrackCorrectionAnchor[],
  anchor: VideoObjectTrackCorrectionAnchor
): VideoObjectTrackCorrectionAnchor[] {
  return anchors.some((item) => item.id === anchor.id)
    ? anchors.map((item) => (item.id === anchor.id ? anchor : item))
    : [...anchors, anchor];
}

function upsertSampleAtAnchor(
  samples: VideoObjectTrack['samples'],
  anchor: VideoObjectTrackCorrectionAnchor
): VideoObjectTrack['samples'] {
  const sample: VideoObjectTrackSample = {
    ...(anchor.sourceClipId === undefined ? {} : { sourceClipId: anchor.sourceClipId }),
    confidence: anchor.confidence ?? 1,
    time: anchor.time,
    visible: true,
    x: anchor.x,
    y: anchor.y,
    ...(anchor.height === undefined ? {} : { height: anchor.height }),
    ...(anchor.width === undefined ? {} : { width: anchor.width }),
  };
  const matchesTime = (time: number) => Math.abs(time - anchor.time) <= 0.001;

  return samples.some((item) => matchesTime(item.time))
    ? samples.map((item) => (matchesTime(item.time) ? sample : item))
    : [...samples, sample];
}

function resolveCorrectionSourceClipId(
  project: VideoProject,
  track: VideoObjectTrack,
  time: number
): string | undefined {
  if (!track.analysis) return undefined;
  const ownerIds = new Set([
    track.analysis.sourceClipId,
    ...track.samples.map((sample) => sample.sourceClipId),
    ...(track.correctionAnchors ?? []).map((anchor) => anchor.sourceClipId),
  ]);
  return project.clips
    .filter(
      (clip) =>
        'assetId' in clip &&
        clip.assetId === track.analysis!.sourceAssetId &&
        ownerIds.has(clip.id) &&
        time >= clip.startTime &&
        time <= clip.startTime + clip.duration
    )
    .sort((left, right) => right.startTime - left.startTime)[0]?.id;
}

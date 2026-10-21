import { hasCurrentOriginalAudioTargets } from '../timeline/original-audio';
import { isVideoProjectClip } from '../validation/clips';
import { applyVideoProjectMutationPatch } from '../mutation';
import type { VideoProject } from '../types/model';
import {
  addReviewTextFragment,
  createReviewCaptionSettings,
  createReviewTextDocument,
} from '../../review/text-document';
import { getMediaClipSourceTime } from '../timeline/rate';
import { isTextSourceClip } from './projection';
import type { VideoProjectTextDocument } from './types';
import { parseVideoProjectTextDocuments } from './validation';
import { createAudioClipFromAsset } from '../factories/clip';
import { createVideoProjectTrack } from '../factories/creation';
import { VideoTrackKind } from '../types/layout';
import type { VideoProjectAsset } from '../types/model';
import { isVideoProjectAsset } from '../validation/assets';
import { MAX_VIDEO_PROJECT_DURATION_SECONDS } from '../validation/primitives';
import { DEFAULT_LOGICAL_LANE_ID } from '../timeline/logical-lanes';
import { parseVideoProjectVoiceTextSnapshot } from './voice-take';
import type { VideoProjectVoiceTextSnapshot } from './types';

/** An explicit project-time destination; omitted track means a separate audio track. */
export interface VideoProjectVoicePlacement {
  start: number;
  trackId?: string;
  timelineLaneId?: string;
  originalAudioMute?: Extract<
    VideoProject['clips'][number],
    { type: 'AUDIO' }
  >['originalAudioMute'];
}

/** Adds an independent take without trimming it or changing existing montage content. */
export function addVideoProjectVoiceTake(
  project: VideoProject,
  asset: VideoProjectAsset,
  snapshot: VideoProjectVoiceTextSnapshot,
  placement: VideoProjectVoicePlacement
) {
  const textSnapshot = parseVideoProjectVoiceTextSnapshot(snapshot);
  const duration = asset.metadata.duration;
  if (
    !textSnapshot ||
    !isVideoProjectAsset(asset) ||
    asset.type !== 'AUDIO' ||
    !asset.metadata.hasAudio ||
    asset.source.kind !== 'project-asset' ||
    !asset.source.projectAssetId ||
    !asset.metadata.mimeType.startsWith('audio/') ||
    duration === null ||
    duration <= 0 ||
    !Number.isFinite(placement.start) ||
    placement.start < 0 ||
    placement.start + duration > MAX_VIDEO_PROJECT_DURATION_SECONDS ||
    project.assets.some((entry) => entry.id === asset.id) ||
    (!placement.trackId && placement.timelineLaneId) ||
    (placement.originalAudioMute !== undefined &&
      !hasCurrentOriginalAudioTargets(project, placement.originalAudioMute))
  )
    return null;
  const track = placement.trackId
    ? project.tracks.find((entry) => entry.id === placement.trackId)
    : createVideoProjectTrack(
        asset.name,
        Math.max(0, ...project.tracks.map((entry) => entry.order)) + 1,
        VideoTrackKind.AUDIO
      );
  const lane = placement.timelineLaneId ?? DEFAULT_LOGICAL_LANE_ID;
  if (
    !track ||
    track.kind !== VideoTrackKind.AUDIO ||
    track.locked ||
    !(track.logicalLanes ?? [{ id: DEFAULT_LOGICAL_LANE_ID }]).some((entry) => entry.id === lane) ||
    project.clips.some(
      (clip) =>
        clip.trackId === track.id &&
        (clip.timelineLaneId ?? DEFAULT_LOGICAL_LANE_ID) === lane &&
        clip.startTime < placement.start + duration &&
        placement.start < clip.startTime + clip.duration
    )
  )
    return null;
  const clip = {
    ...createAudioClipFromAsset(track.id, asset, placement.start),
    timelineLaneId: lane,
    duration,
    sourceDuration: duration,
    textSnapshot,
    ...(placement.originalAudioMute
      ? { originalAudioMute: structuredClone(placement.originalAudioMute) }
      : {}),
  };
  if (!isVideoProjectClip(clip)) return null;
  return {
    clip,
    project: applyVideoProjectMutationPatch(project, {
      assets: [...project.assets, structuredClone(asset)],
      tracks: placement.trackId ? project.tracks : [...project.tracks, track],
      clips: [...project.clips, clip],
      duration: Math.max(project.duration, placement.start + duration),
    }),
  };
}

type TextMutation =
  | { ok: true; project: VideoProject; entry: VideoProjectTextDocument }
  | { ok: false; reason: 'stale' | 'invalid' };

/** Admits one document edit against its current identity and the shared aggregate text budget. */
export function applyVideoProjectTextEdit(
  project: VideoProject,
  basis: VideoProjectTextDocument,
  patch: Partial<Pick<VideoProjectTextDocument, 'document' | 'captions' | 'durationMode'>>
): TextMutation {
  if (!project.textDocuments?.includes(basis)) return { ok: false, reason: 'stale' };
  const next = { ...basis, ...patch };
  const documents = project.textDocuments.map((entry) => (entry === basis ? next : entry));
  if (!parseVideoProjectTextDocuments(documents)) return { ok: false, reason: 'invalid' };
  return {
    ok: true,
    project: applyVideoProjectMutationPatch(project, { textDocuments: documents }),
    entry: next,
  };
}

/** New manual text uses montage time; only an explicit existing project document can receive it. */
export function addVideoProjectManualText(
  project: VideoProject,
  args: {
    documentId: string;
    fragmentId: string;
    start: number;
    target?: VideoProjectTextDocument;
  }
): TextMutation {
  if (args.target && !project.textDocuments?.includes(args.target))
    return { ok: false, reason: 'stale' };
  if (args.target?.binding.kind === 'source') return { ok: false, reason: 'invalid' };
  const entry: VideoProjectTextDocument = args.target ?? {
    id: args.documentId,
    binding: { kind: 'project' },
    document: createReviewTextDocument(),
    captions: createReviewCaptionSettings(),
  };
  const result = addReviewTextFragment(entry.document, {
    id: args.fragmentId,
    start: args.start,
    end: Math.min(86_400, args.start + 3),
  });
  if (!result.ok) return { ok: false, reason: 'invalid' };
  if (args.target) return applyVideoProjectTextEdit(project, entry, { document: result.document });
  const next = { ...entry, document: result.document };
  const documents = [...(project.textDocuments ?? []), next];
  if (!parseVideoProjectTextDocuments(documents)) return { ok: false, reason: 'invalid' };
  return {
    ok: true,
    project: applyVideoProjectMutationPatch(project, { textDocuments: documents }),
    entry: next,
  };
}

/** Source edits require one native playhead value across all active placements of the instance. */
export function videoProjectTextPlayhead(
  project: VideoProject,
  entry: VideoProjectTextDocument,
  projectTime: number
): number | null {
  if (entry.binding.kind === 'project') return projectTime;
  const values = project.clips.flatMap((clip) =>
    (clip.type === 'VIDEO' || clip.type === 'AUDIO') &&
    isTextSourceClip(clip, entry.binding) &&
    clip.startTime <= projectTime &&
    projectTime < clip.startTime + clip.duration
      ? [getMediaClipSourceTime(clip, projectTime)]
      : []
  );
  const first = values[0];
  if (first === undefined || values.some((value) => Math.abs(value - first) > 1e-7)) return null;
  return first;
}

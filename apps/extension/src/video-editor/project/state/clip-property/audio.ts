import { clampNumber } from '../../../../features/video/project/timeline/basics';
import { applyVideoProjectMutationPatch } from '../../../../features/video/project/mutation';
import { getClipGainRange } from '../../../../features/video/project/timeline/basics';
import type { VideoProject } from '../../../../features/video/project/types/index';
import type { VideoEditorProjectState, VideoEditorProjectSliceSet } from '../contracts';
import { applyProjectUpdate, areClipTracksEditable } from '../helpers';
import { clampVideoPropertyNumber, VIDEO_CLIP_PROPERTY_LIMITS } from './constraints';

type VideoEditorStoreSet = VideoEditorProjectSliceSet;

function normalizeFiniteNumber(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

function normalizeTransformPatch(
  patch: Partial<VideoProject['clips'][number]['transform']>
): Partial<VideoProject['clips'][number]['transform']> {
  const nextPatch: Partial<VideoProject['clips'][number]['transform']> = {};
  const entries = Object.entries(patch) as Array<
    [keyof VideoProject['clips'][number]['transform'], number | undefined]
  >;

  for (const [key, value] of entries) {
    if (typeof value !== 'number') {
      continue;
    }

    const nextValue = normalizeFiniteNumber(value);
    if (nextValue === null) {
      continue;
    }

    const limit = getTransformLimit(key);
    nextPatch[key] = limit ? clampVideoPropertyNumber(nextValue, limit) : nextValue;
  }

  return nextPatch;
}

function getTransformLimit(
  key: keyof VideoProject['clips'][number]['transform']
): { max: number; min: number } | null {
  switch (key) {
    case 'height':
    case 'width':
      return VIDEO_CLIP_PROPERTY_LIMITS.transformSize;
    case 'opacity':
      return VIDEO_CLIP_PROPERTY_LIMITS.transformOpacity;
    case 'rotation':
      return VIDEO_CLIP_PROPERTY_LIMITS.transformRotation;
    case 'x':
    case 'y':
      return VIDEO_CLIP_PROPERTY_LIMITS.transformCoordinate;
    default:
      return null;
  }
}

function updateClipWithProjectGuard(
  project: VideoProject,
  clipId: string,
  updateClip: (clip: VideoProject['clips'][number]) => VideoProject['clips'][number]
): VideoProject {
  if (!areClipTracksEditable(project, [clipId])) {
    return project;
  }

  const clip = project.clips.find((item) => item.id === clipId);
  if (!clip) {
    return project;
  }

  return applyVideoProjectMutationPatch(project, {
    clips: project.clips.map((item) => (item.id === clipId ? updateClip(item) : item)),
  });
}

function updateClipTransform(
  set: VideoEditorStoreSet,
  clipId: string,
  patch: Partial<VideoProject['clips'][number]['transform']>
) {
  set((state) => {
    const normalizedPatch = normalizeTransformPatch(patch);
    if (Object.keys(normalizedPatch).length === 0) {
      return {};
    }

    return applyProjectUpdate(state, (project) =>
      updateClipWithProjectGuard(project, clipId, (item) => ({
        ...item,
        transform: { ...item.transform, ...normalizedPatch },
      }))
    );
  });
}

function updateClipVolume(set: VideoEditorStoreSet, clipId: string, volume: number) {
  set((state) => {
    const normalizedVolume = normalizeFiniteNumber(volume);
    if (normalizedVolume === null) {
      return {};
    }

    return applyProjectUpdate(state, (project) =>
      updateClipWithProjectGuard(project, clipId, (item) =>
        syncLegacyClipAudioFields(item, {
          audioGainEnd: clampNumber(normalizedVolume, 0, 2),
          audioGainStart: clampNumber(normalizedVolume, 0, 2),
        })
      )
    );
  });
}

function updateClipAudioEnvelope(
  set: VideoEditorStoreSet,
  clipId: string,
  patch: { volumeEnvelopeEnd?: number; volumeEnvelopeStart?: number }
) {
  set((state) =>
    applyProjectUpdate(state, (project) =>
      updateClipWithProjectGuard(project, clipId, (item) => {
        const gainRange = getClipGainRange(item);

        return syncLegacyClipAudioFields(item, {
          audioGainStart:
            patch.volumeEnvelopeStart === undefined
              ? gainRange.start
              : clampNumber(patch.volumeEnvelopeStart, 0, 2),
          audioGainEnd:
            patch.volumeEnvelopeEnd === undefined
              ? gainRange.end
              : clampNumber(patch.volumeEnvelopeEnd, 0, 2),
        });
      })
    )
  );
}

function syncLegacyClipAudioFields(
  clip: VideoProject['clips'][number],
  patch: { audioGainEnd?: number; audioGainStart?: number }
): VideoProject['clips'][number] {
  const gainRange = getClipGainRange(clip);
  const audioGainStart = patch.audioGainStart ?? gainRange.start;
  const audioGainEnd = patch.audioGainEnd ?? gainRange.end;

  return {
    ...clip,
    audioGainStart,
    audioGainEnd,
    volume: 1,
    volumeEnvelopeStart: audioGainStart,
    volumeEnvelopeEnd: audioGainEnd,
  };
}

export function createClipPropertyTransformActions(
  set: VideoEditorStoreSet
): Pick<
  VideoEditorProjectState,
  'updateClipTransform' | 'updateClipMuted' | 'updateClipVolume' | 'updateClipAudioEnvelope'
> {
  return {
    updateClipTransform: (clipId, patch) => updateClipTransform(set, clipId, patch),
    updateClipMuted: (clipId, muted) =>
      set((state) =>
        applyProjectUpdate(state, (project) =>
          updateClipWithProjectGuard(project, clipId, (clip) => ({ ...clip, muted }))
        )
      ),
    updateClipVolume: (clipId, volume) => updateClipVolume(set, clipId, volume),
    updateClipAudioEnvelope: (clipId, patch) => updateClipAudioEnvelope(set, clipId, patch),
  };
}

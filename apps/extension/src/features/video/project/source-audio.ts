import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  parseSourceAudioGainRanges,
  parseSourceAudioAttenuationRanges,
  type SourceAudioGainRange,
} from '../audio/source-envelope';
import type { AudioGainRange } from '../audio/source-attenuation';
import type { VideoProject, VideoProjectClip } from './types/model';
import { normalizeClipPlaybackRate, getSourceTimedClipProjectOffset } from './timeline/rate';

/** Source content survives cuts and missing placements without extending the composition. */
export interface VideoProjectSourceAudioDocument {
  id: string;
  binding: { kind: 'source'; assetId: string; sourceInstanceId: string };
  ranges: SourceAudioGainRange[];
  mutes: SourceAudioGainRange[];
}

function identity(value: unknown): value is string {
  return typeof value === 'string' && !!value && value.trim() === value && value.length <= 256;
}

/** Admits bounded source documents without merging or discarding authored ranges. */
export function parseVideoProjectSourceAudioDocuments(
  value: unknown
): VideoProjectSourceAudioDocument[] | null {
  if (!Array.isArray(value) || value.length > 512) return null;
  const documents: VideoProjectSourceAudioDocument[] = [];
  const ids = new Set<string>();
  const bindings = new Set<string>();
  let entries = 0;
  for (const raw of value) {
    if (
      !isRecord(raw) ||
      !identity(raw['id']) ||
      ids.has(raw['id']) ||
      Object.keys(raw).some((key) => !['id', 'binding', 'ranges', 'mutes'].includes(key))
    )
      return null;
    const binding = raw['binding'];
    if (
      !isRecord(binding) ||
      Object.keys(binding).length !== 3 ||
      binding['kind'] !== 'source' ||
      !identity(binding['assetId']) ||
      !identity(binding['sourceInstanceId'])
    )
      return null;
    const key = JSON.stringify([binding['assetId'], binding['sourceInstanceId']]);
    if (bindings.has(key) || !Array.isArray(raw['ranges']) || !Array.isArray(raw['mutes']))
      return null;
    entries += raw['ranges'].length + raw['mutes'].length;
    if (entries > 5_000) return null;
    const ranges = parseSourceAudioGainRanges(raw['ranges']);
    const mutes = parseSourceAudioAttenuationRanges(raw['mutes']);
    if (
      !ranges ||
      !mutes ||
      new Set([...ranges, ...mutes].map((range) => range.id)).size !== ranges.length + mutes.length
    )
      return null;
    ids.add(raw['id']);
    bindings.add(key);
    documents.push({
      id: raw['id'],
      binding: {
        kind: 'source',
        assetId: binding['assetId'],
        sourceInstanceId: binding['sourceInstanceId'],
      },
      ranges,
      mutes,
    });
  }
  return documents;
}

/** Missing placements are dormant, while missing assets and conflicting instances are invalid. */
export function hasValidVideoProjectSourceAudioReferences(project: VideoProject): boolean {
  return (project.sourceAudioDocuments ?? []).every((document) => {
    const { assetId, sourceInstanceId } = document.binding;
    const asset = project.assets.find((item) => item.id === assetId);
    if (!asset || asset.type === 'IMAGE') return false;
    if (
      project.clips.some(
        (clip) =>
          (clip.type === 'AUDIO' || clip.type === 'VIDEO') &&
          (clip.sourceInstanceId ?? clip.id) === sourceInstanceId &&
          clip.assetId !== assetId
      )
    )
      return false;
    const duration = asset.metadata.duration;
    return (
      duration == null ||
      [...document.ranges, ...document.mutes].every((range) => range.end <= duration)
    );
  });
}

/** Finds one exact source binding without treating another insertion as the same source. */
export function getProjectSourceAudioDocument(project: VideoProject, clip: VideoProjectClip) {
  if (clip.type !== 'AUDIO' && clip.type !== 'VIDEO') return undefined;
  return project.sourceAudioDocuments?.find(
    (document) =>
      document.binding.assetId === clip.assetId &&
      document.binding.sourceInstanceId === (clip.sourceInstanceId ?? clip.id)
  );
}

function projectRanges(
  project: VideoProject,
  clip: VideoProjectClip,
  branch: 'ranges' | 'mutes'
): AudioGainRange[] {
  if (clip.type !== 'AUDIO' && clip.type !== 'VIDEO') return [];
  const document = getProjectSourceAudioDocument(project, clip);
  if (!document) return [];
  const sourceDuration = Math.min(
    clip.sourceDuration,
    clip.duration * normalizeClipPlaybackRate(clip.playbackRate ?? 1)
  );
  return document[branch].flatMap((range) => {
    const start = Math.max(clip.sourceStart, range.start);
    const end = Math.min(clip.sourceStart + sourceDuration, range.end);
    return end > start
      ? [
          {
            start: clip.startTime + getSourceTimedClipProjectOffset(clip, start - clip.sourceStart),
            end: clip.startTime + getSourceTimedClipProjectOffset(clip, end - clip.sourceStart),
            volume: range.volume,
          },
        ]
      : [];
  });
}

/** Projects manual gain through the current trim and speed without changing source intent. */
export function getProjectSourceAudioRanges(
  project: VideoProject,
  clip: VideoProjectClip
): AudioGainRange[] {
  return projectRanges(project, clip, 'ranges');
}

/** Projects independent static attenuation for minimum composition with live take attenuation. */
export function getProjectSourceAudioAttenuationRanges(
  project: VideoProject,
  clip: VideoProjectClip
): AudioGainRange[] {
  return projectRanges(project, clip, 'mutes');
}

import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { parseReviewAudioClip } from '../review/audio-clip-validation';
import { parseVoiceoverSegments } from '../review/voiceover-validation';
import type { QuickEditAudioClip } from '../review/advanced/types';
import type { ReviewTimeSegment } from '../review/time-segment';
import { parseVideoProjectTextBinding } from './text/validation';
import type { VideoProjectTextBinding } from './text/types';
import type { VideoProject, VideoProjectClip } from './types/model';
import { applyVideoProjectMutationPatch } from './mutation';

/** Whole accepted samples and capture clock survive all current montage placements. */
export interface VideoProjectSourceVoiceoverDocument {
  id: string;
  binding: Extract<VideoProjectTextBinding, { kind: 'source' }>;
  trackId: string;
  reference: ReviewTimeSegment[];
  take: QuickEditAudioClip;
  enabled: boolean;
  originalAudioMuteVolume?: number;
  /** Original sound may occupy a separate instance of this same media asset. */
  originalAudioSourceInstanceId?: string;
}

const identity = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 256 && value.trim() === value;
const fields = [
  'id',
  'binding',
  'trackId',
  'reference',
  'take',
  'enabled',
  'originalAudioMuteVolume',
  'originalAudioSourceInstanceId',
];
const takeFields = [
  'id',
  'assetId',
  'timelineStart',
  'sourceOffset',
  'duration',
  'volume',
  'muted',
  'fadeIn',
  'fadeOut',
  'tempo',
  'sourceAnchor',
  'dormant',
  'transcript',
  'textSnapshot',
];

/** Admits authored takes, never the disposable playback rate, slices or fade phase. */
export function parseVideoProjectSourceVoiceoverDocuments(
  value: unknown
): VideoProjectSourceVoiceoverDocument[] | null {
  if (!Array.isArray(value) || value.length > 512) return null;
  const documents: VideoProjectSourceVoiceoverDocument[] = [];
  const ids = new Set<string>();
  const takes = new Set<string>();
  for (const raw of value) {
    if (
      !isRecord(raw) ||
      !identity(raw['id']) ||
      !identity(raw['trackId']) ||
      ids.has(raw['id']) ||
      typeof raw['enabled'] !== 'boolean' ||
      Object.keys(raw).some((key) => !fields.includes(key))
    )
      return null;
    const binding = parseVideoProjectTextBinding(raw['binding']);
    const reference = parseVoiceoverSegments(raw['reference']);
    const input = raw['take'];
    if (
      !isRecord(input) ||
      Object.keys(input).some((key) => !takeFields.includes(key)) ||
      (input['dormant'] !== undefined && typeof input['dormant'] !== 'boolean')
    )
      return null;
    const take = parseReviewAudioClip(input);
    const volume = raw['originalAudioMuteVolume'];
    const originalInstance = raw['originalAudioSourceInstanceId'];
    if (
      !binding ||
      binding.kind !== 'source' ||
      !reference ||
      !take ||
      (originalInstance !== undefined &&
        (!identity(originalInstance) || originalInstance === binding.sourceInstanceId)) ||
      takes.has(take.id) ||
      (!take.sourceAnchor?.length && !take.dormant) ||
      (volume !== undefined &&
        (typeof volume !== 'number' || !Number.isFinite(volume) || volume < 0 || volume > 1))
    )
      return null;
    ids.add(raw['id']);
    takes.add(take.id);
    documents.push({
      id: raw['id'],
      binding,
      trackId: raw['trackId'],
      reference,
      take,
      enabled: raw['enabled'],
      ...(volume === undefined ? {} : { originalAudioMuteVolume: volume }),
      ...(originalInstance === undefined
        ? {}
        : { originalAudioSourceInstanceId: originalInstance }),
    });
  }
  return documents;
}

/** Enumerates retained source and accepted speech resources, including inaudible replacements. */
export function getSourceVoiceoverAssetReferences(document: VideoProjectSourceVoiceoverDocument) {
  return [
    {
      assetId: document.binding.assetId,
      kind: 'source' as const,
      nativeEnd: document.reference.at(-1)!.sourceEnd,
    },
    {
      assetId: document.take.assetId,
      kind: 'audio' as const,
      nativeEnd: document.take.sourceOffset + document.take.duration,
    },
    ...(document.take.transcript?.replacements ?? []).map((replacement) => ({
      assetId: replacement.assetId,
      kind: 'audio' as const,
      nativeEnd: replacement.duration,
    })),
  ];
}

/** Missing placements are dormant; resources, tracks and instance identities must remain valid. */
export function hasValidVideoProjectSourceVoiceoverReferences(project: VideoProject): boolean {
  const instances = new Map<string, string>();
  return (project.sourceVoiceoverDocuments ?? []).every((document) => {
    const { assetId, sourceInstanceId } = document.binding;
    for (const instance of [sourceInstanceId, document.originalAudioSourceInstanceId]) {
      if (instance === undefined) continue;
      const previous = instances.get(instance);
      if (previous !== undefined && previous !== assetId) return false;
      instances.set(instance, assetId);
    }
    if (!project.tracks.some((track) => track.id === document.trackId && track.kind === 'AUDIO'))
      return false;
    if (
      !getSourceVoiceoverAssetReferences(document).every((reference) => {
        const asset = project.assets.find((asset) => asset.id === reference.assetId);
        return (
          asset &&
          (reference.kind === 'source' ? asset.type !== 'IMAGE' : asset.type === 'AUDIO') &&
          (asset.metadata.duration === null ||
            reference.nativeEnd <= asset.metadata.duration + 1e-7)
        );
      })
    )
      return false;
    if (
      document.originalAudioSourceInstanceId !== undefined &&
      project.clips.some(
        (clip) =>
          (clip.type === 'VIDEO' || clip.type === 'AUDIO') &&
          (clip.sourceInstanceId ?? clip.id) === document.originalAudioSourceInstanceId &&
          clip.type !== 'AUDIO'
      )
    )
      return false;
    return project.clips.every(
      (clip) =>
        (clip.type !== 'VIDEO' && clip.type !== 'AUDIO') ||
        ((clip.sourceInstanceId ?? clip.id) !== sourceInstanceId &&
          (clip.sourceInstanceId ?? clip.id) !== document.originalAudioSourceInstanceId) ||
        clip.assetId === assetId
    );
  });
}

/** Finds source ownership without equating two insertions of the same material. */
export function isSourceVoiceoverSourceClip(
  project: VideoProject,
  clip: VideoProjectClip
): boolean {
  return (
    (clip.type === 'VIDEO' || clip.type === 'AUDIO') &&
    !!project.sourceVoiceoverDocuments?.some(
      (document) =>
        document.binding.assetId === clip.assetId &&
        document.binding.sourceInstanceId === (clip.sourceInstanceId ?? clip.id)
    )
  );
}

/** Matches the original sound without equating other insertions of the same asset. */
export function isSourceVoiceoverOriginalAudioClip(
  document: VideoProjectSourceVoiceoverDocument,
  clip: VideoProjectClip
): boolean {
  return (
    (clip.type === 'VIDEO' || clip.type === 'AUDIO') &&
    clip.assetId === document.binding.assetId &&
    (document.originalAudioSourceInstanceId === undefined || clip.type === 'AUDIO') &&
    (clip.sourceInstanceId ?? clip.id) ===
      (document.originalAudioSourceInstanceId ?? document.binding.sourceInstanceId)
  );
}

export function isProjectSourceVoiceoverEditable(
  project: VideoProject,
  document: VideoProjectSourceVoiceoverDocument
): boolean {
  return (
    project.tracks.some((track) => track.id === document.trackId && !track.locked) &&
    project.clips.every(
      (clip) =>
        (clip.type !== 'VIDEO' && clip.type !== 'AUDIO') ||
        clip.assetId !== document.binding.assetId ||
        ((clip.sourceInstanceId ?? clip.id) !== document.binding.sourceInstanceId &&
          !isSourceVoiceoverOriginalAudioClip(document, clip)) ||
        project.tracks.some((track) => track.id === clip.trackId && !track.locked)
    )
  );
}

type MutationResult =
  | { ok: true; project: VideoProject; document: VideoProjectSourceVoiceoverDocument | null }
  | { ok: false; reason: 'invalid' | 'stale' | 'locked' };

function admit(
  project: VideoProject,
  input: VideoProjectSourceVoiceoverDocument[],
  id: string | null
): MutationResult {
  const documents = parseVideoProjectSourceVoiceoverDocuments(input);
  if (
    !documents ||
    !hasValidVideoProjectSourceVoiceoverReferences({
      ...project,
      sourceVoiceoverDocuments: documents,
    })
  )
    return { ok: false, reason: 'invalid' };
  return {
    ok: true,
    project: applyVideoProjectMutationPatch(project, { sourceVoiceoverDocuments: documents }),
    document: id === null ? null : documents.find((document) => document.id === id)!,
  };
}

/** Adds a caller-identified take through the existing project mutation authority. */
export function addProjectSourceVoiceoverDocument(
  project: VideoProject,
  document: VideoProjectSourceVoiceoverDocument
): MutationResult {
  if (!isProjectSourceVoiceoverEditable(project, document)) return { ok: false, reason: 'locked' };
  return admit(project, [...(project.sourceVoiceoverDocuments ?? []), document], document.id);
}

/** Edits one exact accepted take; the capture reference and source binding remain immutable. */
export function applyProjectSourceVoiceoverEdit(
  project: VideoProject,
  basis: VideoProjectSourceVoiceoverDocument,
  patch: Partial<
    Pick<VideoProjectSourceVoiceoverDocument, 'take' | 'enabled' | 'originalAudioMuteVolume'>
  > | null
): MutationResult {
  if (!project.sourceVoiceoverDocuments?.includes(basis)) return { ok: false, reason: 'stale' };
  if (!isProjectSourceVoiceoverEditable(project, basis)) return { ok: false, reason: 'locked' };
  if (!patch)
    return admit(
      project,
      project.sourceVoiceoverDocuments.filter((document) => document !== basis),
      null
    );
  if (patch.take && (patch.take.id !== basis.take.id || patch.take.assetId !== basis.take.assetId))
    return { ok: false, reason: 'invalid' };
  const next = {
    ...basis,
    take: patch.take === undefined ? basis.take : patch.take,
    enabled: patch.enabled === undefined ? basis.enabled : patch.enabled,
    ...('originalAudioMuteVolume' in patch
      ? { originalAudioMuteVolume: patch.originalAudioMuteVolume }
      : {}),
  };
  if (JSON.stringify(next) === JSON.stringify(basis)) return { ok: true, project, document: basis };
  return admit(
    project,
    project.sourceVoiceoverDocuments.map((document) => (document === basis ? next : document)),
    basis.id
  );
}

/** Copies authored documents only after the montage command has its complete instance map. */
export function duplicateProjectSourceVoiceoverDocuments(
  documents: VideoProjectSourceVoiceoverDocument[],
  instances: ReadonlyMap<string, string>,
  createId: () => string
): VideoProjectSourceVoiceoverDocument[] | null {
  const copies = documents.flatMap((document) => {
    const sourceInstanceId = instances.get(document.binding.sourceInstanceId);
    const { originalAudioSourceInstanceId, ...copy } = structuredClone(document);
    const originalInstance =
      originalAudioSourceInstanceId === undefined
        ? undefined
        : instances.get(originalAudioSourceInstanceId);
    return sourceInstanceId
      ? [
          {
            ...copy,
            ...(originalInstance === undefined
              ? {}
              : { originalAudioSourceInstanceId: originalInstance }),
            id: createId(),
            binding: { ...document.binding, sourceInstanceId },
            take: { ...structuredClone(document.take), id: createId() },
          },
        ]
      : [];
  });
  return parseVideoProjectSourceVoiceoverDocuments([...documents, ...copies]);
}

import { parseReviewSpeechTarget, type ReviewSpeechTarget } from '../../../contracts/ai/audio';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { StoredProjectAssetEntry } from './contracts';
import { parseProjectAssetEntry } from './read-guards';

export interface ProjectAssetPublicationOptions {
  /** False keeps a frozen project representation out of the Library catalogue. */
  publishToLibrary?: boolean;
  originMediaId?: string;
  /** Private accepted speech is retained by this exact target and replacement. */
  requiredReviewSpeech?: { aggregateId: string; target: ReviewSpeechTarget; replacementId: string };
  /** Private immutable visual bytes retained by one exact source/snapshot/resource binding. */
  requiredReviewAnnotationEffect?: {
    aggregateId: string;
    sourceAssetId: string;
    snapshotId: string;
    resourceId: string;
    sha256: string;
  };
  /** Private scene resource retained by its exact review slot, including remembered settings. */
  requiredReviewResource?:
    | { aggregateId: string; slot: 'watermark' }
    | {
        aggregateId: string;
        slot: 'intro' | 'outro';
        kind: 'image' | 'video';
        acquisition: 'private-upload' | 'private-frozen-image' | 'library-binding';
      };
}

export interface ProjectAssetPublicationPayload extends ProjectAssetPublicationOptions {
  entry: StoredProjectAssetEntry;
  filename: string;
  /** Existing Library acquisition; admission is scoped to the required audio clip. */
  librarySourceId?: string;
  expectedAssetId?: string | null;
  requiredReview?: { aggregateId: string; clipId: string };
  /** Exact selected source for a new private Montage child, without another binary import. */
  expectedLibrarySource?: KnownLibrarySourceClaim;
}

export interface KnownLibrarySourceClaim {
  mediaId: string;
  source:
    | { kind: 'recording'; recordingId: string }
    | { kind: 'project-export'; exportId: string; projectId: string };
}

function parseKnownLibrarySourceClaim(value: unknown): KnownLibrarySourceClaim | null {
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => !['mediaId', 'source'].includes(key)) ||
    typeof value['mediaId'] !== 'string' ||
    !value['mediaId'] ||
    !isRecord(value['source'])
  )
    return null;
  const source = value['source'];
  if (
    source['kind'] === 'recording' &&
    Object.keys(source).every((key) => ['kind', 'recordingId'].includes(key)) &&
    typeof source['recordingId'] === 'string' &&
    source['recordingId']
  )
    return {
      mediaId: value['mediaId'],
      source: { kind: 'recording', recordingId: source['recordingId'] },
    };
  if (
    source['kind'] === 'project-export' &&
    Object.keys(source).every((key) => ['kind', 'exportId', 'projectId'].includes(key)) &&
    typeof source['exportId'] === 'string' &&
    source['exportId'] &&
    typeof source['projectId'] === 'string' &&
    source['projectId']
  )
    return {
      mediaId: value['mediaId'],
      source: {
        kind: 'project-export',
        exportId: source['exportId'],
        projectId: source['projectId'],
      },
    };
  return null;
}

/** Shared compatibility rule for prepared writes and recovered scene-resource claims. */
export function isValidProjectAssetReviewResource(args: {
  mimeType: string;
  resource: ProjectAssetPublicationOptions['requiredReviewResource'];
  requiredReview: ProjectAssetPublicationPayload['requiredReview'];
  publishToLibrary: boolean | undefined;
}): boolean {
  if (!args.resource) return true;
  const resource = args.resource;
  if (args.requiredReview !== undefined || !resource.aggregateId) return false;
  if (resource.slot === 'watermark')
    return args.publishToLibrary === false && args.mimeType.startsWith('image/');
  if (resource.slot !== 'intro' && resource.slot !== 'outro') return false;
  if (resource.kind !== 'image' && resource.kind !== 'video') return false;
  if (!args.mimeType.startsWith(`${resource.kind}/`)) return false;
  if (resource.acquisition === 'library-binding') return true;
  return (
    args.publishToLibrary === false &&
    (resource.acquisition === 'private-upload' ||
      (resource.acquisition === 'private-frozen-image' && resource.kind === 'image'))
  );
}

/** Parse the same standalone asset payload for publication and prepared-reference admission. */
export function parseProjectAssetPayload(value: unknown): ProjectAssetPublicationPayload | null {
  if (!isRecord(value) || typeof value['filename'] !== 'string') return null;
  if (value['publishToLibrary'] !== undefined && typeof value['publishToLibrary'] !== 'boolean')
    return null;
  if (
    value['expectedAssetId'] !== undefined &&
    value['expectedAssetId'] !== null &&
    typeof value['expectedAssetId'] !== 'string'
  )
    return null;
  const entry = parseProjectAssetEntry(value['entry']);
  if (!entry) return null;
  const required = value['requiredReview'];
  const requiredReview =
    required === undefined
      ? undefined
      : isRecord(required) &&
          typeof required['aggregateId'] === 'string' &&
          typeof required['clipId'] === 'string'
        ? { aggregateId: required['aggregateId'], clipId: required['clipId'] }
        : null;
  if (requiredReview === null) return null;
  const requiredReviewResource = parseReviewResource(value, entry.mimeType, requiredReview);
  if (requiredReviewResource === null) return null;
  const speech = value['requiredReviewSpeech'];
  const requiredReviewSpeech =
    speech === undefined ? undefined : parseProjectAssetSpeechClaim(speech);
  if (
    requiredReviewSpeech === null ||
    (requiredReviewSpeech &&
      (value['publishToLibrary'] !== false ||
        !entry.mimeType.startsWith('audio/') ||
        requiredReview !== undefined ||
        requiredReviewResource !== undefined ||
        value['librarySourceId'] !== undefined ||
        entry.originMediaId !== undefined))
  )
    return null;
  const librarySourceId = value['librarySourceId'];
  const annotation = value['requiredReviewAnnotationEffect'];
  const requiredReviewAnnotationEffect =
    annotation === undefined ? undefined : parseProjectAssetAnnotationEffectClaim(annotation);
  if (
    requiredReviewAnnotationEffect === null ||
    (requiredReviewAnnotationEffect &&
      (value['publishToLibrary'] !== false ||
        value['expectedAssetId'] !== null ||
        !['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(entry.mimeType) ||
        requiredReview !== undefined ||
        requiredReviewSpeech !== undefined ||
        requiredReviewResource !== undefined ||
        librarySourceId !== undefined ||
        entry.originMediaId !== undefined ||
        value['originMediaId'] !== undefined))
  )
    return null;
  if (librarySourceId !== undefined) {
    if (
      typeof librarySourceId !== 'string' ||
      !librarySourceId ||
      (!(
        requiredReview?.aggregateId &&
        requiredReview.clipId &&
        entry.mimeType.startsWith('audio/')
      ) &&
        !(
          requiredReviewResource &&
          requiredReviewResource.slot !== 'watermark' &&
          requiredReviewResource.acquisition === 'library-binding'
        ))
    )
      return null;
    if (entry.originMediaId) {
      if (
        entry.originMediaId !== librarySourceId ||
        value['publishToLibrary'] !== false ||
        value['expectedAssetId'] !== null
      )
        return null;
    } else if (value['publishToLibrary'] === false || value['expectedAssetId'] !== entry.assetId)
      return null;
  }
  const expectedLibrarySource =
    value['expectedLibrarySource'] === undefined
      ? undefined
      : parseKnownLibrarySourceClaim(value['expectedLibrarySource']);
  if (
    expectedLibrarySource === null ||
    (expectedLibrarySource &&
      (value['expectedAssetId'] !== null ||
        value['publishToLibrary'] !== false ||
        entry.originMediaId !== expectedLibrarySource.mediaId ||
        librarySourceId !== undefined ||
        requiredReview !== undefined ||
        requiredReviewSpeech !== undefined ||
        requiredReviewResource !== undefined ||
        requiredReviewAnnotationEffect !== undefined))
  )
    return null;
  return {
    entry,
    filename: value['filename'],
    ...(typeof value['expectedAssetId'] === 'string' || value['expectedAssetId'] === null
      ? { expectedAssetId: value['expectedAssetId'] }
      : {}),
    ...(typeof value['publishToLibrary'] === 'boolean'
      ? { publishToLibrary: value['publishToLibrary'] }
      : {}),
    ...(requiredReview ? { requiredReview } : {}),
    ...(requiredReviewSpeech ? { requiredReviewSpeech } : {}),
    ...(requiredReviewAnnotationEffect ? { requiredReviewAnnotationEffect } : {}),
    ...(requiredReviewResource ? { requiredReviewResource } : {}),
    ...(typeof librarySourceId === 'string' ? { librarySourceId } : {}),
    ...(expectedLibrarySource ? { expectedLibrarySource } : {}),
  };
}

function parseReviewResource(
  value: Record<string, unknown>,
  mimeType: string,
  requiredReview: ProjectAssetPublicationPayload['requiredReview']
): ProjectAssetPublicationOptions['requiredReviewResource'] | null {
  const resource = value['requiredReviewResource'];
  let requiredReviewResource: ProjectAssetPublicationOptions['requiredReviewResource'];
  if (resource !== undefined) {
    if (
      !isRecord(resource) ||
      typeof resource['aggregateId'] !== 'string' ||
      !resource['aggregateId']
    )
      return null;
    if (resource['slot'] === 'watermark') {
      if (value['librarySourceId'] !== undefined) return null;
      requiredReviewResource = { aggregateId: resource['aggregateId'], slot: 'watermark' };
    } else {
      if (
        (resource['slot'] !== 'intro' && resource['slot'] !== 'outro') ||
        (resource['kind'] !== 'image' && resource['kind'] !== 'video') ||
        (resource['acquisition'] !== 'private-upload' &&
          resource['acquisition'] !== 'private-frozen-image' &&
          resource['acquisition'] !== 'library-binding')
      )
        return null;
      requiredReviewResource = {
        aggregateId: resource['aggregateId'],
        slot: resource['slot'],
        kind: resource['kind'],
        acquisition: resource['acquisition'],
      };
      if (
        (resource['acquisition'] === 'library-binding') !==
        (typeof value['librarySourceId'] === 'string')
      )
        return null;
    }
    if (
      !isValidProjectAssetReviewResource({
        mimeType,
        resource: requiredReviewResource,
        requiredReview,
        publishToLibrary:
          typeof value['publishToLibrary'] === 'boolean' ? value['publishToLibrary'] : undefined,
      })
    )
      return null;
  }
  return requiredReviewResource;
}

/** Strict exact-identity speech claim shared by prepare and recovered publication. */
export function parseProjectAssetSpeechClaim(
  value: unknown
): NonNullable<ProjectAssetPublicationOptions['requiredReviewSpeech']> | null {
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => !['aggregateId', 'target', 'replacementId'].includes(key)) ||
    typeof value['aggregateId'] !== 'string' ||
    !value['aggregateId'] ||
    typeof value['replacementId'] !== 'string' ||
    !value['replacementId']
  )
    return null;
  const target = parseReviewSpeechTarget(value['target']);
  return target
    ? { aggregateId: value['aggregateId'], target, replacementId: value['replacementId'] }
    : null;
}

/** Bounded annotation identity; no catalogue, Library or other slot can widen this claim. */
export function parseProjectAssetAnnotationEffectClaim(
  value: unknown
): NonNullable<ProjectAssetPublicationOptions['requiredReviewAnnotationEffect']> | null {
  if (
    !isRecord(value) ||
    Object.keys(value).some(
      (key) => !['aggregateId', 'sourceAssetId', 'snapshotId', 'resourceId', 'sha256'].includes(key)
    )
  )
    return null;
  const { aggregateId, sourceAssetId, snapshotId, resourceId, sha256 } = value;
  if (
    [aggregateId, sourceAssetId, resourceId].some(
      (id) => typeof id !== 'string' || !id || id.length > 256 || id.trim() !== id
    ) ||
    typeof aggregateId !== 'string' ||
    typeof sourceAssetId !== 'string' ||
    typeof resourceId !== 'string' ||
    typeof snapshotId !== 'string' ||
    !/^effect:[a-f0-9]{64}$/.test(snapshotId) ||
    typeof sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(sha256)
  )
    return null;
  return { aggregateId, sourceAssetId, snapshotId, resourceId, sha256 };
}

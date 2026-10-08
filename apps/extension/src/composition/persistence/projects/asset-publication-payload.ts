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
    ...(requiredReviewResource ? { requiredReviewResource } : {}),
    ...(typeof librarySourceId === 'string' ? { librarySourceId } : {}),
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

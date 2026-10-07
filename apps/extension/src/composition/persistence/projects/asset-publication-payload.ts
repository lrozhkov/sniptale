import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { StoredProjectAssetEntry } from './contracts';
import { parseProjectAssetEntry } from './read-guards';

export interface ProjectAssetPublicationOptions {
  /** False keeps a frozen project representation out of the Library catalogue. */
  publishToLibrary?: boolean;
  originMediaId?: string;
}

export interface ProjectAssetPublicationPayload extends ProjectAssetPublicationOptions {
  entry: StoredProjectAssetEntry;
  filename: string;
  /** Existing Library acquisition; admission is scoped to the required audio clip. */
  librarySourceId?: string;
  expectedAssetId?: string | null;
  requiredReview?: { aggregateId: string; clipId: string };
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
  const librarySourceId = value['librarySourceId'];
  if (librarySourceId !== undefined) {
    if (
      typeof librarySourceId !== 'string' ||
      !librarySourceId ||
      !requiredReview?.aggregateId ||
      !requiredReview.clipId ||
      !entry.mimeType.startsWith('audio/')
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
    ...(typeof librarySourceId === 'string' ? { librarySourceId } : {}),
  };
}

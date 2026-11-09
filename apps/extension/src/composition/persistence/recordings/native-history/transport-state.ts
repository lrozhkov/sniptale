import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { isTrajectoryInteger } from '../../../../features/video/project/cursor-trajectory/records';
import { isCursorTrajectoryEntry } from '../cursor-trajectory/guards';
import { isRecordingEventsManifestEntry } from '../recording-events/guards';
import type { CursorTrajectoryDescriptor } from '../../../../features/video/project/cursor-trajectory/types';
import type { RecordingEventsDescriptor } from '../../../../features/video/project/recording-events/types';

const id = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value);
const hash = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function exact(value: Record<string, unknown>, fields: readonly string[]) {
  return (
    Object.keys(value).length === fields.length && fields.every((key) => Object.hasOwn(value, key))
  );
}
/** Structural bounds do not replace original block hash and semantic verification. */
export function isNativeHistoryPullState(
  value: unknown,
  descriptor: CursorTrajectoryDescriptor | RecordingEventsDescriptor,
  cursor: boolean
): boolean {
  if (!isPlainRecord(value)) return false;
  if (value['kind'] === 'verified' || value['kind'] === 'published')
    return exact(value, ['kind']) && descriptor.finalized;
  if (value['kind'] === 'unavailable')
    return (
      exact(value, ['kind']) &&
      descriptor.finalized &&
      descriptor.state === 'unavailable' &&
      descriptor.totalBlocks === 0
    );
  if (value['kind'] === 'manifest')
    return (
      exact(value, ['kind', 'requestId', 'nextSequence', 'prefixSha256']) &&
      id(value['requestId']) &&
      isTrajectoryInteger(value['nextSequence']) &&
      value['nextSequence'] <= descriptor.totalBlocks &&
      hash(value['prefixSha256'])
    );
  if (
    value['kind'] !== 'chunks' ||
    !exact(value, ['kind', 'requestId', 'entries', 'chunkIndex', 'firstChunk']) ||
    !id(value['requestId']) ||
    !Array.isArray(value['entries']) ||
    value['entries'].length < 1 ||
    value['entries'].length > 32
  )
    return false;
  let previous: number | null = null;
  for (const entry of value['entries']) {
    if (!(cursor ? isCursorTrajectoryEntry(entry) : isRecordingEventsManifestEntry(entry)))
      return false;
    // Both validated entry contracts share the same sequence and byte geometry.
    if (
      !isPlainRecord(entry) ||
      !isTrajectoryInteger(entry['sequence']) ||
      entry['sequence'] >= descriptor.totalBlocks ||
      (previous !== null && entry['sequence'] !== previous + 1)
    )
      return false;
    previous = entry['sequence'];
  }
  const first: unknown = value['entries'][0];
  if (!isPlainRecord(first) || !isTrajectoryInteger(first['byteLength'])) return false;
  return value['chunkIndex'] === 0
    ? value['firstChunk'] === null
    : value['chunkIndex'] === 1 &&
        first['byteLength'] > 32768 &&
        value['firstChunk'] instanceof Uint8Array &&
        value['firstChunk'].byteLength === 32768;
}

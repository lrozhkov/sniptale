import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { SHA256_DIGEST_PATTERN } from '@sniptale/runtime-contracts/protocol/digest';
import { parseReviewVoiceTextSnapshot } from '../../review/text-validation';
import type { VideoProjectVoiceTextSnapshot } from './types';
export type { VideoProjectVoiceTextSnapshot } from './types';
import { parseVideoProjectTextBinding } from './validation';

/** Validates bounded historical data without acquiring references to its former text or source. */
export function parseVideoProjectVoiceTextSnapshot(
  value: unknown
): VideoProjectVoiceTextSnapshot | null {
  if (
    !isRecord(value) ||
    Object.keys(value).some(
      (key) => !['version', 'documentId', 'binding', 'basisHash', 'text'].includes(key)
    ) ||
    value['version'] !== 1 ||
    typeof value['documentId'] !== 'string' ||
    !value['documentId'] ||
    value['documentId'].trim() !== value['documentId'] ||
    value['documentId'].length > 256 ||
    typeof value['basisHash'] !== 'string' ||
    !SHA256_DIGEST_PATTERN.test(value['basisHash']) ||
    !isRecord(value['text']) ||
    Object.keys(value['text']).some(
      (key) =>
        ![
          'kind',
          'textId',
          'revision',
          'timingRevision',
          'text',
          'start',
          'end',
          'timeDomain',
          'profile',
        ].includes(key)
    )
  )
    return null;
  const rawProfile = value['text']['profile'];
  if (
    rawProfile !== undefined &&
    (!isRecord(rawProfile) ||
      Object.keys(rawProfile).some(
        (key) => !['modelId', 'voiceId', 'responseFormat', 'speed', 'instructions'].includes(key)
      ))
  )
    return null;
  const binding = parseVideoProjectTextBinding(value['binding']);
  const text = parseReviewVoiceTextSnapshot(value['text']);
  if (!binding || !text || text.timeDomain !== (binding.kind === 'source' ? 'source' : 'result'))
    return null;
  return {
    version: 1,
    documentId: value['documentId'],
    binding,
    basisHash: value['basisHash'],
    text,
  };
}

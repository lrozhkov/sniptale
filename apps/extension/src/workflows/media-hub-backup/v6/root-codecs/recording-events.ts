import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { isRecordingEventsDescriptor } from '../../../../features/video/project/recording-events/records';
import type { RecordingEventsDescriptor } from '../../../../features/video/project/recording-events/types';

export interface PortableRecordingEventsAttachment {
  recordingId: string;
  sourceRecordingId: string;
  descriptor: RecordingEventsDescriptor;
  objectId: string;
}

/** Portable metadata names one original framed object and contains no private writer identity. */
export function isPortableRecordingEventsAttachment(
  value: unknown
): value is PortableRecordingEventsAttachment {
  if (
    !isPlainRecord(value) ||
    Object.keys(value).length !== 4 ||
    !isRecordingEventsDescriptor(value['descriptor']) ||
    !value['descriptor'].finalized ||
    value['descriptor'].totalBlocks === 0
  )
    return false;
  return (
    ['recordingId', 'sourceRecordingId'].every(
      (key) => typeof value[key] === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value[key])
    ) &&
    typeof value['objectId'] === 'string' &&
    /^[A-Za-z0-9._:-]{1,160}$/.test(value['objectId']) &&
    Number.isSafeInteger(value['descriptor'].totalBytes + value['descriptor'].totalBlocks * 4)
  );
}

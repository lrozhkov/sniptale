import type { AggregatePresentationBackupDescriptor } from '../contracts/types';
import { field, readNullablePath, readNumber, readPath, readRecord, readString } from './readers';

function normalizeAggregatePresentation(value: unknown): AggregatePresentationBackupDescriptor {
  const descriptor = readRecord(value);
  const entry = readRecord(field(descriptor, 'entry'));
  const aggregateKind = readString(field(entry, 'aggregateKind'));
  if (
    aggregateKind !== 'image' &&
    aggregateKind !== 'video-project' &&
    aggregateKind !== 'scenario'
  ) {
    throw new Error('Invalid aggregate presentation kind.');
  }
  const presentationRevision = readNumber(field(entry, 'presentationRevision'));
  if (!Number.isInteger(presentationRevision) || presentationRevision < 0) {
    throw new Error('Invalid aggregate presentation revision.');
  }
  return {
    entry: {
      aggregateId: readString(field(entry, 'aggregateId')),
      aggregateKind,
      presentationRevision,
      updatedAt: readNumber(field(entry, 'updatedAt')),
    },
    previewPath: readNullablePath(field(descriptor, 'previewPath'), ['aggregate-presentations/']),
    thumbnailPath: readPath(field(descriptor, 'thumbnailPath'), ['aggregate-presentations/']),
  };
}

/** Presentation is derived data: malformed metadata degrades to a placeholder on restore. */
export function tryNormalizeAggregatePresentation(
  value: unknown
): AggregatePresentationBackupDescriptor | undefined {
  try {
    return normalizeAggregatePresentation(value);
  } catch {
    return undefined;
  }
}

import type {
  AggregatePresentationEntry,
  AggregateRef,
} from '../../../composition/persistence/aggregate-presentations/contracts';
import type { AggregatePresentationBackupDescriptor } from '../contracts/types';
import type { BackupArchiveReader } from './archive-reader';
import { MAX_BACKUP_ENTRY_BYTES } from '../manifest';

async function readOptionalBlob(
  zip: BackupArchiveReader,
  path: string | null
): Promise<Blob | null> {
  if (!path) return null;
  try {
    const blob = (await zip.file(path)?.async('blob')) ?? null;
    return blob && blob.size <= MAX_BACKUP_ENTRY_BYTES ? blob : null;
  } catch {
    return null;
  }
}

export async function materializeAggregatePresentation(args: {
  descriptor: AggregatePresentationBackupDescriptor | undefined;
  ref: AggregateRef;
  zip: BackupArchiveReader;
}): Promise<AggregatePresentationEntry | null> {
  const descriptor = args.descriptor;
  if (
    !descriptor ||
    descriptor.entry.aggregateId !== args.ref.id ||
    descriptor.entry.aggregateKind !== args.ref.kind
  ) {
    return null;
  }
  const thumbnailBlob = await readOptionalBlob(args.zip, descriptor.thumbnailPath);
  if (!thumbnailBlob) return null;
  const previewBlob = await readOptionalBlob(args.zip, descriptor.previewPath);
  if (descriptor.previewPath && !previewBlob) return null;
  return {
    ...descriptor.entry,
    aggregateId: args.ref.id,
    aggregateKind: args.ref.kind,
    thumbnailBlob,
    ...(previewBlob ? { previewBlob } : {}),
  };
}

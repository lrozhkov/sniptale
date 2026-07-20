import { parseScenarioAssetEntry } from '../../../../composition/persistence/scenario/read-guards';
import { assertSafeProjectAssetStorageInput } from '../../../../features/media-hub/project-assets';
import { assertSafeScenarioAssetStorageInput } from '../../../../composition/persistence/scenario/projects/guards';
import { getStore } from '../../storage';
import type { BackupBlobDescriptor, ProjectAssetBackupBlobDescriptor } from '../../contracts/types';

type BackupTransaction = Parameters<typeof getStore>[0];

type BlobRestoreArgs = {
  blob: Blob;
  descriptor: BackupBlobDescriptor;
  entryPatch?: Record<string, unknown>;
  storeName: string;
  tx: BackupTransaction;
};

type ProjectAssetBlobRestoreArgs = Omit<BlobRestoreArgs, 'descriptor'> & {
  descriptor: ProjectAssetBackupBlobDescriptor;
};

function prepareBlobEntry(args: BlobRestoreArgs): Record<string, unknown> {
  return {
    ...args.descriptor.entry,
    ...args.entryPatch,
    blob: args.blob,
  };
}

function readRequiredMimeType(entry: Record<string, unknown>, errorMessage: string): string {
  const mimeType = entry['mimeType'];
  if (typeof mimeType !== 'string') {
    throw new Error(errorMessage);
  }
  return mimeType;
}

export async function restoreBlobDescriptor(args: BlobRestoreArgs): Promise<void> {
  await getStore(args.tx, args.storeName).put(prepareBlobEntry(args));
}

export async function restoreProjectAssetBlobDescriptor(
  args: ProjectAssetBlobRestoreArgs
): Promise<void> {
  const entry = prepareBlobEntry(args);
  const mimeType = readRequiredMimeType(entry, 'Project asset backup entry MIME type is missing.');

  assertSafeProjectAssetStorageInput(args.blob, mimeType);
  await getStore(args.tx, args.storeName).put(entry);
}

export async function restoreScenarioAssetBlobDescriptor(args: BlobRestoreArgs): Promise<void> {
  const entry = prepareBlobEntry(args);
  const mimeType = readRequiredMimeType(entry, 'Scenario asset backup entry MIME type is missing.');
  const size = entry['size'];
  if (typeof size !== 'number' || size !== args.blob.size) {
    throw new Error('Scenario asset backup entry size does not match blob.');
  }

  assertSafeScenarioAssetStorageInput(args.blob, mimeType);
  const parsedEntry = parseScenarioAssetEntry(entry);
  if (!parsedEntry) {
    throw new Error('Invalid scenario asset backup entry.');
  }

  await getStore(args.tx, args.storeName).put(parsedEntry);
}

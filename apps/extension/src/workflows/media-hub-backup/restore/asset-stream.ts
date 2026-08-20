import {
  assertAssetWriteAdmission,
  createAssetObjectWriter,
  type PreparedAssetObject,
} from '../../../composition/persistence/assets';
import { MAX_BACKUP_ENTRY_BYTES } from '../manifest';
import type { BackupArchiveReader, BackupArchiveStream } from './archive-reader';

export async function writeBackupArchiveEntryToAsset(args: {
  expectedSize: number;
  mimeType: string;
  path: string;
  zip: BackupArchiveReader;
}): Promise<PreparedAssetObject> {
  if (
    !Number.isSafeInteger(args.expectedSize) ||
    args.expectedSize <= 0 ||
    args.expectedSize > MAX_BACKUP_ENTRY_BYTES
  ) {
    throw new Error(`Invalid durable backup asset size: ${args.path}.`);
  }
  const entry = args.zip.file(args.path);
  if (!entry) throw new Error(`Required backup asset is missing: ${args.path}.`);
  if (!entry.internalStream) {
    throw new Error(`Durable backup asset cannot be streamed: ${args.path}.`);
  }
  await assertAssetWriteAdmission(args.expectedSize);
  const writer = await createAssetObjectWriter(
    { mimeType: args.mimeType },
    { persistenceTransition: 'already-admitted' }
  );
  let written = 0;
  try {
    await pipeArchiveStream(entry.internalStream('uint8array'), async (chunk) => {
      written += chunk.byteLength;
      if (written > args.expectedSize || written > MAX_BACKUP_ENTRY_BYTES) {
        throw new Error(`Durable backup asset exceeds its declared size: ${args.path}.`);
      }
      const bytes = new Uint8Array(chunk.byteLength);
      bytes.set(chunk);
      await writer.append(new Blob([bytes.buffer]));
    });
    if (written !== args.expectedSize) {
      throw new Error(`Durable backup asset size does not match metadata: ${args.path}.`);
    }
    return await writer.finalize();
  } catch (error) {
    try {
      await writer.abort();
    } catch (abortError) {
      throw new AggregateError(
        [error, abortError],
        'Durable backup restore failed and partial OPFS cleanup was incomplete.',
        { cause: error }
      );
    }
    throw error;
  }
}

function pipeArchiveStream(
  stream: BackupArchiveStream,
  append: (chunk: Uint8Array) => Promise<void>
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    stream.on('data', (chunk) => {
      if (settled) return;
      stream.pause();
      void append(chunk).then(() => {
        if (!settled) stream.resume();
      }, fail);
    });
    stream.on('error', fail);
    stream.on('end', () => {
      if (settled) return;
      settled = true;
      resolve();
    });
    stream.resume();
  });
}

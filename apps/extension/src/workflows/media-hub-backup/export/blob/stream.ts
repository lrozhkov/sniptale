import {
  createAssetObjectWriter,
  discardPreparedAsset,
  readAssetFile,
} from '../../../../composition/persistence/assets';
import { runWithPersistenceMutationTransition } from '../../../../composition/persistence/infrastructure/mutation-barrier';
import { assertBackupExportNotCancelled } from './budget';

interface BackupZipStream {
  on(event: 'data', listener: (chunk: Uint8Array) => void): this;
  on(event: 'end', listener: () => void): this;
  on(event: 'error', listener: (error: unknown) => void): this;
  pause(): this;
  resume(): this;
}

interface StreamingBackupZip {
  generateInternalStream(options: { streamFiles: true; type: 'uint8array' }): BackupZipStream;
}

const temporaryBackupObjects = new WeakMap<Blob, string>();
const BACKUP_EXPORT_RELEASE_ATTEMPTS = 3;

export function generateBackupZipFileToOpfs(args: {
  signal?: AbortSignal | undefined;
  zip: StreamingBackupZip;
}): Promise<File> {
  return runWithPersistenceMutationTransition(async () => {
    assertBackupExportNotCancelled(args.signal);
    const writer = await createAssetObjectWriter(
      { mimeType: 'application/zip' },
      { persistenceTransition: 'already-admitted' }
    );
    try {
      const stream = args.zip.generateInternalStream({
        streamFiles: true,
        type: 'uint8array',
      });
      await pipeZipStream(stream, async (chunk) => {
        assertBackupExportNotCancelled(args.signal);
        const bytes = new Uint8Array(chunk.byteLength);
        bytes.set(chunk);
        await writer.append(new Blob([bytes.buffer]));
      });
      assertBackupExportNotCancelled(args.signal);
      const prepared = await writer.finalize();
      const file = await readAssetFile(prepared.ref, 'sniptale-backup.zip');
      temporaryBackupObjects.set(file, prepared.ref.assetId);
      return file;
    } catch (error) {
      try {
        await writer.abort();
      } catch (abortError) {
        throw new AggregateError(
          [error, abortError],
          'Media hub backup export failed and partial OPFS cleanup was incomplete.',
          { cause: error }
        );
      }
      throw error;
    }
  });
}

export async function releaseBackupZipFile(file: Blob): Promise<void> {
  const assetId = temporaryBackupObjects.get(file);
  if (!assetId) return;
  let lastError: unknown;
  for (let attempt = 0; attempt < BACKUP_EXPORT_RELEASE_ATTEMPTS; attempt += 1) {
    try {
      await discardPreparedAsset(assetId);
      temporaryBackupObjects.delete(file);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function pipeZipStream(
  stream: BackupZipStream,
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

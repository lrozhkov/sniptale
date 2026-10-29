import { measureImageBlob } from '@sniptale/platform/browser/media/image-dimensions';
import type { SyncProductCompletion } from '../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import type { scanSyncCatalog } from '../../workflows/sync-transfer/catalog';
import type { createWebdavRemoteStore } from '../../workflows/sync-transfer/webdav';
import { parsePortableSyncRoot } from '../../workflows/sync-transfer/prepared-root';
import { digestBackupObject } from '../../workflows/media-hub-backup/v6/shared-objects';

type Catalog = Awaited<ReturnType<typeof scanSyncCatalog>>;
type CatalogOperation =
  Catalog['operations'] extends Map<string, infer Operation> ? Operation : never;

async function readCheckedThumbnailBytes(
  remote: Awaited<ReturnType<typeof createWebdavRemoteStore>>,
  remoteKey: string,
  object: { size: number; mimeType: string },
  expectedDigest: string,
  signal: AbortSignal
) {
  const bytes: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  const stream = await remote.read(remoteKey, signal);
  await stream.pipeTo(
    new WritableStream<Uint8Array>({
      write(chunk) {
        size += chunk.byteLength;
        if (size > object.size || size > 1024 * 1024) throw new Error('Sync thumbnail limit');
        bytes.push(new Uint8Array(chunk));
      },
    }),
    { signal }
  );
  const blob = new Blob(bytes, { type: object.mimeType });
  if (
    size !== object.size ||
    (await digestBackupObject(
      { size, pipeTo: (sink) => blob.stream().pipeTo(sink, { signal }) },
      signal
    )) !== expectedDigest
  )
    throw new Error('Sync thumbnail digest mismatch');
  return { bytes, blob };
}

/** Read only the checked preview slot, with independent byte, digest and decoded-pixel bounds. */
export async function readSyncProductThumbnail(
  remote: Awaited<ReturnType<typeof createWebdavRemoteStore>>,
  operation: CatalogOperation,
  signal: AbortSignal
): Promise<Extract<SyncProductCompletion, { kind: 'thumbnail' }>> {
  const parsed = await parsePortableSyncRoot(
    operation.operation.envelope,
    operation.operation.reviewSourceMediaId
  );
  const thumbnailId =
    parsed.kind === 'image'
      ? parsed.metadata.presentation?.thumbnailObjectId
      : parsed.kind === 'media'
        ? undefined
        : parsed.metadata.thumbnail?.objectId;
  const object = parsed.envelope.objects.find((item) => item.objectId === thumbnailId);
  let dataUrl: string | null = null;
  let width = 0;
  let height = 0;
  if (
    object &&
    object.size <= 1024 * 1024 &&
    ['image/png', 'image/jpeg', 'image/webp'].includes(object.mimeType)
  ) {
    const digest = operation.operation.objects.find((item) => item.objectId === object.objectId);
    const binding = operation.attempts[0]?.objects.find(
      (item) => item.objectId === object.objectId
    );
    if (!digest || !binding) throw new Error('Sync thumbnail binding missing');
    const { bytes, blob } = await readCheckedThumbnailBytes(
      remote,
      binding.remoteKey,
      object,
      digest.sha256,
      signal
    );
    const dimensions = await measureImageBlob(blob);
    if (
      dimensions.width < 1 ||
      dimensions.height < 1 ||
      dimensions.width > 8192 ||
      dimensions.height > 8192 ||
      dimensions.width * dimensions.height > 16 * 1024 * 1024
    )
      throw new Error('Sync thumbnail dimensions refused');
    width = dimensions.width;
    height = dimensions.height;
    let binary = '';
    for (const chunk of bytes) for (const byte of chunk) binary += String.fromCharCode(byte);
    dataUrl = `data:${object.mimeType};base64,${btoa(binary)}`;
  }
  return { kind: 'thumbnail', dataUrl, width, height };
}

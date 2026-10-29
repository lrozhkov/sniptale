import { sha256 } from '@noble/hashes/sha2.js';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { AssetRef } from './contracts';
import { parseAssetRef } from './guards';
import {
  ASSET_ROOT_DIRECTORY_NAME,
  runWithAssetObjectLockIfAvailable,
  type AssetOpfsOptions,
} from './opfs-store';
import {
  acquirePersistenceMutationTransition,
  isActivePersistenceMutationTransitionPermit,
} from '../infrastructure/mutation-barrier';

const CHUNK_BYTES = 64 * 1024;
const MARKER_KIND = 'asset-residency-install';

/** The caller supplies staged bytes and a native binding/lifetime fence, without network IO. */
interface RestoreMissingAssetObjectInput {
  ref: AssetRef;
  sourceBlob: Blob;
  sha256: string;
  operationId: string;
  signal?: AbortSignal;
  assertCurrent: () => Promise<void>;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function optional<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    if (isRecord(error) && error['name'] === 'NotFoundError') return null;
    throw error;
  }
}

function canonicalMarker(ref: AssetRef, operationId: string, digest: string): string {
  return JSON.stringify({ version: 1, kind: MARKER_KIND, operationId, ref, sha256: digest });
}

function matchesMarker(text: string, expected: string): boolean {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return false;
  }
  if (
    !isRecord(value) ||
    Object.keys(value).sort().join(',') !== 'kind,operationId,ref,sha256,version' ||
    value['version'] !== 1 ||
    value['kind'] !== MARKER_KIND ||
    typeof value['operationId'] !== 'string' ||
    typeof value['sha256'] !== 'string' ||
    !isRecord(value['ref']) ||
    Object.keys(value['ref']).sort().join(',') !==
      'assetId,createdAt,location,mimeType,sha256,size' ||
    !isRecord(value['ref']['location']) ||
    Object.keys(value['ref']['location']).sort().join(',') !== 'kind,objectKey'
  )
    return false;
  const ref = parseAssetRef(value['ref']);
  return ref !== null && canonicalMarker(ref, value['operationId'], value['sha256']) === expected;
}

async function hashBlob(blob: Blob, check: () => void): Promise<string> {
  const hash = sha256.create();
  for (let offset = 0; offset < blob.size; offset += CHUNK_BYTES) {
    check();
    const chunk = new Uint8Array(await blob.slice(offset, offset + CHUNK_BYTES).arrayBuffer());
    check();
    hash.update(chunk);
  }
  return hex(hash.digest());
}

/** Add missing immutable bytes under the existing object lock and persistence transition. */
export async function restoreMissingAssetObject(
  input: RestoreMissingAssetObjectInput,
  options: AssetOpfsOptions = {}
): Promise<'installed' | 'already-present' | 'busy'> {
  const ref = parseAssetRef(input.ref);
  const { sourceBlob, operationId, signal, assertCurrent } = input;
  const expectedSha256 = input.sha256;
  if (
    !ref ||
    /[/\\]/u.test(ref.assetId) ||
    ref.assetId.includes(String.fromCharCode(0)) ||
    ref.assetId === '.' ||
    ref.assetId === '..' ||
    !/^[a-f0-9]{64}$/u.test(expectedSha256) ||
    operationId.trim().length === 0 ||
    (ref.sha256 !== null && ref.sha256 !== expectedSha256)
  )
    throw new Error('Asset residency binding is invalid.');
  if (sourceBlob.size !== ref.size) throw new Error('Asset residency source size mismatch.');
  const payload = canonicalMarker(ref, operationId, expectedSha256);
  const markerName = `${hex(sha256(new TextEncoder().encode(payload)))}.json`;
  const check = () => {
    signal?.throwIfAborted();
    if (
      options.persistenceTransitionPermit &&
      !isActivePersistenceMutationTransitionPermit(options.persistenceTransitionPermit)
    )
      throw new Error('Persistence transition permit is not active.');
  };
  const current = async () => {
    check();
    await assertCurrent();
    check();
  };
  await current();
  const lease = options.persistenceTransitionPermit
    ? null
    : await acquirePersistenceMutationTransition();
  try {
    await current();
    const result = await runWithAssetObjectLockIfAvailable(
      ref.assetId,
      async () => {
        await current();
        const origin = await (options.getOriginRoot
          ? options.getOriginRoot()
          : navigator.storage.getDirectory());
        await current();
        const root = await origin.getDirectoryHandle(ASSET_ROOT_DIRECTORY_NAME, { create: true });
        const writing = await optional(() => root.getDirectoryHandle('writing'));
        if (writing) {
          const writer = await optional(() => writing.getFileHandle(ref.assetId));
          if (writer) throw new Error('Asset has an existing writing marker.');
        }
        const residency = await root.getDirectoryHandle('residency', { create: true });
        const markers = await residency.getDirectoryHandle(ref.assetId, { create: true });
        let marker: FileSystemFileHandle | null = null;
        for await (const [name, handle] of markers.entries()) {
          if (name !== markerName || handle.kind !== 'file') {
            throw new Error('Asset has a foreign residency marker.');
          }
          marker = await markers.getFileHandle(name);
        }
        const hadOwnMarker = marker !== null;
        if (marker) {
          const file = await marker.getFile();
          if (file.size !== 0 && !matchesMarker(await file.text(), payload)) {
            throw new Error('Asset residency marker is invalid.');
          }
        }
        const objects = await root.getDirectoryHandle('objects', { create: true });
        let target = await optional(() => objects.getFileHandle(ref.assetId));
        if (target) {
          const file = await target.getFile();
          if (file.size === ref.size && (await hashBlob(file, check)) === expectedSha256) {
            await current();
            if (marker) await markers.removeEntry(markerName);
            await current();
            return 'already-present' as const;
          }
          if (file.size !== 0 || !hadOwnMarker) {
            throw new Error('Existing asset bytes do not match the residency binding.');
          }
        }
        await current();
        marker ??= await markers.getFileHandle(markerName, { create: true });
        const markerStream = await marker.createWritable({ keepExistingData: false });
        try {
          await markerStream.write(payload);
          await current();
          await markerStream.close();
        } catch (error) {
          await markerStream.abort().catch(() => undefined);
          throw error;
        }
        await current();
        target ??= await objects.getFileHandle(ref.assetId, { create: true });
        await current();
        const writable = await target.createWritable({ keepExistingData: false });
        let closing = false;
        try {
          const hash = sha256.create();
          let written = 0;
          for (let offset = 0; offset < sourceBlob.size; offset += CHUNK_BYTES) {
            check();
            const chunk = new Uint8Array(
              await sourceBlob.slice(offset, offset + CHUNK_BYTES).arrayBuffer()
            );
            check();
            hash.update(chunk);
            await writable.write(chunk);
            check();
            written += chunk.byteLength;
          }
          if (written !== ref.size || hex(hash.digest()) !== expectedSha256) {
            throw new Error('Asset residency source checksum mismatch.');
          }
          await current();
          closing = true;
          await writable.close();
          await current();
          const committed = await target.getFile();
          if (committed.size !== ref.size)
            throw new Error('Asset residency committed size mismatch.');
          await current();
          await markers.removeEntry(markerName);
          await current();
          return 'installed' as const;
        } catch (error) {
          // A rejected close can already have committed. Retain that target and its marker.
          if (!closing) await writable.abort().catch(() => undefined);
          throw error;
        }
      },
      options
    );
    await current();
    return result ?? 'busy';
  } finally {
    await lease?.release();
  }
}

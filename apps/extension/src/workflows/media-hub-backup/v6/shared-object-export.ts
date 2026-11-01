import { sha256 as createHash } from '@noble/hashes/sha2.js';
import { parseRootEnvelope } from './codec';
import { digestBackupObject } from './shared-objects';
import { openArchiveRootObjectSource } from './object-source';
import { sharedRootEnvelopeValue } from './shared-object-envelope';
import type {
  ArchiveRootObjectSource,
  MediaHubBackupRootInventoryItem,
  MediaHubBackupSharedObject,
} from './contracts';

interface PreparedSharedRoot {
  metadata: ReturnType<typeof sharedRootEnvelopeValue>;
  objects: ArchiveRootObjectSource[];
}

/** One export owns this registry; independent readable entries keep their selected paths. */
export async function prepareSharedBackupExport(
  roots: readonly MediaHubBackupRootInventoryItem[],
  signal?: AbortSignal
): Promise<{ roots: PreparedSharedRoot[]; sharedObjects: MediaHubBackupSharedObject[] }> {
  const content = new Map<string, MediaHubBackupSharedObject>();
  const shared = new Map<string, MediaHubBackupSharedObject>();
  const prepared: PreparedSharedRoot[] = [];
  for (const item of roots) {
    signal?.throwIfAborted();
    const payload = await item.load(signal);
    const envelope = parseRootEnvelope({
      descriptor: item.descriptor,
      metadata: payload.metadata,
      objects: payload.objects.map((object) => object.ref),
    });
    const aliases = new Map<string, string>();
    const objects: ArchiveRootObjectSource[] = [];
    for (const [index, object] of payload.objects.entries()) {
      const source = await openArchiveRootObjectSource(object, signal);
      const ref = envelope.objects[index]!;
      if (source.size !== ref.size) throw new Error('Media backup object source size changed.');
      const sha256 = await digestBackupObject(source, signal);
      const mimeType = ref.mimeType.toLowerCase();
      const key = `${sha256}:${ref.size}:${mimeType}`;
      const existing = content.get(key);
      if (existing && ref.path.startsWith('_sniptale/assets/')) {
        aliases.set(ref.objectId, existing.id);
        shared.set(existing.id, existing);
      } else {
        if (object.open) {
          objects.push({
            ref,
            open: async (signal) => {
              const loaded = await openArchiveRootObjectSource(object, signal);
              return {
                size: loaded.size,
                async pipeTo(sink, abort) {
                  const writer = sink.getWriter();
                  const digest = createHash.create();
                  let bytes = 0;
                  try {
                    await loaded.pipeTo(
                      new WritableStream<Uint8Array>({
                        async write(chunk) {
                          abort?.throwIfAborted();
                          if (!(chunk instanceof Uint8Array))
                            throw new Error('Media backup object source emitted invalid bytes.');
                          bytes += chunk.byteLength;
                          if (!Number.isSafeInteger(bytes) || bytes > ref.size)
                            throw new Error('Media backup object source size changed.');
                          digest.update(chunk);
                          await writer.write(chunk);
                        },
                      }),
                      abort
                    );
                    abort?.throwIfAborted();
                    const actual = Array.from(digest.digest(), (byte) =>
                      byte.toString(16).padStart(2, '0')
                    ).join('');
                    if (bytes !== ref.size || actual !== sha256)
                      throw new Error('Media backup object source content changed.');
                    await writer.close();
                  } catch (error) {
                    await writer.abort(error).catch(() => undefined);
                    throw error;
                  } finally {
                    writer.releaseLock();
                  }
                },
              };
            },
          });
        } else objects.push(object);
        if (!existing)
          content.set(key, {
            id: `shared-${String(content.size + 1).padStart(6, '0')}`,
            path: ref.path,
            sha256,
            mimeType,
            size: ref.size,
          });
      }
    }
    prepared.push({ metadata: sharedRootEnvelopeValue(envelope, aliases), objects });
  }
  return { roots: prepared, sharedObjects: [...shared.values()] };
}

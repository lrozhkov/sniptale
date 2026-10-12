import { parseRootEnvelope } from './codec';
import { digestBackupObject } from './shared-objects';
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
      const blob = object.blob;
      const ref = envelope.objects[index]!;
      if (blob.size !== ref.size) throw new Error('Media backup object source size changed.');
      const sha256 = await digestBackupObject(
        {
          size: blob.size,
          pipeTo: (writable, abort) =>
            blob.stream().pipeTo(writable, abort ? { signal: abort } : {}),
        },
        signal
      );
      const mimeType = ref.mimeType.toLowerCase();
      const key = `${sha256}:${ref.size}:${mimeType}`;
      const existing = content.get(key);
      if (existing && ref.path.startsWith('_sniptale/assets/')) {
        aliases.set(ref.objectId, existing.id);
        shared.set(existing.id, existing);
      } else {
        objects.push({ blob, ref });
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

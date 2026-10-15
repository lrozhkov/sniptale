import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { ArchiveObjectRef } from '../../../composition/archive-transfer';
import { parseRootEnvelope } from './codec';
import type {
  MediaHubBackupRootEnvelope,
  MediaHubBackupSharedObject,
  MediaHubBackupSharedReference,
  MediaHubBackupManifestV6,
} from './contracts';
import { isSharedBackupLayout, assertReviewProjectLayout } from './layout';

/** Each read receives its own strictly parsed manifest; legacy layouts cannot admit aliases. */
export function parseBackupRootEnvelope(value: unknown, manifest: MediaHubBackupManifestV6) {
  if (isSharedBackupLayout(manifest.layout)) {
    if (!manifest.sharedObjects) throw new Error('Media backup shared object table is missing.');
    return parseSharedRootEnvelope(value, manifest.sharedObjects);
  }
  const envelope = parseRootEnvelope(value);
  assertReviewProjectLayout(envelope.metadata, manifest.layout);
  return { envelope, directObjects: envelope.objects, sharedIds: [] };
}

/** V3 aliases are explicit physical links; the legacy root-local parser stays unchanged. */
export function parseSharedRootEnvelope(
  value: unknown,
  sharedObjects: readonly MediaHubBackupSharedObject[]
): {
  envelope: MediaHubBackupRootEnvelope;
  directObjects: ArchiveObjectRef[];
  sharedIds: string[];
} {
  if (!isRecord(value) || !Array.isArray(value['objects']))
    throw new Error('Media backup root metadata is invalid.');
  const table = new Map(sharedObjects.map((object) => [object.id, object]));
  const aliases = new Map<number, MediaHubBackupSharedObject>();
  const reservedPaths = new Set(
    value['objects'].flatMap((raw: unknown) =>
      isRecord(raw) && typeof raw['path'] === 'string' ? [raw['path'].toLowerCase()] : []
    )
  );
  const objects = value['objects'].map((raw: unknown, index: number) => {
    if (!isRecord(raw) || !('sharedObjectId' in raw)) return raw;
    if (
      Object.keys(raw).length !== 5 ||
      'path' in raw ||
      typeof raw['sharedObjectId'] !== 'string' ||
      typeof raw['objectId'] !== 'string' ||
      typeof raw['filename'] !== 'string'
    )
      throw new Error('Media backup shared reference is invalid.');
    const shared = table.get(raw['sharedObjectId']);
    if (
      !shared ||
      typeof raw['mimeType'] !== 'string' ||
      raw['mimeType'].toLowerCase() !== shared.mimeType ||
      raw['size'] !== shared.size
    )
      throw new Error('Media backup shared reference does not match its table.');
    aliases.set(index, shared);
    const { sharedObjectId: _shared, ...local } = raw;
    // Private placeholders admit local fields through the legacy codec; no I/O uses them.
    let sequence = index;
    let path = `Screenshots/.shared-admission/${sequence}.bin`;
    while (reservedPaths.has(path.toLowerCase())) {
      sequence += 1;
      path = `Screenshots/.shared-admission/${sequence}.bin`;
    }
    reservedPaths.add(path.toLowerCase());
    return { ...local, path };
  });
  const admitted = parseRootEnvelope({ ...value, objects });
  const directObjects = admitted.objects.filter((_object, index) => !aliases.has(index));
  return {
    directObjects,
    sharedIds: [...aliases.values()].map((object) => object.id),
    envelope: {
      ...admitted,
      objects: admitted.objects.map((object, index) => {
        const shared = aliases.get(index);
        return shared ? { ...object, path: shared.path } : object;
      }),
    },
  };
}

/** Export changes only the wire link; local IDs, filenames and role metadata survive. */
export function sharedRootEnvelopeValue(
  envelope: MediaHubBackupRootEnvelope,
  aliases: ReadonlyMap<string, string>
) {
  return {
    ...envelope,
    objects: envelope.objects.map((object): ArchiveObjectRef | MediaHubBackupSharedReference => {
      const sharedObjectId = aliases.get(object.objectId);
      if (!sharedObjectId) return object;
      const { path: _path, ...local } = object;
      return { ...local, sharedObjectId };
    }),
  };
}

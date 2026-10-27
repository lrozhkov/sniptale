import { expect, it } from 'vitest';
import { parseRootEnvelope } from '../media-hub-backup/v6/codec';
import { createMediaLibraryEntry } from '../../composition/persistence/projects/index.test-support';
import {
  createSyncAttempt,
  hashSyncText,
  parseSyncAttemptText,
  parseSyncOperationText,
} from './wire-record';

function operation(deleted = false) {
  const envelope = {
    descriptor: {
      rootKind: 'media',
      rootId: 'project-asset:source',
      mediaSubtype: 'library-item',
      metadataPath: 'Metadata/sync-root.json',
      objectCount: 1,
      totalBytes: 3,
    },
    metadata: {
      entry: createMediaLibraryEntry({
        id: 'project-asset:source',
        filename: 'original 100%.png',
        source: { kind: 'project-asset', projectAssetId: 'source' },
        mimeType: 'image/png',
        size: 3,
        workspaceRevision: 0,
        lifecycle: { savedAt: 1, storageClass: 'library', updatedAt: 1 },
      }),
      originalObjectId: 'sync-object-000001',
      projectAsset: { id: 'source', mimeType: 'image/png', size: 3, createdAt: 1 },
    },
    objects: [
      {
        objectId: 'sync-object-000001',
        path: '_sniptale/assets/sync-object-000001/original 100%.png',
        filename: 'original 100%.png',
        mimeType: 'image/png',
        size: 3,
      },
    ],
  };
  return {
    format: 'sniptale-sync-operation',
    version: 1,
    spaceId: 'space',
    operationId: 'operation',
    rootKind: 'media',
    rootId: 'project-asset:source',
    kind: deleted ? 'delete' : 'edit',
    parents: ['parent'],
    dependencies: [],
    envelope: deleted ? null : parseRootEnvelope(envelope),
    objects: deleted ? [] : [{ objectId: 'sync-object-000001', sha256: 'a'.repeat(64) }],
  };
}
const id1 = '00000000-0000-0000-0000-000000000001';
const id2 = '00000000-0000-0000-0000-000000000002';
it('keeps identical logical bytes under different checked physical file and manifest keys', async () => {
  const text = JSON.stringify(operation());
  const first = await createSyncAttempt(text, id1);
  const second = await createSyncAttempt(text, id2);
  expect(first.recordKey).not.toBe(second.recordKey);
  expect(first.objects[0]?.remoteKey).not.toBe(second.objects[0]?.remoteKey);
  expect(first.objects[0]?.remoteKey).toContain('original 100%.png');
  for (const attempt of [first, second]) {
    const parsed = await parseSyncAttemptText(attempt.recordText);
    expect(parsed.operation).toEqual(operation());
    expect(parsed.recordSha256).toBe(hashSyncText(attempt.recordText));
    expect(JSON.parse(attempt.recordText)['operationText']).toBe(text);
  }
});
it('supports a tombstone without files or a portable domain payload', async () => {
  const text = JSON.stringify(operation(true));
  expect(await parseSyncOperationText(text)).toEqual(operation(true));
  expect((await createSyncAttempt(text, id1)).objects).toEqual([]);
});
it.each([
  ['version', (value: ReturnType<typeof operation>) => ({ ...value, version: 2 })],
  [
    'unknown field',
    (value: ReturnType<typeof operation>) => ({ ...value, nativePath: '/private' }),
  ],
  [
    'self parent',
    (value: ReturnType<typeof operation>) => ({ ...value, parents: [value.operationId] }),
  ],
  [
    'duplicate parents',
    (value: ReturnType<typeof operation>) => ({ ...value, parents: ['parent', 'parent'] }),
  ],
  ['unsupported kind', (value: ReturnType<typeof operation>) => ({ ...value, kind: 'replace' })],
  ['missing object hash', (value: ReturnType<typeof operation>) => ({ ...value, objects: [] })],
  [
    'duplicate object hash',
    (value: ReturnType<typeof operation>) => ({
      ...value,
      objects: [value.objects[0], value.objects[0]],
    }),
  ],
  ['mismatched root', (value: ReturnType<typeof operation>) => ({ ...value, rootId: 'other' })],
  ['tombstone with files', (value: ReturnType<typeof operation>) => ({ ...value, kind: 'delete' })],
  [
    'media dependency',
    (value: ReturnType<typeof operation>) => ({
      ...value,
      dependencies: [{ mediaId: 'other', basis: ['a'] }],
    }),
  ],
])('refuses %s before remote use', async (_label, change) => {
  await expect(parseSyncOperationText(JSON.stringify(change(operation())))).rejects.toThrow();
});
it('refuses noncanonical, truncated and oversized logical records', async () => {
  for (const text of [JSON.stringify(operation(), null, 2), '{', ' '.repeat(4 * 1024 * 1024 + 1)]) {
    await expect(parseSyncOperationText(text)).rejects.toThrow();
  }
});
it('refuses physical mapping substitution and altered logical bytes', async () => {
  const first = await createSyncAttempt(JSON.stringify(operation()), id1);
  const value = JSON.parse(first.recordText);
  for (const changed of [
    { ...value, objects: [{ objectId: 'sync-object-000001', remoteKey: 'Files/other.png' }] },
    { ...value, operationText: value.operationText + ' ' },
    { ...value, extra: true },
  ]) {
    await expect(parseSyncAttemptText(JSON.stringify(changed))).rejects.toThrow();
  }
});

import { expect, it } from 'vitest';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { parseRootEnvelope } from '../media-hub-backup/v6/codec';
import { createMediaLibraryEntry } from '../../composition/persistence/projects/index.test-support';
import { workspace as reviewWorkspace } from '../../composition/persistence/review-workspaces/backup-restore.test-support';
import { materializeVideoWorkspaceProject } from '../../composition/persistence/review-workspaces/project-metadata';
import { encodePortableReviewAssetRefs } from '../../composition/persistence/review-workspaces/asset-refs';
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

function reviewOperation(archived = false) {
  const base = operation();
  if (!base.envelope) throw new Error('Missing review carrier.');
  const rootId = archived ? 'project-asset:quick-project:previous' : 'project-asset:source';
  const childId = rootId.slice('project-asset:'.length);
  const { sourceAssetId: _localId, ...workspace } = materializeVideoWorkspaceProject(
    {
      ...reviewWorkspace,
      aggregateId: rootId,
      source: { ...reviewWorkspace.source, size: 3 },
      history: [],
      cursor: 0,
    },
    'Saved review'
  );
  const envelope = parseRootEnvelope({
    ...base.envelope,
    descriptor: { ...base.envelope.descriptor, rootId },
    metadata: {
      entry: createMediaLibraryEntry({
        id: rootId,
        source: { kind: 'project-asset', projectAssetId: childId },
        kind: 'video',
        mimeType: 'video/webm',
        size: 3,
        lifecycle: { savedAt: 1, storageClass: 'library', updatedAt: 1 },
      }),
      projectAsset: { id: childId, createdAt: 1, mimeType: 'video/webm', size: 3 },
      originalObjectId: 'sync-object-000001',
      videoReview: encodePortableReviewAssetRefs({ workspace, draft: null }),
    },
    objects: base.envelope.objects.map((object) => ({ ...object, mimeType: 'video/webm' })),
  });
  const {
    kind,
    parents,
    dependencies: _dependencies,
    envelope: _envelope,
    objects,
    ...head
  } = base;
  return {
    ...head,
    rootKind: 'video-review',
    rootId,
    reviewSourceMediaId: 'project-asset:source',
    kind,
    parents,
    dependencies: [{ mediaId: 'project-asset:source', basis: ['source-operation'] }],
    envelope,
    objects,
  };
}

it.each([false, true])(
  'keeps a source-dependent review separate from its media carrier (archived=%s)',
  async (archived) => {
    const value = reviewOperation(archived);
    const text = JSON.stringify(value);
    expect(await parseSyncOperationText(text)).toEqual(value);
    const restored = { ...value, kind: 'restore' };
    expect(await parseSyncOperationText(JSON.stringify(restored))).toEqual(restored);
    const attempt = await createSyncAttempt(text, id1);
    expect((await parseSyncAttemptText(attempt.recordText)).operation).toEqual(value);
    expect(value.envelope.descriptor.rootKind).toBe('media');
    expect(value.envelope.descriptor.rootId).toBe(value.rootId);
  }
);

it('preserves original wire fields and accepts review deletion without source binding', async () => {
  const original = operation();
  const parsed = await parseSyncOperationText(JSON.stringify(original));
  expect(JSON.stringify(parsed)).toBe(JSON.stringify(original));
  expect(parsed).not.toHaveProperty('reviewSourceMediaId');
  const { reviewSourceMediaId: _source, ...review } = reviewOperation(true);
  const deleted = { ...review, kind: 'delete', dependencies: [], envelope: null, objects: [] };
  expect(await parseSyncOperationText(JSON.stringify(deleted))).toEqual(deleted);
});

it.each([
  [
    'missing binding',
    (value: ReturnType<typeof reviewOperation>) => {
      const { reviewSourceMediaId: _source, ...rest } = value;
      return rest;
    },
  ],
  [
    'binding on media',
    (value: ReturnType<typeof reviewOperation>) => ({ ...value, rootKind: 'media' }),
  ],
  [
    'binding on project',
    (value: ReturnType<typeof reviewOperation>) => ({ ...value, rootKind: 'video-project' }),
  ],
  [
    'binding on deletion',
    (value: ReturnType<typeof reviewOperation>) => ({
      ...value,
      kind: 'delete',
      dependencies: [],
      envelope: null,
      objects: [],
    }),
  ],
  [
    'missing source dependency',
    (value: ReturnType<typeof reviewOperation>) => ({ ...value, dependencies: [] }),
  ],
  [
    'unadmitted source alias',
    (value: ReturnType<typeof reviewOperation>) => ({
      ...value,
      reviewSourceMediaId: 'project-asset:other',
    }),
  ],
  [
    'unsupported source family',
    (value: ReturnType<typeof reviewOperation>) => ({
      ...value,
      reviewSourceMediaId: 'recording:source',
      dependencies: [{ mediaId: 'recording:source', basis: ['source-operation'] }],
    }),
  ],
  [
    'empty binding',
    (value: ReturnType<typeof reviewOperation>) => ({ ...value, reviewSourceMediaId: '' }),
  ],
])('refuses review %s', async (_label, change) => {
  const text = JSON.stringify(change(reviewOperation(true)));
  await expect(parseSyncOperationText(text)).rejects.toThrow();
});

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

it('round-trips canonical reused mappings across revisions and different logical object IDs', async () => {
  const first = await createSyncAttempt(JSON.stringify(operation()), id1);
  const revised = operation();
  revised.operationId = 'next';
  revised.parents = ['operation'];
  if (!revised.envelope) throw new Error('Missing envelope.');
  revised.envelope.objects[0]!.objectId = 'different-logical-object';
  revised.envelope.objects[0]!.path = '_sniptale/assets/different-logical-object/original 100%.png';
  if (!isRecord(revised.envelope.metadata)) throw new Error('Missing media metadata.');
  revised.envelope.metadata = {
    ...revised.envelope.metadata,
    originalObjectId: 'different-logical-object',
  };
  revised.objects[0]!.objectId = 'different-logical-object';
  const reused = await createSyncAttempt(JSON.stringify(revised), id2, [
    { objectId: 'different-logical-object', remoteKey: first.objects[0]!.remoteKey },
  ]);
  const parsed = await parseSyncAttemptText(reused.recordText);
  expect(parsed.objects[0]?.remoteKey).toBe(first.objects[0]?.remoteKey);
  expect(parsed.recordKey).not.toBe(first.recordKey);
  expect(parsed.operation).toEqual(revised);
});
it.each([
  ['foreign space', (key: string) => key.replace(hashSyncText('space'), hashSyncText('foreign'))],
  ['unknown namespace', (key: string) => key.replace('Files/', 'Originals/')],
  ['invalid UUID', (key: string) => key.replace(id1, 'not-uuid')],
  ['traversal object', (key: string) => key.replace('/sync-object-000001/', '/../')],
  ['dot object', (key: string) => key.replace('/sync-object-000001/', '/./')],
  ['encoded object', (key: string) => key.replace('/sync-object-000001/', '/%2e%2e/')],
  ['unsafe object', (key: string) => key.replace('/sync-object-000001/', '/bad:object/')],
  ['control object', (key: string) => key.replace('/sync-object-000001/', '/bad\u0000object/')],
  ['wrong filename', (key: string) => key.replace('original 100%.png', 'other.png')],
  [
    'extra segment',
    (key: string) => key.replace('/sync-object-000001/', '/extra/sync-object-000001/'),
  ],
  ['oversized key', (key: string) => key.replace('/sync-object-000001/', `/${'x'.repeat(2048)}/`)],
])('rejects %s retained physical mappings in construction and parsing', async (_label, change) => {
  const first = await createSyncAttempt(JSON.stringify(operation()), id1);
  const objects = [{ ...first.objects[0]!, remoteKey: change(first.objects[0]!.remoteKey) }];
  await expect(createSyncAttempt(JSON.stringify(operation()), id2, objects)).rejects.toThrow();
  const value = JSON.parse(first.recordText);
  await expect(parseSyncAttemptText(JSON.stringify({ ...value, objects }))).rejects.toThrow();
});

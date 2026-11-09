import { parseCapturedMediaRows } from './guards';
import { createCleanupWebSnapshotRecord } from '../../../workflows/media-hub/cleanup.test-support';
import { PAGE_PACKAGE_ARCHIVE_MIME_TYPE } from '@sniptale/runtime-contracts/page-package';
import { createQuickEditWebcam } from '../../../features/video/review/advanced/webcam';
import { materializeVideoWorkspaceProject } from '../review-workspaces/project-metadata';
import { createPersistedEditorDocumentFixture } from '../document-assets/test-support';
import { createEditorDocumentFixture } from '../../../editor/document/page-session/document.test-support';
import {
  createVideoProjectEntryWithMediaClip,
  createProjectAssetEntry,
} from '../projects/index.test-support';
import { workspace as reviewWorkspace } from '../review-workspaces/backup-restore.test-support';
import { deferCheckpointInTransaction } from './checkpoints';
import { createGuideProject } from '../../../features/scenario/project/factories';
import { createScenarioProjectEntry } from '../scenario/projects/entry';
import { encodeCapturedScenarioRoot } from '../../../workflows/sync-transfer/captured-scenario';
import { hashSyncText } from '../../../workflows/sync-transfer/wire-record';
import { assetResidencyCopyId, type AssetResidencyCopy } from '../assets/residency-records';
import type { AssetRef } from '../assets';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { createNativeCapture } from './test-support/frozen-snapshot-database';
import { beforeEach, expect, it, vi } from 'vitest';
import { sha256 } from '@noble/hashes/sha2.js';
import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import { createMediaLibraryEntry } from '../projects/index.test-support';
import { captureRootKey, type CapturedChange } from './contracts';
import {
  commitPreparedOutgoingOperation,
  loadPreparedOutgoingOperation,
  loadNativeOutgoingCapture,
  preparedOutgoingOperationKey,
  type PreparedOutgoingOperationDraft,
} from './outgoing';

const io = vi.hoisted(() => ({ database: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: io.database,
}));
beforeEach(() => vi.clearAllMocks());

function draft(capture: CapturedChange, text = '{"record":1}'): PreparedOutgoingOperationDraft {
  const refs = capture.change.kind === 'media' ? [capture.change.rows.ref] : [];
  return {
    version: 1,
    key: preparedOutgoingOperationKey(capture.spaceId, capture.operationId),
    createdAt: capture.createdAt,
    spaceId: capture.spaceId,
    connectionGeneration: capture.connectionGeneration,
    captureKey: capture.key,
    rootKey: capture.rootKey,
    generation: capture.generation,
    operationId: capture.operationId,
    recordText: text,
    recordSha256: Array.from(sha256(new TextEncoder().encode(text)), (byte) =>
      byte.toString(16).padStart(2, '0')
    ).join(''),
    objects: refs.map((ref) => ({
      objectId: 'body',
      filename: 'original.png',
      ref,
      sha256: 'b'.repeat(64),
    })),
  };
}

function setup() {
  let fail = false;
  const fixture = createReviewWorkspaceStoreFixture((name) => fail && name === 'sync_outbox');
  const table = (name: string) => fixture.rows.get(name)!;
  io.database.mockResolvedValue(fixture.database);
  table('sync_capture').set('profile', {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 1,
    enabled: true,
    spaceId: 'space',
    connectionGeneration: 3,
  });
  const ref = {
    assetId: 'body',
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: 'objects/body' },
    mimeType: 'image/png',
    sha256: 'b'.repeat(64),
    size: 6,
  };
  const media = createMediaLibraryEntry({
    id: 'project-asset:source',
    source: { kind: 'project-asset', projectAssetId: 'source' },
    mimeType: ref.mimeType,
    size: ref.size,
    lifecycle: { savedAt: 1, storageClass: 'library', updatedAt: 1 },
  });
  const capture: CapturedChange = createNativeCapture({
    version: 1,
    kind: 'sync-operation',
    key: '["change","op"]',
    createdAt: 1,
    spaceId: 'space',
    connectionGeneration: 3,
    rootKind: 'media',
    rootId: media.id,
    rootKey: captureRootKey('space', 'media', media.id),
    generation: 1,
    operationId: 'op',
    basis: [],
    origin: 'local-edit',
    publicationId: null,
    change: {
      kind: 'media',
      rows: {
        media,
        ref,
        projectAsset: {
          id: 'source',
          assetId: ref.assetId,
          mimeType: ref.mimeType,
          size: ref.size,
          createdAt: 1,
        },
      },
    },
  });
  table('sync_capture').set(capture.key, structuredClone(capture));
  return {
    ...fixture,
    table,
    capture,
    failWrites(value: boolean) {
      fail = value;
    },
  };
}

it('detaches admission inputs and replaces native rows with one portable payload', async () => {
  const f = setup();
  const proposed = draft(f.capture);
  const expected = structuredClone(proposed);
  const pending = commitPreparedOutgoingOperation(f.capture, proposed);
  proposed.recordText = 'changed';
  f.capture.generation++;
  expect(await pending).toMatchObject(expected);
  const stored = f.table('sync_capture').get(f.capture.key);
  expect(stored).toMatchObject({
    phase: 'prepared',
    prepared: {
      recordText: expected.recordText,
      recordSha256: expected.recordSha256,
      objects: expected.objects,
    },
  });
  expect(stored).not.toHaveProperty('change');
  expect([...f.table('sync_outbox').values()]).toEqual([
    expect.objectContaining({ kind: 'operation-locator' }),
  ]);
  expect(
    JSON.stringify([...f.rows.values()].flatMap((table) => [...table.values()])).match(
      /recordText/gu
    )
  ).toHaveLength(1);
});

it('returns the first accepted encoding on retry and controlled concurrent preparation', async () => {
  const f = setup();
  let release!: () => void;
  io.database.mockResolvedValueOnce(f.database).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = () => resolve(f.database);
      })
  );
  const first = commitPreparedOutgoingOperation(f.capture, draft(f.capture));
  const second = commitPreparedOutgoingOperation(f.capture, draft(f.capture, '{"record":2}'));
  const accepted = await first;
  release();
  expect(await second).toEqual(accepted);
  expect(await loadPreparedOutgoingOperation('space', 'op')).toEqual(accepted);
});

it.each(['capture', 'missing', 'disabled', 'connection', 'lifetime', 'space'])(
  'refuses changed %s before replacing valid source data',
  async (kind) => {
    const f = setup();
    if (kind === 'capture')
      f.table('sync_capture').set(f.capture.key, { ...f.capture, createdAt: 9 });
    if (kind === 'missing') f.table('sync_capture').delete(f.capture.key);
    if (!['capture', 'missing'].includes(kind))
      f.table('sync_capture').set('profile', {
        version: 1,
        kind: 'profile',
        key: 'profile',
        createdAt: kind === 'lifetime' ? 99 : 1,
        enabled: kind !== 'disabled',
        spaceId: kind === 'space' ? 'other' : 'space',
        connectionGeneration: kind === 'connection' ? 4 : 3,
      });
    const before = structuredClone(f.rows);
    await expect(commitPreparedOutgoingOperation(f.capture, draft(f.capture))).rejects.toThrow();
    expect(f.rows).toEqual(before);
  }
);

it('retains accepted older operations after deletion and recreation under the same root identity', async () => {
  const f = setup();
  const deletion = createNativeCapture({
    ...f.capture,
    key: 'deletion',
    operationId: 'deletion',
    generation: 2,
    change: { kind: 'tombstone' },
  });
  const recreated = createNativeCapture({
    ...f.capture,
    key: 'recreated',
    operationId: 'recreated',
    generation: 3,
  });
  f.table('sync_capture').set(deletion.key, deletion);
  f.table('sync_capture').set(recreated.key, recreated);
  const earlier = await commitPreparedOutgoingOperation(f.capture, draft(f.capture));
  expect(await commitPreparedOutgoingOperation(recreated, draft(recreated))).not.toEqual(earlier);
  expect(await commitPreparedOutgoingOperation(deletion, draft(deletion))).toMatchObject({
    objects: [],
  });
});

it('rolls back source replacement and locator on write failure, then permits retry', async () => {
  const f = setup();
  const before = structuredClone(f.rows);
  f.failWrites(true);
  await expect(commitPreparedOutgoingOperation(f.capture, draft(f.capture))).rejects.toThrow(
    'No space'
  );
  expect(f.rows).toEqual(before);
  f.failWrites(false);
  await commitPreparedOutgoingOperation(f.capture, draft(f.capture));
  expect(f.table('sync_capture').get(f.capture.key)).toMatchObject({ phase: 'prepared' });
});

it.each(['digest', 'ref', 'filename', 'count', 'record-size', 'tombstone'])(
  'refuses invalid %s before database admission',
  async (kind) => {
    const f = setup();
    const proposed = draft(f.capture);
    if (kind === 'digest') proposed.recordSha256 = 'a'.repeat(64);
    if (kind === 'ref') proposed.objects[0]!.ref.size++;
    if (kind === 'filename') proposed.objects[0]!.filename = '';
    if (kind === 'count') proposed.objects = Array.from({ length: 65 }, () => proposed.objects[0]!);
    if (kind === 'record-size') proposed.recordText = 'x'.repeat(4 * 1024 * 1024 + 1);
    if (kind === 'tombstone') f.capture.change = { kind: 'tombstone' };
    await expect(commitPreparedOutgoingOperation(f.capture, proposed)).rejects.toThrow('Invalid');
    expect(io.database).not.toHaveBeenCalled();
  }
);

it.each(['locator', 'payload', 'lifetime'])(
  'refuses corrupted %s on write-free reads',
  async (kind) => {
    const f = setup();
    expect(await loadPreparedOutgoingOperation('space', 'op')).toBeNull();
    const prepared = await commitPreparedOutgoingOperation(f.capture, draft(f.capture));
    if (kind === 'locator')
      f.table('sync_outbox').set(prepared.key, { key: prepared.key, kind: 'old-experiment' });
    if (kind === 'lifetime')
      f.table('sync_outbox').set(prepared.key, {
        key: prepared.key,
        kind: 'operation-locator',
        captureKey: f.capture.key,
        spaceId: 'space',
        operationId: 'op',
        profileCreatedAt: 99,
        connectionGeneration: 3,
        sourceSha256: f.capture.sourceSha256,
      });
    if (kind === 'payload')
      f.table('sync_capture').set(f.capture.key, {
        ...f.capture,
        phase: 'prepared',
        prepared: { ...prepared, recordText: 'changed' },
      });
    const before = structuredClone(f.rows);
    await expect(loadPreparedOutgoingOperation('space', 'op')).rejects.toThrow('Invalid');
    expect(f.rows).toEqual(before);
  }
);

function imageCapture(f: ReturnType<typeof setup>): CapturedChange {
  const media = createMediaLibraryEntry({
    id: 'screenshot-source',
    kind: 'screenshot',
    source: { kind: 'screenshot' },
    mimeType: 'image/png',
    size: 6,
    blob: new Blob(['source'], { type: 'image/png' }),
    workspaceRevision: 0,
    imageContentState: 'original',
    lifecycle: { savedAt: 1, updatedAt: 1, storageClass: 'library' },
  });
  const capture = createNativeCapture({
    ...f.capture,
    rootId: media.id,
    rootKey: captureRootKey('space', 'media', media.id),
    change: { kind: 'image', rows: { media, workspace: null, presentation: null, refs: [] } },
  });
  f.table('sync_capture').set(capture.key, structuredClone(capture));
  return capture;
}

it('reloads authoritative image bytes instead of accepting a caller replacement Blob', async () => {
  const f = setup();
  const capture = imageCapture(f);
  if (capture.change.kind !== 'image') throw new Error('Expected image.');
  capture.change.rows.media.blob = new Blob(['forged'], { type: 'image/png' });
  const accepted = await loadNativeOutgoingCapture(capture);
  if (accepted.change.kind !== 'image') throw new Error('Expected retained image.');
  expect(await accepted.change.rows.media.blob?.text()).toBe('source');
  f.table('sync_capture').delete(capture.key);
  await expect(loadNativeOutgoingCapture(capture)).rejects.toThrow('changed');
});

it('retains native image data after preparation refusal', async () => {
  const f = setup();
  const capture = imageCapture(f);
  f.failWrites(true);
  await expect(commitPreparedOutgoingOperation(capture, draft(capture))).rejects.toThrow();
  expect(f.table('sync_capture').get(capture.key)).toMatchObject({
    phase: 'native',
    change: { kind: 'image' },
  });
  f.failWrites(false);
  expect(await commitPreparedOutgoingOperation(capture, draft(capture))).toMatchObject({
    operationId: capture.operationId,
  });
});

it('keeps the first image preparation when competing immutable transport copies are proposed', async () => {
  const f = setup();
  const capture = imageCapture(f);
  const firstDraft = draft(capture);
  const ref = {
    assetId: 'transport-copy',
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: 'objects/transport-copy' },
    mimeType: 'image/png',
    size: 6,
    sha256: null,
  };
  firstDraft.objects = [
    { objectId: 'original', filename: 'original.png', ref, sha256: 'b'.repeat(64) },
  ];
  let release!: () => void;
  io.database.mockResolvedValueOnce(f.database).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = () => resolve(f.database);
      })
  );
  const first = commitPreparedOutgoingOperation(capture, firstDraft);
  const secondDraft = {
    ...firstDraft,
    objects: [
      {
        ...firstDraft.objects[0]!,
        ref: {
          ...ref,
          assetId: 'loser-copy',
          location: { kind: 'opfs' as const, objectKey: 'objects/loser-copy' },
        },
      },
    ],
  };
  const second = commitPreparedOutgoingOperation(capture, secondDraft);
  const accepted = await first;
  release();
  expect(await second).toEqual(accepted);
  expect(f.table('sync_capture').get(capture.key)).not.toHaveProperty('change');
  await expect(loadNativeOutgoingCapture(capture)).rejects.toThrow('changed');
});

async function scenarioRetainedFixture() {
  const f = setup();
  const authorization = { incarnation: '22222222-2222-4222-8222-222222222222', revision: 1 };
  const binding = {
    provider: 'webdav' as const,
    rootUrl: 'https://dav.example.test/root/',
    accountId: 'alice',
    spaceId: 'space',
    profileCreatedAt: 1,
    connectionGeneration: 3,
  };
  const ref: AssetRef = {
    assetId: 'saved-html',
    createdAt: 1,
    size: 10,
    mimeType: 'text/html;charset=utf-8',
    sha256: 'd'.repeat(64),
    location: { kind: 'opfs', objectKey: 'objects/saved-html' },
  };
  const project = createGuideProject('Guide', 'guide', 1);
  const rows = {
    entry: createScenarioProjectEntry({ project, existing: undefined, updatedAt: 1 }),
    assets: [],
    documents: [],
    exports: [
      {
        id: 'html-export',
        projectId: project.id,
        format: 'html' as const,
        filename: 'Renamed guide.html',
        size: ref.size,
        createdAt: 1,
        html: { mode: 'guide' as const, assetId: ref.assetId },
      },
    ],
    refs: [ref],
    media: [],
    thumbnails: [],
    presentation: null,
    mediaDependencies: [],
  };
  const capture = createNativeCapture({
    ...f.capture,
    rootKind: 'scenario-project',
    rootId: project.id,
    rootKey: captureRootKey('space', 'scenario-project', project.id),
    change: { kind: 'scenario-project', rows },
  });
  f.table('sync_capture').set(capture.key, structuredClone(capture));
  f.table('sync_connection').set('connection', {
    version: 1,
    kind: 'sync-connection',
    key: 'connection',
    binding,
    identity: authorization,
    phase: 'active',
    updateNonce: null,
    credentialId: '33333333-3333-4333-8333-333333333333',
  });
  const copy: AssetResidencyCopy = {
    version: 1,
    kind: 'copy',
    id: assetResidencyCopyId({ kind: 'opfs', ref }),
    revision: 1,
    phase: 'unloaded',
    operationId: 'accepted-html',
    target: { kind: 'opfs', ref },
    remote: {
      binding,
      key: `Files/${hashSyncText('space')}/00000000-0000-0000-0000-000000000001/saved-body/original.html`,
      sha256: ref.sha256!,
    },
    lastUsedAt: 1,
  };
  f.table('asset_residency').set(copy.id, copy);
  f.table('asset_refs').set(ref.assetId, ref);
  const encoded = await encodeCapturedScenarioRoot(rows, new Map([[ref.assetId, copy]]));
  const retained = encoded.retainedObjects;
  if (!retained?.length) throw new Error('Missing real retained Scenario HTML');
  const wire = {
    format: 'sniptale-sync-operation',
    version: 1,
    spaceId: 'space',
    operationId: capture.operationId,
    rootKind: 'scenario-project',
    rootId: project.id,
    kind: 'edit',
    parents: [],
    dependencies: [],
    envelope: encoded.envelope,
    objects: retained.map((item) => ({ objectId: item.objectId, sha256: item.sha256 })),
  };
  const proposed = draft(capture, JSON.stringify(wire));
  proposed.objects = [];
  proposed.retainedObjects = retained.map(({ objectId, remoteKey }) => ({ objectId, remoteKey }));
  return { ...f, capture, copy, ref, binding, authorization, encoded, wire, proposed };
}

it(
  'commits retained native Scenario HTML using real encoded export descriptors and ' +
    'replays the winning bytes',
  async () => {
    const f = await scenarioRetainedFixture();
    expect(f.encoded.objects).toEqual([]);
    const accepted = await commitPreparedOutgoingOperation(f.capture, f.proposed, f.authorization);
    expect(accepted.retainedObjects).toEqual(f.proposed.retainedObjects);
    const before = structuredClone(f.rows);
    const retry = {
      ...f.proposed,
      recordText: f.proposed.recordText,
      retainedObjects: structuredClone(f.proposed.retainedObjects),
    };
    expect(await commitPreparedOutgoingOperation(f.capture, retry, f.authorization)).toEqual(
      accepted
    );
    expect(f.rows).toEqual(before);
    expect(await loadPreparedOutgoingOperation('space', f.capture.operationId)).toEqual(accepted);
  }
);

it.each([
  'unknown',
  'non-html',
  'private',
  'foreign-entry',
  'foreign-binding',
  'hash',
  'size',
  'mime',
  'authorization',
  'missing-capture',
  'recreated-capture',
] as const)(
  'refuses retained native Scenario %s evidence without borrowing authority',
  async (kind) => {
    const f = await scenarioRetainedFixture();
    if (kind === 'unknown') f.proposed.retainedObjects![0]!.objectId = 'unknown-object';
    if (kind === 'hash') f.wire.objects[0]!.sha256 = 'f'.repeat(64);
    if (kind === 'size') f.wire.envelope.objects[0]!.size++;
    if (kind === 'mime') f.wire.envelope.objects[0]!.mimeType = 'image/png';
    if (kind === 'foreign-binding')
      f.table('asset_residency').set(f.copy.id, {
        ...f.copy,
        remote: { ...f.copy.remote, binding: { ...f.binding, accountId: 'foreign' } },
      });
    if (kind === 'authorization') f.authorization = { ...f.authorization, revision: 2 };
    if (kind === 'missing-capture') f.table('sync_capture').delete(f.capture.key);
    if (kind === 'recreated-capture')
      f.table('sync_capture').set(
        f.capture.key,
        createNativeCapture({
          ...f.capture,
          createdAt: 2,
          generation: 2,
          operationId: 'replacement',
        })
      );
    if (['non-html', 'private', 'foreign-entry'].includes(kind)) {
      const metadata = f.wire.envelope.metadata;
      if (
        !isRecord(metadata) ||
        !Array.isArray(metadata['exports']) ||
        !isRecord(metadata['exports'][0])
      )
        throw new Error('Missing real export metadata');
      const exported = metadata['exports'][0];
      if (kind === 'non-html') delete exported['html'];
      if (kind === 'foreign-entry') exported['id'] = 'foreign';
      if (kind === 'private') {
        const html = exported['html'];
        if (!isRecord(html) || typeof html['objectId'] !== 'string')
          throw new Error('Missing HTML binding');
        metadata['assets'] = [{ objectId: html['objectId'] }];
        metadata['exports'] = [];
      }
    }
    const text = JSON.stringify(f.wire);
    f.proposed.recordText = text;
    f.proposed.recordSha256 = hashSyncText(text);
    const before = structuredClone(f.rows);
    await expect(
      commitPreparedOutgoingOperation(f.capture, f.proposed, f.authorization)
    ).rejects.toThrow();
    expect(f.rows).toEqual(before);
  }
);

it.each(['pending', 'deleted-domain'] as const)(
  'retains exact frozen Scenario HTML authority after later %s work without recreating domain rows',
  async (kind) => {
    const f = await scenarioRetainedFixture();
    if (kind === 'pending') {
      const tx = f.database.transaction(['sync_capture'], 'readwrite');
      expect(
        await deferCheckpointInTransaction(
          tx,
          { rootKind: 'scenario-project', rootId: f.capture.rootId },
          2
        )
      ).not.toBeNull();
      await tx.done;
    } else {
      f.table('asset_refs').delete(f.ref.assetId);
      f.table('asset_owners').clear();
    }
    const copy = structuredClone(f.table('asset_residency').get(f.copy.id));
    expect(
      await commitPreparedOutgoingOperation(f.capture, f.proposed, f.authorization)
    ).toMatchObject({ retainedObjects: f.proposed.retainedObjects });
    expect(f.table('asset_residency').get(f.copy.id)).toEqual(copy);
    if (kind === 'deleted-domain') expect(f.table('asset_refs').has(f.ref.assetId)).toBe(false);
  }
);

it.each(['recreated-ref', 'recreated-copy', 'profile-erasure', 'paused'] as const)(
  'refuses frozen Scenario HTML borrowing %s authority and preserves native capture for retry',
  async (kind) => {
    const f = await scenarioRetainedFixture();
    if (kind === 'recreated-ref')
      f.table('asset_refs').set(f.ref.assetId, { ...f.ref, createdAt: 2 });
    if (kind === 'recreated-copy')
      f.table('asset_residency').set(f.copy.id, {
        ...f.copy,
        target: { kind: 'opfs', ref: { ...f.ref, createdAt: 2 } },
      });
    if (kind === 'profile-erasure') {
      const profile = f.table('sync_capture').get('profile');
      if (!isRecord(profile)) throw new Error('Missing profile');
      f.table('sync_capture').set('profile', { ...profile, createdAt: 2 });
    }
    if (kind === 'paused') {
      const connection = f.table('sync_connection').get('connection');
      if (!isRecord(connection)) throw new Error('Missing connection');
      f.table('sync_connection').set('connection', { ...connection, phase: 'paused' });
    }
    const before = structuredClone(f.rows);
    await expect(
      commitPreparedOutgoingOperation(f.capture, f.proposed, f.authorization)
    ).rejects.toThrow();
    expect(f.rows).toEqual(before);
    expect(f.table('sync_capture').get(f.capture.key)).toMatchObject({ phase: 'native' });
  }
);

it('rolls back retained Scenario transport on locator failure then commits one exact retry', async () => {
  const f = await scenarioRetainedFixture();
  const before = structuredClone(f.rows);
  f.failWrites(true);
  await expect(
    commitPreparedOutgoingOperation(f.capture, f.proposed, f.authorization)
  ).rejects.toThrow('No space');
  expect(f.rows).toEqual(before);
  f.failWrites(false);
  const accepted = await commitPreparedOutgoingOperation(f.capture, f.proposed, f.authorization);
  expect(await commitPreparedOutgoingOperation(f.capture, f.proposed, f.authorization)).toEqual(
    accepted
  );
});

async function retainedMediaFixture() {
  const f = await scenarioRetainedFixture();
  const base = setup();
  if (base.capture.change.kind !== 'media' || !('projectAsset' in base.capture.change.rows))
    throw new Error('Missing media fixture.');
  const { media, projectAsset, ref } = base.capture.change.rows;
  const copy: AssetResidencyCopy = {
    ...f.copy,
    id: assetResidencyCopyId({ kind: 'opfs', ref }),
    target: { kind: 'opfs', ref },
    remote: {
      ...f.copy.remote,
      key: f.copy.remote.key.replace('original.html', 'original.png'),
      sha256: ref.sha256!,
    },
  };
  base.table('sync_connection').set('connection', f.table('sync_connection').get('connection'));
  base.table('asset_residency').set(copy.id, copy);
  base.table('asset_refs').set(ref.assetId, ref);
  const { assetId: _assetId, ...portableAsset } = projectAsset;
  const wire = {
    format: 'sniptale-sync-operation',
    version: 1,
    spaceId: 'space',
    operationId: base.capture.operationId,
    rootKind: 'media',
    rootId: base.capture.rootId,
    kind: 'edit',
    parents: [],
    dependencies: [],
    envelope: {
      metadata: { entry: media, projectAsset: portableAsset, originalObjectId: 'original' },
      objects: [
        { objectId: 'original', filename: 'original.png', mimeType: ref.mimeType, size: ref.size },
      ],
    },
    objects: [{ objectId: 'original', sha256: ref.sha256 }],
  };
  const proposed = draft(base.capture, JSON.stringify(wire));
  proposed.objects = [];
  proposed.retainedObjects = [{ objectId: 'original', remoteKey: copy.remote.key }];
  return { ...base, ref, copy, wire, proposed, authorization: f.authorization };
}

it('commits an exact frozen media original from its verified unloaded copy without native file ownership', async () => {
  const f = await retainedMediaFixture();
  f.table('asset_refs').delete(f.ref.assetId);
  const beforeResidency = structuredClone(f.table('asset_residency'));
  const accepted = await commitPreparedOutgoingOperation(f.capture, f.proposed, f.authorization);
  expect(accepted.objects).toEqual([]);
  expect(accepted.retainedObjects).toEqual(f.proposed.retainedObjects);
  expect(f.table('asset_refs').has(f.ref.assetId)).toBe(false);
  expect(f.table('asset_residency')).toEqual(beforeResidency);
});

it.each([
  'unknown-slot',
  'foreign-child',
  'inline-slot',
  'foreign-key',
  'recreated-ref',
  'changed-copy',
] as const)('refuses frozen media retained %s before source replacement', async (kind) => {
  const f = await retainedMediaFixture();
  if (kind === 'unknown-slot') f.wire.envelope.metadata.originalObjectId = 'other';
  if (kind === 'foreign-child') f.wire.envelope.metadata.projectAsset.id = 'foreign';
  if (kind === 'inline-slot') {
    f.wire.envelope.metadata.originalObjectId = 'other';
    Object.assign(f.wire.envelope.metadata, { thumbnail: { objectId: 'original' } });
  }
  if (kind === 'foreign-key')
    f.proposed.retainedObjects![0]!.remoteKey = f.copy.remote.key.replace(
      'original.png',
      'foreign.png'
    );
  if (kind === 'recreated-ref')
    f.table('asset_refs').set(f.ref.assetId, { ...f.ref, createdAt: 2 });
  if (kind === 'changed-copy')
    f.table('asset_residency').set(f.copy.id, {
      ...f.copy,
      remote: { ...f.copy.remote, sha256: 'e'.repeat(64) },
    });
  f.proposed.recordText = JSON.stringify(f.wire);
  f.proposed.recordSha256 = hashSyncText(f.proposed.recordText);
  const before = structuredClone(f.rows);
  await expect(
    commitPreparedOutgoingOperation(f.capture, f.proposed, f.authorization)
  ).rejects.toThrow();
  expect(f.rows).toEqual(before);
});

async function retainedRootFixture(kind: 'image' | 'video-review' | 'video-project') {
  const f = await retainedMediaFixture();
  const ref = {
    ...f.ref,
    mimeType: kind === 'image' ? 'image/png' : 'video/webm',
    size: kind === 'video-project' ? 1024 : 6,
  };
  if (f.capture.change.kind !== 'media' || !('projectAsset' in f.capture.change.rows))
    throw new Error('Missing source');
  const source = f.capture.change.rows;
  const metadata: Record<string, unknown> = {
    entry: { ...source.media },
    originalObjectId: 'original',
  };
  let capture: CapturedChange;
  if (kind === 'image') {
    const media = createMediaLibraryEntry({
      id: 'image',
      kind: 'image',
      source: { kind: 'screenshot' },
      blob: new Blob(['inline'], { type: 'image/png' }),
      size: 6,
      mimeType: 'image/png',
      workspaceRevision: 1,
      imageContentState: 'edited',
      lifecycle: { savedAt: 1, updatedAt: 1, storageClass: 'library' },
    });
    const workspace = {
      aggregateId: media.id,
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
      sourceTitle: null,
      sourceUrl: null,
      document: createPersistedEditorDocumentFixture(createEditorDocumentFixture(), ref.assetId),
    };
    capture = createNativeCapture({
      ...f.capture,
      rootId: media.id,
      rootKey: captureRootKey('space', 'media', media.id),
      change: { kind: 'image', rows: { media, workspace, presentation: null, refs: [ref] } },
    });
    metadata['entry'] = { ...media };
    metadata['originalObjectId'] = 'inline';
    metadata['workspace'] = {
      aggregateId: media.id,
      document: { assets: [{ role: 'source-image', objectId: 'original' }] },
    };
  } else if (kind === 'video-review') {
    const projectAsset = { ...source.projectAsset, mimeType: ref.mimeType };
    const { imageContentState: _imageState, ...baseMedia } = source.media;
    const media = { ...baseMedia, kind: 'video' as const, mimeType: ref.mimeType };
    capture = createNativeCapture({
      ...f.capture,
      rootKind: 'video-review',
      rootKey: captureRootKey('space', 'video-review', media.id),
      change: {
        kind: 'video-review',
        rows: {
          source: { media, ref, projectAsset },
          review: {
            workspace: materializeVideoWorkspaceProject(
              { ...reviewWorkspace, aggregateId: media.id, sourceAssetId: ref.assetId },
              'Review'
            ),
            draft: null,
          },
          assets: [],
          refs: [],
          media: [],
          privateReviews: [],
        },
        mediaDependencies: [{ mediaId: media.id, generation: 1, basis: ['source-op'] }],
      },
    });
    metadata['entry'] = media;
    metadata['projectAsset'] = {
      id: projectAsset.id,
      size: projectAsset.size,
      mimeType: projectAsset.mimeType,
    };
  } else {
    const project = createVideoProjectEntryWithMediaClip({ id: 'project' });
    const asset = createProjectAssetEntry({
      id: 'project-asset-1',
      assetId: ref.assetId,
      size: ref.size,
      mimeType: ref.mimeType,
    });
    capture = createNativeCapture({
      ...f.capture,
      rootKind: 'video-project',
      rootId: project.id,
      rootKey: captureRootKey('space', 'video-project', project.id),
      change: {
        kind: 'video-project',
        rows: {
          project,
          assets: [asset],
          exports: [],
          media: [],
          refs: [ref],
          mediaDependencies: [],
        },
      },
    });
    metadata['entry'] = { id: project.id, project: { effectSnapshots: [] } };
    metadata['projectAssets'] = [
      { objectId: 'original', entry: { id: asset.id, mimeType: asset.mimeType, size: asset.size } },
    ];
    metadata['projectExports'] = [];
  }
  const filename = kind === 'image' ? 'original.png' : 'original.webm';
  const copy: AssetResidencyCopy = {
    ...f.copy,
    target: { kind: 'opfs', ref },
    remote: { ...f.copy.remote, key: f.copy.remote.key.replace('original.png', filename) },
  };
  f.table('sync_capture').set(capture.key, capture);
  f.table('asset_refs').set(ref.assetId, ref);
  f.table('asset_residency').set(copy.id, copy);
  const wire = {
    ...f.wire,
    rootKind: capture.rootKind,
    rootId: capture.rootId,
    envelope: {
      metadata,
      objects: [{ objectId: 'original', filename, mimeType: ref.mimeType, size: ref.size }],
    },
  };
  const proposed = draft(capture, JSON.stringify(wire));
  proposed.objects = [];
  proposed.retainedObjects = [{ objectId: 'original', remoteKey: copy.remote.key }];
  return { ...f, capture, copy, ref, metadata, wire, proposed };
}

it.each(['image', 'video-review', 'video-project'] as const)(
  'admits only an exact frozen %s retained source slot',
  async (kind) => {
    const f = await retainedRootFixture(kind);
    const accepted = await commitPreparedOutgoingOperation(f.capture, f.proposed, f.authorization);
    expect(accepted.objects).toEqual([]);
    expect(accepted.retainedObjects).toEqual(f.proposed.retainedObjects);
  }
);

it.each(['image', 'video-review', 'video-project'] as const)(
  'refuses a forged %s slot even when the native ref belongs to the snapshot',
  async (kind) => {
    const f = await retainedRootFixture(kind);
    if (kind === 'image')
      f.metadata['workspace'] = {
        aggregateId: f.capture.rootId,
        document: { assets: [{ role: 'foreign', objectId: 'original' }] },
      };
    if (kind === 'video-review')
      f.metadata['projectAsset'] = { id: 'foreign', size: f.ref.size, mimeType: f.ref.mimeType };
    if (kind === 'video-project')
      f.metadata['projectAssets'] = [
        {
          objectId: 'original',
          entry: { id: 'foreign', size: f.ref.size, mimeType: f.ref.mimeType },
        },
      ];
    f.proposed.recordText = JSON.stringify(f.wire);
    f.proposed.recordSha256 = hashSyncText(f.proposed.recordText);
    const before = structuredClone(f.rows);
    await expect(
      commitPreparedOutgoingOperation(f.capture, f.proposed, f.authorization)
    ).rejects.toThrow();
    expect(f.rows).toEqual(before);
  }
);

it('admits a genuine frozen private Review asset but not arbitrary retained snapshot refs', async () => {
  const f = await retainedRootFixture('video-review');
  if (f.capture.change.kind !== 'video-review') throw new Error('Expected Review');
  const camera = createProjectAssetEntry({
    id: 'camera',
    assetId: 'camera-bytes',
    size: f.ref.size,
    mimeType: f.ref.mimeType,
  });
  const ref = {
    ...f.ref,
    assetId: camera.assetId,
    location: { kind: 'opfs' as const, objectKey: 'objects/camera-bytes' },
  };
  const rows = f.capture.change.rows;
  const workspace = {
    ...rows.review.workspace,
    advanced: {
      ...rows.review.workspace.advanced,
      webcam: createQuickEditWebcam(
        'project-asset:camera',
        rows.review.workspace.source,
        rows.review.workspace.source
      ),
    },
  };
  const capture = createNativeCapture({
    ...f.capture,
    change: {
      ...f.capture.change,
      rows: { ...rows, review: { ...rows.review, workspace }, assets: [camera], refs: [ref] },
    },
  });
  const copy: AssetResidencyCopy = {
    ...f.copy,
    id: assetResidencyCopyId({ kind: 'opfs', ref }),
    target: { kind: 'opfs', ref },
  };
  f.table('sync_capture').set(capture.key, capture);
  f.table('asset_residency').set(copy.id, copy);
  f.table('asset_refs').set(ref.assetId, ref);
  f.metadata['originalObjectId'] = 'source-original';
  f.metadata['reviewAssets'] = [
    {
      objectId: 'original',
      entry: { id: camera.id, size: camera.size, mimeType: camera.mimeType },
    },
  ];
  const proposed = draft(capture, JSON.stringify(f.wire));
  proposed.objects = [];
  proposed.retainedObjects = [{ objectId: 'original', remoteKey: copy.remote.key }];
  expect(await commitPreparedOutgoingOperation(capture, proposed, f.authorization)).toMatchObject({
    objects: [],
    retainedObjects: proposed.retainedObjects,
  });
});

it('refuses an inline image original as a retained native source slot', async () => {
  const f = await retainedRootFixture('image');
  f.metadata['originalObjectId'] = 'original';
  const proposed = draft(f.capture, JSON.stringify(f.wire));
  proposed.objects = [];
  const retained = f.proposed.retainedObjects;
  if (!retained) throw new Error('Missing retained fixture bindings.');
  proposed.retainedObjects = retained;
  const before = structuredClone(f.rows);
  await expect(
    commitPreparedOutgoingOperation(f.capture, proposed, f.authorization)
  ).rejects.toThrow();
  expect(f.rows).toEqual(before);
});

it('refuses raw Web Snapshot package authority but admits its unchanged screenshot slot', async () => {
  const f = await retainedMediaFixture();
  const snapshot = createCleanupWebSnapshotRecord('snapshot');
  const ref: AssetRef = {
    ...f.ref,
    assetId: snapshot.packageAssetId,
    size: snapshot.size,
    mimeType: PAGE_PACKAGE_ARCHIVE_MIME_TYPE,
    location: { kind: 'opfs' as const, objectKey: `objects/${snapshot.packageAssetId}` },
  };
  const screenshotRef = {
    ...f.ref,
    assetId: snapshot.screenshotAssetId,
    size: snapshot.screenshotSize,
    location: { kind: 'opfs' as const, objectKey: `objects/${snapshot.screenshotAssetId}` },
  };
  const media = createMediaLibraryEntry({
    id: snapshot.id,
    kind: 'web-archive',
    source: { kind: 'web-snapshot', snapshotId: snapshot.id },
    size: ref.size,
    mimeType: ref.mimeType,
    lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 1 },
  });
  const rows = parseCapturedMediaRows({ media, ref, screenshotRef, webSnapshot: snapshot });
  expect(rows).not.toBeNull();
  if (!rows) throw new Error('Invalid Web Snapshot test rows');
  const capture = createNativeCapture({
    ...f.capture,
    rootId: media.id,
    rootKey: captureRootKey('space', 'media', media.id),
    change: { kind: 'media', rows },
  });
  const { packageAssetId: _package, screenshotAssetId: _screenshot, ...entry } = snapshot;
  const wire = {
    ...f.wire,
    rootId: media.id,
    envelope: {
      metadata: {
        entry: media,
        originalObjectId: 'original',
        webSnapshot: { entry, packageObjectId: 'original', screenshotObjectId: 'screenshot' },
      },
      objects: [
        { objectId: 'original', filename: 'original.png', size: ref.size, mimeType: ref.mimeType },
      ],
    },
  };
  f.table('sync_capture').set(capture.key, capture);
  let copy: AssetResidencyCopy = {
    ...f.copy,
    id: assetResidencyCopyId({ kind: 'opfs', ref }),
    target: { kind: 'opfs', ref },
  };
  f.table('asset_residency').set(copy.id, copy);
  f.table('asset_refs').set(ref.assetId, ref);
  let proposed = draft(capture, JSON.stringify(wire));
  proposed.objects = [];
  proposed.retainedObjects = [{ objectId: 'original', remoteKey: copy.remote.key }];
  await expect(
    commitPreparedOutgoingOperation(capture, proposed, f.authorization)
  ).rejects.toThrow();
  copy = {
    ...copy,
    id: assetResidencyCopyId({ kind: 'opfs', ref: screenshotRef }),
    target: { kind: 'opfs', ref: screenshotRef },
  };
  f.table('asset_residency').set(copy.id, copy);
  f.table('asset_refs').set(screenshotRef.assetId, screenshotRef);
  wire.envelope.objects = [
    {
      objectId: 'screenshot',
      filename: 'original.png',
      size: screenshotRef.size,
      mimeType: screenshotRef.mimeType,
    },
  ];
  wire.objects = [{ objectId: 'screenshot', sha256: screenshotRef.sha256 }];
  proposed = draft(capture, JSON.stringify(wire));
  proposed.objects = [];
  proposed.retainedObjects = [{ objectId: 'screenshot', remoteKey: copy.remote.key }];
  expect(await commitPreparedOutgoingOperation(capture, proposed, f.authorization)).toMatchObject({
    retainedObjects: proposed.retainedObjects,
  });
});

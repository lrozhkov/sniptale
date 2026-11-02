import {
  assetResidencyCopyId,
  type AssetResidencyCopy,
} from '../../composition/persistence/assets/residency-records';
import { hashSyncText } from './wire-record';
import { createScenarioReplicaFixture } from '../../composition/persistence/sync-capture/test-support/scenario-replica.test-support';
import { applyPreparedImageReplica } from '../../composition/persistence/sync-capture/apply-image';
import { commitImagePresentation } from '../../composition/persistence/image-aggregates/mutations';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  createMediaLibraryEntry,
  createProjectAssetEntry,
} from '../../composition/persistence/projects/index.test-support';
import { createPersistedEditorDocumentFixture } from '../../composition/persistence/document-assets/test-support';
import { createEditorDocumentFixture } from '../../editor/document/page-session/document.test-support';
import type {
  CapturedChange,
  CapturedImageRows,
} from '../../composition/persistence/sync-capture/contracts';
import type { AssetRef } from '../../composition/persistence/assets';
import type {
  PreparedOutgoingOperation,
  PreparedOutgoingOperationDraft,
} from '../../composition/persistence/sync-capture/outgoing';
import { createNativeCapture } from '../../composition/persistence/sync-capture/test-support/frozen-snapshot-database';
import { captureRootKey } from '../../composition/persistence/sync-capture/contracts';
import { prepareCapturedOutgoing } from './outgoing';
import { encodeCapturedImageRoot } from './captured-image';
import { preparePortableReplica } from './prepared-root';
import { parsePortableMediaMetadata } from '../media-hub-backup/v6/root-codecs/media';

const io = vi.hoisted(() => ({
  live: vi.fn(),
  read: vi.fn(),
  discard: vi.fn(),
  release: vi.fn(),
  settle: vi.fn(),
  canonical: null as CapturedChange | null,
  accepted: null as PreparedOutgoingOperation | null,
  refuse: false,
  sequence: 0,
  bytes: new Map<string, Blob>(),
  staged: [] as string[],
}));
vi.mock('../../composition/persistence/infrastructure/indexed-db/core', async (original) => ({
  ...(await original<
    typeof import('../../composition/persistence/infrastructure/indexed-db/core')
  >()),
  initDB: io.live,
}));
vi.mock('../../composition/persistence/assets', async (original) => ({
  ...(await original<typeof import('../../composition/persistence/assets')>()),
  readAssetFile: io.read,
  discardPreparedAsset: io.discard,
  collectPreparedAssetCleanupFailures: async (assetIds: readonly string[]) => {
    const results = await Promise.allSettled(assetIds.map((id) => io.discard(id)));
    return results.flatMap((result) =>
      result.status === 'rejected' ? [result.reason as unknown] : []
    );
  },
  releaseAssetReadyProtection: io.release,
  settleAssetWritingMarkers: io.settle,
}));
vi.mock('../../composition/persistence/sync-capture/outgoing', async (original) => ({
  ...(await original<typeof import('../../composition/persistence/sync-capture/outgoing')>()),
  loadNativeOutgoingCapture: async () => {
    if (!io.canonical) throw new Error('Missing retained image.');
    return structuredClone(io.canonical);
  },
  loadPreparedOutgoingOperation: async () => structuredClone(io.accepted),
  commitPreparedOutgoingOperation: async (
    capture: CapturedChange,
    draft: PreparedOutgoingOperationDraft
  ) => {
    if (io.refuse) throw new Error('Prepared commit refused.');
    io.accepted ??= {
      ...structuredClone(draft),
      profileCreatedAt: capture.profileCreatedAt,
      captureSha256: capture.sourceSha256,
    };
    return structuredClone(io.accepted);
  },
}));
vi.mock('../media-hub-backup/v6/staging', async (original) => ({
  ...(await original<typeof import('../media-hub-backup/v6/staging')>()),
  stageRootObjects: async (
    args: Parameters<typeof import('../media-hub-backup/v6/staging').stageRootObjects>[0]
  ) => {
    const { sha256 } = await import('@noble/hashes/sha2.js');
    const staged = [];
    for (const object of args.objects) {
      const source = await args.readObject(object);
      const parts: Uint8Array<ArrayBuffer>[] = [];
      await source.pipeTo(
        new WritableStream({
          write: (chunk: Uint8Array) => {
            parts.push(new Uint8Array(chunk));
          },
        })
      );
      const blob = new Blob(parts, { type: object.mimeType });
      const actual = Array.from(sha256(new Uint8Array(await blob.arrayBuffer())), (byte) =>
        byte.toString(16).padStart(2, '0')
      ).join('');
      if (actual !== args.expectedSha256?.get(object.objectId))
        throw new Error('Staged image SHA mismatch.');
      const assetId = `image-transport-${++io.sequence}`;
      io.bytes.set(assetId, blob);
      io.staged.push(assetId);
      staged.push({
        objectId: object.objectId,
        ref: {
          assetId,
          createdAt: 1,
          location: {
            kind: 'opfs' as const,
            objectKey: `objects/${assetId}`,
          },
          mimeType: object.mimeType,
          size: blob.size,
          sha256: null,
        },
      });
    }
    return staged;
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  io.canonical = null;
  io.accepted = null;
  io.refuse = false;
  io.sequence = 0;
  io.bytes.clear();
  io.staged = [];
  io.discard.mockImplementation(async (id: string) => {
    io.bytes.delete(id);
  });
  io.release.mockResolvedValue(undefined);
  io.read.mockImplementation(
    async (_ref: AssetRef, name: string) => new File(['document'], name, { type: 'image/png' })
  );
});
function imageRows(): CapturedImageRows {
  const blob = new Blob(['original'], { type: 'image/png' });
  return {
    media: createMediaLibraryEntry({
      id: 'image-one',
      kind: 'image',
      source: { kind: 'screenshot' },
      blob,
      size: blob.size,
      mimeType: blob.type,
      workspaceRevision: 1,
      lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 1 },
    }),
    workspace: {
      aggregateId: 'image-one',
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
      sourceTitle: null,
      sourceUrl: null,
      document: createPersistedEditorDocumentFixture(
        createEditorDocumentFixture(),
        'document-source'
      ),
    },
    presentation: {
      aggregateId: 'image-one',
      aggregateKind: 'image',
      presentationRevision: 1,
      updatedAt: 1,
      previewBlob: new Blob(['preview'], { type: 'image/png' }),
      thumbnailBlob: new Blob(['thumbnail'], { type: 'image/png' }),
    },
    refs: [
      {
        assetId: 'document-source',
        createdAt: 1,
        location: { kind: 'opfs', objectKey: 'objects/document-source' },
        mimeType: 'image/png',
        size: 8,
        sha256: null,
      },
    ],
  };
}
it('binds parameterized native image document MIME and refuses a changed reader MIME', async () => {
  const rows = imageRows();
  const mimeType = 'image/png;charset=utf-8';
  rows.refs[0]!.mimeType = mimeType;
  io.read.mockImplementation(
    async (_ref: AssetRef, filename: string) => new File(['document'], filename, { type: mimeType })
  );
  const encoded = await encodeCapturedImageRoot(rows);
  expect(encoded.bindings).toHaveLength(1);
  expect(encoded.bindings[0]!.ref).toEqual(rows.refs[0]);
  const { parsePortableSyncRoot } = await import('./prepared-root');
  await parsePortableSyncRoot(encoded.envelope);
  await preparePortableReplica({
    envelope: encoded.envelope,
    verifiedObjects: new Map(
      encoded.objects.map(({ ref }) => [
        ref.objectId,
        {
          ...rows.refs[0]!,
          assetId: `received-${ref.objectId}`,
          location: { kind: 'opfs' as const, objectKey: `objects/received-${ref.objectId}` },
          size: ref.size,
          mimeType: ref.mimeType,
        },
      ])
    ),
    senderDependencies: [],
    admission: {
      operationId: 'mime-image',
      sourceDigest: 'a'.repeat(64),
      connectionGeneration: 1,
      spaceId: 'space',
      profileCreatedAt: 1,
      expectedLocalGeneration: 0,
      expectedBasis: [],
      expectedWorkspaceRevision: null,
      dependencies: [],
    },
  });
  const object = encoded.objects.find(({ ref }) => ref.objectId === encoded.bindings[0]!.objectId)!;
  expect(object.ref.mimeType).toBe('image/png');
  expect(object.blob.type).toBe(mimeType);
  expect(await object.blob.text()).toBe('document');
  io.read.mockImplementationOnce(
    async (_ref: AssetRef, filename: string) =>
      new File(['document'], filename, { type: 'image/jpeg' })
  );
  await expect(encodeCapturedImageRoot(rows)).rejects.toThrow('native reference');
});

it('restores parameterized image original MIME from its typed portable declaration', async () => {
  const rows = imageRows();
  const mimeType = 'image/png;charset=utf-8';
  rows.media.mimeType = mimeType;
  rows.media.blob = new Blob(['original'], { type: mimeType });
  rows.workspace = null;
  rows.presentation = null;
  rows.refs = [];
  const encoded = await encodeCapturedImageRoot(rows);
  const { parsePortableSyncRoot } = await import('./prepared-root');
  await parsePortableSyncRoot(encoded.envelope);
  const object = encoded.envelope.objects[0]!;
  const staged: AssetRef = {
    assetId: 'received-original',
    createdAt: 1,
    location: { kind: 'opfs', objectKey: 'objects/received-original' },
    size: object.size,
    mimeType: object.mimeType,
    sha256: null,
  };
  const args = {
    envelope: encoded.envelope,
    verifiedObjects: new Map([[object.objectId, staged]]),
    senderDependencies: [],
    admission: {
      operationId: 'mime-original',
      sourceDigest: 'a'.repeat(64),
      connectionGeneration: 1,
      spaceId: 'space',
      profileCreatedAt: 1,
      expectedLocalGeneration: 0,
      expectedBasis: [],
      expectedWorkspaceRevision: null,
      dependencies: [],
    },
  };
  const payload = await preparePortableReplica(args);
  if (payload.kind !== 'image') throw new Error('Expected image replica.');
  expect(payload.input.media.mimeType).toBe(mimeType);
  expect(payload.input.originalRef.mimeType).toBe(mimeType);
  expect(staged.mimeType).toBe('image/png');
  await expect(
    preparePortableReplica({
      ...args,
      verifiedObjects: new Map([[object.objectId, { ...staged, mimeType: 'image/jpeg' }]]),
    })
  ).rejects.toThrow('binding');
});

it('encodes the retained image after a later native edit', async () => {
  const rows = imageRows();
  let release!: () => void;
  let started!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  io.read.mockImplementationOnce(async (_ref: AssetRef, name: string) => {
    started();
    await gate;
    return new File(['document'], name, { type: 'image/png' });
  });
  const pending = encodeCapturedImageRoot(rows);
  await entered;
  rows.media.filename = 'later-name.png';
  rows.media.blob = new Blob(['later-original'], { type: 'image/png' });
  rows.workspace!.document.sourceName = 'later-source';
  rows.presentation!.thumbnailBlob = new Blob(['later-thumbnail']);
  rows.refs[0]!.assetId = 'later-document-ref';
  release();
  const result = await pending;
  expect(JSON.stringify(result.envelope.metadata)).not.toContain('later-');
  const bodies = await Promise.all(result.objects.map((object) => object.blob.text()));
  expect(bodies).toEqual(expect.arrayContaining(['original', 'document', 'preview', 'thumbnail']));
  expect(result.dependencies).toEqual([]);
  expect(io.read).toHaveBeenCalledTimes(1);
});
it.each([
  ['screenshot', false],
  ['screenshot', true],
  ['stored-asset', false],
  ['stored-asset', true],
] as const)(
  'decodes the complete %s image editing closure with trashed=%s',
  async (sourceKind, trashed) => {
    const rows = imageRows();
    if (sourceKind === 'stored-asset') {
      const { blob: _blob, ...media } = rows.media;
      rows.originalRef = {
        ...rows.refs[0]!,
        assetId: 'stored-original',
        location: { kind: 'opfs', objectKey: 'objects/stored-original' },
      };
      rows.media = {
        ...media,
        source: { kind: 'stored-asset', assetId: rows.originalRef.assetId },
      };
    }
    rows.media.lifecycle = {
      storageClass: 'library',
      savedAt: 1,
      updatedAt: 2,
      ...(trashed ? { trashedAt: 2 } : {}),
    };
    const encoded = await encodeCapturedImageRoot(rows);
    if (rows.originalRef)
      expect(encoded.bindings).toEqual(
        expect.arrayContaining([
          {
            objectId: parsePortableMediaMetadata(encoded.envelope.metadata).originalObjectId,
            ref: rows.originalRef,
          },
        ])
      );
    const refs = new Map(
      encoded.envelope.objects.map((object, index) => {
        const assetId = `received-${index}`;
        return [
          object.objectId,
          {
            assetId,
            createdAt: 1,
            location: { kind: 'opfs' as const, objectKey: `objects/${assetId}` },
            mimeType: object.mimeType,
            size: object.size,
            sha256: null,
          },
        ];
      })
    );
    const payload = await preparePortableReplica({
      envelope: encoded.envelope,
      verifiedObjects: refs,
      senderDependencies: [],
      admission: {
        spaceId: 'space',
        profileCreatedAt: 1,
        operationId: 'remote-image',
        sourceDigest: 'a'.repeat(64),
        connectionGeneration: 1,
        expectedLocalGeneration: 0,
        expectedBasis: [],
        expectedWorkspaceRevision: null,
        dependencies: [],
      },
    });
    if (payload.kind !== 'image') throw new Error('Expected image replica.');
    const metadata = parsePortableMediaMetadata(encoded.envelope.metadata);
    expect(payload.input.originalRef).toEqual(refs.get(metadata.originalObjectId));
    expect(payload.input.workspace!.document.sourceImage.assetId).toBe(
      payload.input.documentRefs[0]!.assetId
    );
    expect(payload.input.presentation!.thumbnailRef).toEqual(
      refs.get(metadata.presentation!.thumbnailObjectId)
    );
    expect(JSON.stringify(payload)).not.toContain('document-source');
    expect(payload.input.media).not.toHaveProperty('blob');
    expect(payload.input.expectedNativeRevision).toBeNull();
    expect(payload.input.media.lifecycle).toEqual(rows.media.lifecycle);
  }
);
it('preserves stale presentation status and refuses incomplete or foreign image workspace metadata', async () => {
  const rows = imageRows();
  rows.presentation!.presentationRevision = 0;
  const encoded = await encodeCapturedImageRoot(rows);
  const metadata = parsePortableMediaMetadata(encoded.envelope.metadata);
  expect(metadata.presentation!.entry.presentationRevision).toBe(0);
  const { parsePortableSyncRoot } = await import('./prepared-root');
  expect((await parsePortableSyncRoot(encoded.envelope)).kind).toBe('image');
  const missing = structuredClone(encoded.envelope);
  missing.objects.pop();
  missing.descriptor.objectCount = missing.objects.length;
  missing.descriptor.totalBytes = missing.objects.reduce((sum, object) => sum + object.size, 0);
  await expect(parsePortableSyncRoot(missing)).rejects.toThrow();
  const foreign = structuredClone(encoded.envelope);
  const value = parsePortableMediaMetadata(foreign.metadata);
  value.workspace!.aggregateId = 'foreign-root';
  foreign.metadata = JSON.parse(JSON.stringify(value));
  await expect(parsePortableSyncRoot(foreign)).rejects.toThrow('workspace');
});

function nativeImageCapture(rows = imageRows()) {
  return createNativeCapture({
    version: 1,
    kind: 'sync-operation',
    key: '["change","image-op"]',
    createdAt: 1,
    spaceId: 'space',
    connectionGeneration: 1,
    rootKind: 'media',
    rootId: rows.media.id,
    rootKey: captureRootKey('space', 'media', rows.media.id),
    generation: 1,
    operationId: 'image-op',
    basis: [],
    origin: 'local-edit',
    publicationId: null,
    change: { kind: 'image', rows },
  });
}
it('prepares authoritative image bytes instead of a caller replacement Blob', async () => {
  io.canonical = nativeImageCapture();
  const supplied = structuredClone(io.canonical);
  if (supplied.change.kind !== 'image') throw new Error('Expected image.');
  supplied.change.rows.media.blob = new Blob(['forgery!'], { type: 'image/png' });
  const prepared = await prepareCapturedOutgoing(supplied);
  const bodies = await Promise.all([...io.bytes.values()].map((blob) => blob.text()));
  expect(bodies).toContain('original');
  expect(bodies).not.toContain('forgery!');
  expect(prepared.objects).toHaveLength(4);
  expect(io.release).toHaveBeenCalledWith(
    prepared.objects
      .filter((object) => object.ref.assetId !== 'document-source')
      .map((object) => object.ref.assetId)
  );
});
it('retains native image data after preparation refusal and permits exact retry', async () => {
  io.canonical = nativeImageCapture();
  const before = structuredClone(io.canonical);
  io.refuse = true;
  await expect(prepareCapturedOutgoing(before)).rejects.toThrow('Prepared commit refused');
  expect(io.bytes.size).toBe(0);
  expect(io.accepted).toBeNull();
  expect(io.canonical).toEqual(before);
  io.refuse = false;
  const prepared = await prepareCapturedOutgoing(before);
  expect(prepared.objects).toHaveLength(4);
  expect(await prepareCapturedOutgoing(before)).toEqual(prepared);
  expect(io.bytes.size).toBe(3);
});
it('keeps the first image preparation and releases competing transport copies', async () => {
  io.canonical = nativeImageCapture();
  const results = await Promise.all([
    prepareCapturedOutgoing(io.canonical),
    prepareCapturedOutgoing(io.canonical),
  ]);
  expect(results[0]).toEqual(results[1]);
  expect(io.staged).toHaveLength(6);
  expect(new Set(io.bytes.keys())).toEqual(
    new Set(
      results[0]!.objects
        .filter((object) => object.ref.assetId !== 'document-source')
        .map((object) => object.ref.assetId)
    )
  );
  expect(io.discard).toHaveBeenCalledTimes(3);
});

it('publishes backup image object names through a safe DAV path without changing original metadata', async () => {
  const rows = imageRows();
  rows.media.filename = 'original: screenshot?.png';
  rows.workspace!.document.assets[0]!.role = 'canvas:$.objects[0].src';
  io.canonical = nativeImageCapture(rows);
  const prepared = await prepareCapturedOutgoing(io.canonical);
  const { createSyncAttempt } = await import('./wire-record');
  const attempt = await createSyncAttempt(
    prepared.recordText,
    '00000000-0000-4000-8000-000000000001'
  );
  expect(attempt.objects.every((object) => !/[?:]/u.test(object.remoteKey))).toBe(true);
  const metadata = parsePortableMediaMetadata(JSON.parse(prepared.recordText).envelope.metadata);
  expect(metadata.entry.filename).toBe('original: screenshot?.png');
});

it('reuses the frozen workspace source without creating or releasing a transport copy', async () => {
  const rows = imageRows();
  io.canonical = nativeImageCapture(rows);
  const prepared = await prepareCapturedOutgoing(io.canonical);
  const source = prepared.objects.find((object) => object.ref.assetId === 'document-source');
  expect(source?.ref).toEqual(rows.refs[0]);
  expect(io.staged).toHaveLength(3);
  expect(io.discard).not.toHaveBeenCalledWith('document-source');
  expect(io.release.mock.calls.flat(2)).not.toContain('document-source');
  expect(await prepareCapturedOutgoing(io.canonical)).toEqual(prepared);
  expect(io.staged).toHaveLength(3);
});

it('shares identical original, workspace and preview bytes through one portable object', async () => {
  const rows = imageRows();
  rows.media.blob = new Blob(['document'], { type: 'image/png' });
  rows.presentation!.previewBlob = new Blob(['document'], { type: 'image/png' });
  const encoded = await encodeCapturedImageRoot(rows);
  const metadata = parsePortableMediaMetadata(encoded.envelope.metadata);
  expect(encoded.objects).toHaveLength(2);
  expect(metadata.originalObjectId).toBe(metadata.workspace!.document.sourceImage.objectId);
  expect(metadata.originalObjectId).toBe(metadata.presentation!.previewObjectId);
  expect(encoded.bindings).toEqual([{ objectId: metadata.originalObjectId, ref: rows.refs[0] }]);
  const refs = new Map(
    encoded.objects.map((object, index) => [
      object.ref.objectId,
      {
        assetId: `shared-${index}`,
        createdAt: 1,
        location: { kind: 'opfs' as const, objectKey: `objects/shared-${index}` },
        mimeType: object.ref.mimeType,
        size: object.ref.size,
        sha256: null,
      },
    ])
  );
  const payload = await preparePortableReplica({
    envelope: encoded.envelope,
    verifiedObjects: refs,
    senderDependencies: [],
    admission: {
      spaceId: 'space',
      profileCreatedAt: 1,
      operationId: 'remote-image',
      sourceDigest: 'a'.repeat(64),
      connectionGeneration: 1,
      expectedLocalGeneration: 0,
      expectedBasis: [],
      expectedWorkspaceRevision: null,
      dependencies: [],
    },
  });
  if (payload.kind !== 'image') throw new Error('Expected image replica.');
  expect(payload.input.originalRef.assetId).toBe(payload.input.documentRefs[0]!.assetId);
  expect(payload.input.presentation!.previewRef).toEqual(payload.input.originalRef);
  expect(payload.input.media.filename).toBe(rows.media.filename);
});

it.each(['content', 'mime'] as const)('keeps different %s objects separate', async (difference) => {
  const rows = imageRows();
  rows.media.blob = new Blob(['document'], { type: 'image/png' });
  rows.presentation!.previewBlob = new Blob([difference === 'content' ? 'documenT' : 'document'], {
    type: difference === 'mime' ? 'image/webp' : 'image/png',
  });
  const encoded = await encodeCapturedImageRoot(rows);
  const metadata = parsePortableMediaMetadata(encoded.envelope.metadata);
  expect(encoded.objects).toHaveLength(3);
  expect(metadata.originalObjectId).toBe(metadata.workspace!.document.sourceImage.objectId);
  expect(metadata.presentation!.previewObjectId).not.toBe(metadata.originalObjectId);
});

it('preserves distinct workspace roles and canvas pointers when equal native assets share one object', async () => {
  const rows = imageRows();
  rows.workspace!.document.assets.push({
    assetId: 'other-source',
    role: 'canvas:$.objects[0].src',
  });
  rows.workspace!.document.canvasJson = JSON.stringify({
    objects: [{ type: 'image', src: 'sniptale-asset:other-source' }],
  });
  rows.refs.push({
    ...rows.refs[0]!,
    assetId: 'other-source',
    location: { kind: 'opfs', objectKey: 'objects/other-source' },
  });
  const encoded = await encodeCapturedImageRoot(rows);
  const metadata = parsePortableMediaMetadata(encoded.envelope.metadata);
  const document = metadata.workspace!.document;
  expect(document.assets).toHaveLength(2);
  expect(new Set(document.assets.map((asset) => asset.objectId)).size).toBe(1);
  expect(document.canvasJson).toContain(`sniptale-object:${document.sourceImage.objectId}`);
  expect(encoded.bindings).toEqual([
    { objectId: document.sourceImage.objectId, ref: rows.refs[0] },
  ]);
  expect(encoded.objects).toHaveLength(4);
});

it('hands off only committed transport markers and preserves accepted bytes after unlink failure', async () => {
  io.canonical = nativeImageCapture();
  io.settle.mockImplementationOnce(async () => {
    expect(io.accepted).not.toBeNull();
    expect(io.release).toHaveBeenCalledOnce();
    throw new Error('Marker unlink refused');
  });
  await expect(prepareCapturedOutgoing(io.canonical)).rejects.toThrow('Marker unlink refused');
  expect(io.discard).not.toHaveBeenCalled();
  expect(io.bytes.size).toBe(3);
  expect(io.accepted).not.toBeNull();
  expect(io.settle.mock.calls[0]![0]).not.toContain('document-source');
  io.release.mockClear();
  await expect(prepareCapturedOutgoing(io.canonical)).resolves.toEqual(io.accepted);
  expect(io.release).not.toHaveBeenCalled();
  expect(io.settle).toHaveBeenCalledTimes(2);
});

it('applies a document fallback without waiting for a later presentation', async () => {
  const rows = imageRows();
  rows.presentation = null;
  const capture = nativeImageCapture(rows);
  const frozen = structuredClone(capture);
  const encoded = await encodeCapturedImageRoot(rows);
  const fixture = createScenarioReplicaFixture();
  fixture.fixture.rows.get('media_library')!.clear();
  io.live.mockResolvedValue(fixture.database);
  const verified = new Map<string, AssetRef>();
  const files = new Map<string, Blob>();
  for (const object of encoded.objects) {
    const assetId = `received-${object.ref.objectId}`;
    verified.set(object.ref.objectId, {
      assetId,
      createdAt: 1,
      size: object.blob.size,
      mimeType: object.blob.type,
      location: { kind: 'opfs', objectKey: `objects/${assetId}` },
      sha256: null,
    });
    files.set(assetId, object.blob);
  }
  io.read.mockImplementation(
    async (ref: AssetRef, filename: string) =>
      new File([files.get(ref.assetId) ?? 'document'], filename, { type: ref.mimeType })
  );
  const payload = await preparePortableReplica({
    envelope: encoded.envelope,
    verifiedObjects: verified,
    senderDependencies: [],
    admission: {
      spaceId: 'space',
      profileCreatedAt: 1,
      connectionGeneration: 1,
      operationId: 'fallback-image',
      sourceDigest: capture.sourceSha256,
      expectedLocalGeneration: 0,
      expectedBasis: [],
      expectedWorkspaceRevision: null,
      dependencies: [],
    },
  });
  if (payload.kind !== 'image') throw new Error('Expected image replica.');
  expect(payload.input.presentation).toBeNull();
  await expect(applyPreparedImageReplica(payload.input)).resolves.toMatchObject({
    status: 'applied',
  });
  const workspace = fixture.fixture.rows.get('image_workspaces')!.get(rows.media.id);
  expect(workspace).toMatchObject({
    document: { sourceImage: { assetId: expect.stringMatching(/^received-/u) } },
  });
  await commitImagePresentation({
    aggregateId: rows.media.id,
    expectedWorkspaceRevision: (
      fixture.fixture.rows.get('media_library')!.get(rows.media.id) as { workspaceRevision: number }
    ).workspaceRevision,
    previewBlob: new Blob(['late-preview'], { type: 'image/png' }),
    thumbnailBlob: new Blob(['late-thumbnail'], { type: 'image/png' }),
  });
  expect(capture).toEqual(frozen);
  const repeated = await encodeCapturedImageRoot(rows);
  expect(repeated.envelope).toEqual(encoded.envelope);
  expect(await Promise.all(repeated.objects.map(({ blob }) => blob.text()))).toEqual(
    await Promise.all(encoded.objects.map(({ blob }) => blob.text()))
  );
  expect(
    [...fixture.fixture.rows.get('sync_capture')!.values()].filter(
      (row) =>
        (row as { kind?: string }).kind === 'sync-operation' ||
        (row as { kind?: string }).kind === 'pending-checkpoint'
    )
  ).toEqual([]);
  await expect(applyPreparedImageReplica(payload.input)).resolves.toMatchObject({
    status: 'duplicate',
  });
});

function verifiedDeferredCopy(ref: AssetRef, index = 0): AssetResidencyCopy {
  return {
    version: 1,
    kind: 'copy',
    id: assetResidencyCopyId({ kind: 'opfs', ref }),
    revision: 1,
    operationId: 'accepted-copy',
    phase: 'unloaded',
    lastUsedAt: 1,
    target: { kind: 'opfs', ref },
    remote: {
      binding: {
        provider: 'webdav',
        rootUrl: 'https://dav.test/root/',
        accountId: 'user',
        spaceId: 'space',
        connectionGeneration: 1,
        profileCreatedAt: 1,
      },
      key: `Files/${hashSyncText('space')}/00000000-0000-0000-0000-000000000001/native-${index}/original-${index}.bin`,
      sha256: ref.sha256 ?? String(index % 10).repeat(64),
    },
  };
}

it(
  'retains an unloaded image document slot while inline original and presentation ' +
    'remain genuine local objects',
  async () => {
    const rows = imageRows();
    const ref = rows.refs[0]!;
    io.read.mockRejectedValue(new Error('Unloaded document must not be read.'));
    const copy = verifiedDeferredCopy(ref);
    const encoded = await encodeCapturedImageRoot(rows, new Map([[ref.assetId, copy]]));
    const metadata = parsePortableMediaMetadata(encoded.envelope.metadata);
    const id = metadata.workspace!.document.assets[0]!.objectId;
    expect(encoded.retainedObjects).toEqual([
      { objectId: id, remoteKey: copy.remote.key, sha256: copy.remote.sha256 },
    ]);
    expect(encoded.bindings.find((binding) => binding.objectId === id)?.ref).toEqual(ref);
    expect(encoded.objects.some((object) => object.ref.objectId === id)).toBe(false);
    expect(
      encoded.objects.find((object) => object.ref.objectId === metadata.originalObjectId)?.blob
    ).toBeInstanceOf(Blob);
    expect(encoded.envelope.descriptor.objectCount).toBe(encoded.objects.length + 1);
    expect(io.read).not.toHaveBeenCalled();
  }
);

it('does not lend an unloaded document copy to an identical inline original or presentation', async () => {
  const rows = imageRows();
  const digest = hashSyncText('document');
  rows.refs[0]!.sha256 = digest;
  rows.media.blob = new Blob(['document'], { type: 'image/png' });
  rows.presentation!.previewBlob = new Blob(['document'], { type: 'image/png' });
  const ref = rows.refs[0]!;
  const copy = verifiedDeferredCopy(ref);
  io.read.mockRejectedValue(new Error('Must remain unloaded.'));
  const encoded = await encodeCapturedImageRoot(rows, new Map([[ref.assetId, copy]]));
  const metadata = parsePortableMediaMetadata(encoded.envelope.metadata);
  const documentId = metadata.workspace!.document.sourceImage.objectId;
  expect(documentId).not.toBe(metadata.originalObjectId);
  expect(metadata.presentation!.previewObjectId).toBe(metadata.originalObjectId);
  expect(
    encoded.objects.find((object) => object.ref.objectId === metadata.originalObjectId)?.blob
  ).toBeInstanceOf(Blob);
  expect(encoded.retainedObjects?.map((object) => object.objectId)).toEqual([documentId]);
  expect(encoded.bindings).toEqual([{ objectId: documentId, ref }]);
  expect(io.read).not.toHaveBeenCalled();
});

it.each([false, true])(
  'canonicalizes copied image role aliases only when native expected SHA proves equality (proved=%s)',
  async (proved) => {
    const rows = imageRows();
    rows.presentation = null;
    const digest = hashSyncText('document');
    const source = rows.refs[0]!;
    source.sha256 = proved ? digest : null;
    const background: AssetRef = {
      ...source,
      assetId: 'background-copy',
      location: { kind: 'opfs', objectKey: 'objects/background-copy' },
    };
    rows.refs.push(background);
    const asset = rows.workspace!.document.sourceImage;
    rows.workspace!.document.frame.backgroundImage = { ...asset, assetId: background.assetId };
    rows.workspace!.document.assets.push({
      ...asset,
      assetId: background.assetId,
      role: 'frame-background',
    });
    const copies = new Map(
      [source, background].map((ref, index) => {
        const copy = verifiedDeferredCopy(ref, index);
        copy.remote.sha256 = digest;
        return [ref.assetId, copy] as const;
      })
    );
    io.read.mockRejectedValue(new Error('Must remain unloaded.'));
    const encoded = await encodeCapturedImageRoot(rows, copies);
    const metadata = parsePortableMediaMetadata(encoded.envelope.metadata);
    const ids = metadata.workspace!.document.assets.map((asset) => asset.objectId);
    expect(new Set(ids).size).toBe(proved ? 1 : 2);
    const backgroundId = metadata.workspace!.document.assets.find(
      (asset) => asset.role === 'frame-background'
    )!.objectId;
    expect(metadata.workspace!.document.frame.backgroundImage?.objectId).toBe(backgroundId);
    expect(encoded.retainedObjects).toHaveLength(proved ? 1 : 2);
    expect(encoded.objects).toHaveLength(1);
    expect(io.read).not.toHaveBeenCalled();
  }
);

it('cannot invent an original ref for an inline image by supplying a copied asset', async () => {
  const rows = imageRows();
  rows.workspace = null;
  rows.refs = [];
  const foreign: AssetRef = {
    assetId: 'made-up-original',
    createdAt: 1,
    location: { kind: 'opfs', objectKey: 'objects/made-up-original' },
    mimeType: rows.media.mimeType,
    size: rows.media.size,
    sha256: null,
  };
  await expect(
    encodeCapturedImageRoot(rows, new Map([[foreign.assetId, verifiedDeferredCopy(foreign)]]))
  ).rejects.toThrow('Deferred');
  expect(io.read).not.toHaveBeenCalled();
});

it('encodes imported Image frozen child document and presentation using one verified original binding', async () => {
  const rows = imageRows();
  const id = 'project-asset:imported-image';
  const original = rows.refs[0]!;
  const { blob: _blob, ...media } = rows.media;
  rows.media = {
    ...media,
    id,
    source: { kind: 'project-asset', projectAssetId: 'imported-image' },
    size: original.size,
  };
  rows.originalRef = original;
  rows.projectAsset = createProjectAssetEntry({
    id: 'imported-image',
    assetId: original.assetId,
    size: original.size,
    mimeType: original.mimeType,
  });
  rows.workspace = { ...rows.workspace!, aggregateId: id };
  rows.presentation = null;
  const encoded = await encodeCapturedImageRoot(rows);
  expect(encoded.objects).toHaveLength(1);
  expect(encoded.bindings).toEqual([{ objectId: encoded.objects[0]!.ref.objectId, ref: original }]);
  const metadata = parsePortableMediaMetadata(encoded.envelope.metadata);
  expect(metadata.entry.source).toEqual(rows.media.source);
  expect(metadata.projectAsset?.id).toBe(rows.projectAsset.id);
  expect(metadata.projectAsset).not.toHaveProperty('assetId');
  expect(metadata.workspace?.document.sourceImage.objectId).toBe(metadata.originalObjectId);
  const { parsePortableSyncRoot } = await import('./prepared-root');
  expect((await parsePortableSyncRoot(encoded.envelope)).kind).toBe('image');
  const received = {
    ...original,
    assetId: 'received-imported-original',
    location: { kind: 'opfs' as const, objectKey: 'objects/received-imported-original' },
  };
  const payload = await preparePortableReplica({
    envelope: encoded.envelope,
    verifiedObjects: new Map([[metadata.originalObjectId, received]]),
    senderDependencies: [],
    admission: {
      spaceId: 'space',
      profileCreatedAt: 1,
      connectionGeneration: 1,
      operationId: 'imported-image-incoming',
      sourceDigest: 'a'.repeat(64),
      expectedLocalGeneration: 0,
      expectedBasis: [],
      expectedWorkspaceRevision: null,
      dependencies: [],
    },
  });
  if (payload.kind !== 'image') throw new Error('Expected imported Image payload');
  expect(payload.input.media.source).toEqual(rows.media.source);
  expect(payload.input.projectAsset).toEqual({ ...rows.projectAsset, assetId: received.assetId });
  expect(payload.input.originalRef).toEqual(received);
  expect(payload.input.workspace?.document.sourceImage.assetId).toBe(received.assetId);
  expect(payload.input.media).not.toHaveProperty('blob');
  const forged = structuredClone(encoded.envelope);
  const forgedMetadata = parsePortableMediaMetadata(forged.metadata);
  if (!forgedMetadata.projectAsset) throw new Error('Expected source child');
  forgedMetadata.projectAsset.id = 'foreign-child';
  forged.metadata = JSON.parse(JSON.stringify(forgedMetadata));
  await expect(parsePortableSyncRoot(forged)).rejects.toThrow('association');
});

it.each([0, 1])(
  'classifies an imported original-only snapshot by its native revision, revision=%s',
  async (revision) => {
    const rows = imageRows();
    const original = rows.refs[0]!;
    const { blob: _blob, ...media } = rows.media;
    rows.media = {
      ...media,
      id: 'project-asset:original-only-image',
      source: { kind: 'project-asset', projectAssetId: 'original-only-image' },
      workspaceRevision: revision,
      imageContentState: 'original',
      size: original.size,
    };
    rows.projectAsset = createProjectAssetEntry({
      id: 'original-only-image',
      assetId: original.assetId,
      size: original.size,
      mimeType: original.mimeType,
    });
    rows.originalRef = original;
    rows.workspace = null;
    rows.presentation = null;
    rows.refs = [];
    const encoded = await encodeCapturedImageRoot(rows);
    const { parsePortableSyncRoot } = await import('./prepared-root');
    expect((await parsePortableSyncRoot(encoded.envelope)).kind).toBe(
      revision === 0 ? 'media' : 'image'
    );
    expect(encoded.objects).toHaveLength(1);
  }
);

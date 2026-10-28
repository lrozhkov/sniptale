import { beforeEach, expect, it, vi } from 'vitest';
import { createMediaLibraryEntry } from '../../composition/persistence/projects/index.test-support';
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
  read: vi.fn(),
  discard: vi.fn(),
  release: vi.fn(),
  canonical: null as CapturedChange | null,
  accepted: null as PreparedOutgoingOperation | null,
  refuse: false,
  sequence: 0,
  bytes: new Map<string, Blob>(),
  staged: [] as string[],
}));
vi.mock('../../composition/persistence/assets', async (original) => ({
  ...(await original<typeof import('../../composition/persistence/assets')>()),
  readAssetFile: io.read,
  discardPreparedAsset: io.discard,
  releaseAssetReadyProtection: io.release,
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
it('uses the shared backup image format and decodes its complete editing object closure', async () => {
  const encoded = await encodeCapturedImageRoot(imageRows());
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
});
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
  expect(io.release).toHaveBeenCalledWith(prepared.objects.map((object) => object.ref.assetId));
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
  expect(io.bytes.size).toBe(4);
});
it('keeps the first image preparation and releases competing transport copies', async () => {
  io.canonical = nativeImageCapture();
  const results = await Promise.all([
    prepareCapturedOutgoing(io.canonical),
    prepareCapturedOutgoing(io.canonical),
  ]);
  expect(results[0]).toEqual(results[1]);
  expect(io.staged).toHaveLength(8);
  expect(new Set(io.bytes.keys())).toEqual(
    new Set(results[0]!.objects.map((object) => object.ref.assetId))
  );
  expect(io.discard).toHaveBeenCalledTimes(4);
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

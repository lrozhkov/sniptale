import { beforeEach, expect, it, vi } from 'vitest';
import { createMediaLibraryEntry } from '../../composition/persistence/projects/index.test-support';
import {
  captureRootKey,
  type CapturedChange,
} from '../../composition/persistence/sync-capture/contracts';
import type {
  PreparedOutgoingOperation,
  PreparedOutgoingOperationDraft,
} from '../../composition/persistence/sync-capture/outgoing';
import type {
  OutgoingDispatchAttempt,
  OutgoingDispatchAttemptDraft,
} from '../../composition/persistence/sync-capture/outgoing-attempts';
import type { AssetRef } from '../../composition/persistence/assets';
import { parseSyncAttemptText } from './wire-record';
import { dispatchPreparedOutgoing, prepareCapturedOutgoing } from './outgoing';
import type { SyncRemoteStore } from './remote-store';

const io = vi.hoisted(() => ({
  prepared: new Map<string, PreparedOutgoingOperation>(),
  attempts: new Map<string, OutgoingDispatchAttempt>(),
  read: vi.fn(),
  refuse: false,
}));
vi.mock('../../composition/persistence/assets', async (original) => ({
  ...(await original<typeof import('../../composition/persistence/assets')>()),
  readAssetFile: io.read,
}));
vi.mock('../../composition/persistence/sync-capture/outgoing', async (original) => ({
  ...(await original<typeof import('../../composition/persistence/sync-capture/outgoing')>()),
  loadPreparedOutgoingOperation: async (_space: string, operationId: string) =>
    structuredClone(io.prepared.get(operationId) ?? null),
  commitPreparedOutgoingOperation: async (
    _capture: unknown,
    draft: PreparedOutgoingOperationDraft
  ) => {
    if (io.refuse) throw new Error('Native refusal.');
    const accepted = io.prepared.get(draft.operationId) ?? {
      ...structuredClone(draft),
      captureSha256: 'a'.repeat(64),
    };
    io.prepared.set(accepted.operationId, accepted);
    return structuredClone(accepted);
  },
}));
vi.mock('../../composition/persistence/sync-capture/outgoing-attempts', () => ({
  commitOutgoingDispatchAttempt: async (
    _expected: unknown,
    draft: OutgoingDispatchAttemptDraft
  ) => {
    if (io.refuse) throw new Error('Native refusal.');
    const old = io.attempts.get(draft.attemptId);
    if (old) return { attempt: structuredClone(old), created: false };
    const attempt = {
      ...structuredClone(draft),
      kind: 'dispatch-attempt' as const,
      key: draft.attemptId,
      createdAt: 1,
    };
    io.attempts.set(draft.attemptId, attempt);
    return { attempt: structuredClone(attempt), created: true };
  },
}));
function capture(): CapturedChange {
  const ref: AssetRef = {
    assetId: 'native-file',
    createdAt: 1,
    location: { kind: 'opfs', objectKey: 'objects/native-file' },
    mimeType: 'image/png',
    size: 3,
    sha256: null,
  };
  const rootId = 'project-asset:source';
  return {
    version: 1,
    kind: 'captured-change',
    key: 'capture',
    createdAt: 1,
    spaceId: 'space',
    connectionGeneration: 1,
    rootKind: 'media',
    rootId,
    rootKey: captureRootKey('space', 'media', rootId),
    generation: 1,
    operationId: 'operation',
    basis: [],
    origin: 'local-edit',
    publicationId: null,
    change: {
      kind: 'media',
      rows: {
        ref,
        projectAsset: {
          id: 'source',
          assetId: ref.assetId,
          mimeType: ref.mimeType,
          size: ref.size,
          createdAt: 1,
        },
        media: createMediaLibraryEntry({
          id: rootId,
          filename: 'original 100%.png',
          source: { kind: 'project-asset', projectAssetId: 'source' },
          mimeType: ref.mimeType,
          size: ref.size,
          workspaceRevision: 0,
          lifecycle: { savedAt: 1, storageClass: 'library', updatedAt: 1 },
        }),
      },
    },
  };
}
function remote() {
  const objects = new Map<string, Blob>();
  const writes: string[] = [];
  let lose = false;
  let corrupt = false;
  const adapter: SyncRemoteStore = {
    list: async () => ({ objects: [], prefixes: [], nextCursor: null }),
    write: async (key, body) => {
      expect(
        [...io.attempts.values()].some(
          (attempt) =>
            attempt.recordKey === key || attempt.objects.some((item) => item.remoteKey === key)
        )
      ).toBe(true);
      writes.push(key);
      objects.set(key, body);
      if (lose) {
        lose = false;
        throw new Error('Lost response.');
      }
    },
    read: async (key) => {
      const body = objects.get(key);
      if (!body) throw new Error('Missing file.');
      return corrupt ? new Blob(['bad']).stream() : body.stream();
    },
  };
  return {
    objects,
    writes,
    adapter,
    lose: () => {
      lose = true;
    },
    corrupt: () => {
      corrupt = true;
    },
  };
}
beforeEach(() => {
  io.prepared.clear();
  io.attempts.clear();
  io.refuse = false;
  vi.clearAllMocks();
  io.read.mockImplementation(
    async (ref: AssetRef, filename: string) =>
      new File([new Uint8Array(ref.size)], filename, { type: ref.mimeType })
  );
});
it('persists exact logical and physical bytes before IO and verifies files before manifest publication', async () => {
  const prepared = await prepareCapturedOutgoing(capture());
  const dav = remote();
  const attempt = await dispatchPreparedOutgoing(
    'space',
    'operation',
    dav.adapter,
    new AbortController().signal
  );
  expect(dav.writes).toEqual([...attempt.objects.map((item) => item.remoteKey), attempt.recordKey]);
  expect(attempt.recordKey).toBe(prepared.attemptKey);
  expect((await parseSyncAttemptText(attempt.recordText)).operation.objects[0]?.sha256).toBe(
    prepared.objects[0]?.sha256
  );
  expect(attempt.recordText).not.toContain('objects/native-file');
});
it('keeps frozen bytes on explicit retry and reserves fresh physical keys after a lost response', async () => {
  const prepared = await prepareCapturedOutgoing(capture());
  const dav = remote();
  dav.lose();
  await expect(
    dispatchPreparedOutgoing('space', 'operation', dav.adapter, new AbortController().signal)
  ).rejects.toThrow('Lost response');
  expect(io.attempts.size).toBe(1);
  expect(io.prepared.get('operation')).toEqual(prepared);
  const first = [...io.attempts.values()][0]!;
  const recovered = await dispatchPreparedOutgoing(
    'space',
    'operation',
    dav.adapter,
    new AbortController().signal
  );
  expect(recovered.recordKey).not.toBe(first.recordKey);
  expect(recovered.objects[0]?.remoteKey).not.toBe(first.objects[0]?.remoteKey);
  expect(JSON.parse(recovered.recordText)['operationText']).toBe(prepared.recordText);
  expect(io.attempts.size).toBe(2);
});
it('uses independent physical attempts for concurrent explicit dispatches', async () => {
  await prepareCapturedOutgoing(capture());
  const dav = remote();
  const results = await Promise.all(
    [1, 2].map(() =>
      dispatchPreparedOutgoing('space', 'operation', dav.adapter, new AbortController().signal)
    )
  );
  expect(new Set(results.map((item) => item.recordKey)).size).toBe(2);
  expect(
    new Set(results.flatMap((item) => item.objects.map((object) => object.remoteKey))).size
  ).toBe(2);
});
it('refuses source corruption, native refusal and cancellation without network writes', async () => {
  await prepareCapturedOutgoing(capture());
  const dav = remote();
  io.read.mockImplementation(async () => new File(['bad'], 'original.png', { type: 'image/png' }));
  await expect(
    dispatchPreparedOutgoing('space', 'operation', dav.adapter, new AbortController().signal)
  ).rejects.toThrow();
  io.read.mockImplementation(
    async () => new File([new Uint8Array(3)], 'original.png', { type: 'image/png' })
  );
  io.refuse = true;
  await expect(
    dispatchPreparedOutgoing('space', 'operation', dav.adapter, new AbortController().signal)
  ).rejects.toThrow('Native refusal');
  const controller = new AbortController();
  controller.abort();
  await expect(
    dispatchPreparedOutgoing('space', 'operation', dav.adapter, controller.signal)
  ).rejects.toThrow();
  expect(dav.writes).toEqual([]);
  expect(io.attempts.size).toBe(0);
});
it('does not publish a manifest when the server returns different file bytes', async () => {
  await prepareCapturedOutgoing(capture());
  const dav = remote();
  dav.corrupt();
  await expect(
    dispatchPreparedOutgoing('space', 'operation', dav.adapter, new AbortController().signal)
  ).rejects.toThrow();
  expect(dav.writes).toHaveLength(1);
  expect(dav.writes[0]).toMatch(/^Files\//u);
  expect(io.attempts.size).toBe(1);
  expect(io.prepared.size).toBe(1);
});
it('reuses accepted preparation without reading a newer live source', async () => {
  const first = await prepareCapturedOutgoing(capture());
  io.read.mockRejectedValue(new Error('Unavailable'));
  expect(await prepareCapturedOutgoing(capture())).toEqual(first);
});

it('publishes a tombstone without reading or uploading original bytes', async () => {
  const value = capture();
  value.change = { kind: 'tombstone' };
  value.basis = ['previous'];
  const prepared = await prepareCapturedOutgoing(value);
  const dav = remote();
  const attempt = await dispatchPreparedOutgoing(
    'space',
    'operation',
    dav.adapter,
    new AbortController().signal
  );
  expect(io.read).not.toHaveBeenCalled();
  expect(attempt.objects).toEqual([]);
  expect(dav.writes).toEqual([attempt.recordKey]);
  expect((await parseSyncAttemptText(attempt.recordText)).operation).toMatchObject({
    kind: 'delete',
    parents: ['previous'],
    envelope: null,
  });
  expect(prepared.objects).toEqual([]);
});
it('retains explicit restore provenance and causal parents in the frozen logical record', async () => {
  const value = capture();
  value.origin = 'local-restore';
  value.basis = ['deleted-operation', 'other-head'];
  const prepared = await prepareCapturedOutgoing(value);
  expect(JSON.parse(prepared.recordText)).toMatchObject({ kind: 'restore', parents: value.basis });
});

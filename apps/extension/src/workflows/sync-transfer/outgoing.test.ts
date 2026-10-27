import { beforeEach, expect, it, vi } from 'vitest';
import {
  createMediaLibraryEntry,
  createVideoProjectEntryWithMediaClip,
  createProjectExportEntry,
} from '../../composition/persistence/projects/index.test-support';
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
import { SyncRemoteError, type SyncRemoteStore } from './remote-store';
import { VideoProjectAssetType } from '../../features/video/project/types';

const io = vi.hoisted(() => ({
  prepared: new Map<string, PreparedOutgoingOperation>(),
  attempts: new Map<string, OutgoingDispatchAttempt>(),
  completed: new Set<string>(),
  failCompletion: false,
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
  commitCompletedOutgoingFile: async (
    _expected: unknown,
    attempt: OutgoingDispatchAttempt,
    objectId: string
  ) => {
    if (io.failCompletion) throw new Error('Completion refusal.');
    io.completed.add(JSON.stringify([attempt.attemptId, objectId]));
  },
  loadCompletedOutgoingFiles: async (spaceId: string, connectionGeneration: number) =>
    [...io.attempts.values()].flatMap((attempt) =>
      attempt.spaceId === spaceId && attempt.connectionGeneration === connectionGeneration
        ? attempt.objects
            .filter((object) =>
              io.completed.has(JSON.stringify([attempt.attemptId, object.objectId]))
            )
            .map((object) => ({
              attempt: structuredClone(attempt),
              prepared: structuredClone(io.prepared.get(attempt.operationId)!),
              objectId: object.objectId,
            }))
        : []
    ),
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
      if (!body) throw new SyncRemoteError('missing');
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
  io.completed.clear();
  io.failCompletion = false;
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

it('reuses checked unchanged file bytes for a metadata-only revision with an independent manifest', async () => {
  const firstCapture = capture();
  const firstPrepared = await prepareCapturedOutgoing(firstCapture);
  const dav = remote();
  const first = await dispatchPreparedOutgoing(
    'space',
    'operation',
    dav.adapter,
    new AbortController().signal
  );
  const nextCapture = capture();
  nextCapture.key = 'capture-next';
  nextCapture.operationId = 'operation-next';
  nextCapture.generation = 2;
  nextCapture.basis = ['operation'];
  expect(nextCapture.change.kind).toBe('media');
  if (nextCapture.change.kind === 'media')
    nextCapture.change.rows.media.sourceTitle = 'Updated title';
  const nextPrepared = await prepareCapturedOutgoing(nextCapture);
  const next = await dispatchPreparedOutgoing(
    'space',
    'operation-next',
    dav.adapter,
    new AbortController().signal
  );
  expect(nextPrepared.recordText).not.toBe(firstPrepared.recordText);
  expect(next.recordKey).not.toBe(first.recordKey);
  expect(next.objects[0]?.remoteKey).toBe(first.objects[0]?.remoteKey);
  expect(dav.writes.filter((key) => key.startsWith('Files/'))).toHaveLength(1);
  expect((await parseSyncAttemptText(next.recordText)).operation.operationId).toBe(
    'operation-next'
  );
});

function nextRevision(value: CapturedChange) {
  const next = structuredClone(value);
  next.key += '-next';
  next.operationId += '-next';
  next.generation++;
  next.basis = [value.operationId];
  return next;
}
function projectCapture(): CapturedChange {
  const base = capture();
  if (base.change.kind !== 'media') throw new Error('Missing media fixture.');
  const ref = base.change.rows.ref;
  const project = createVideoProjectEntryWithMediaClip({ id: 'project' });
  const asset = project.project.assets[0]!;
  asset.type = VideoProjectAssetType.IMAGE;
  asset.source = { kind: 'project-asset', projectAssetId: 'source' };
  asset.metadata = { ...asset.metadata, mimeType: ref.mimeType, size: ref.size, duration: null };
  return {
    ...base,
    rootKind: 'video-project',
    rootId: project.id,
    rootKey: captureRootKey('space', 'video-project', project.id),
    change: {
      kind: 'video-project',
      rows: {
        project,
        assets: [base.change.rows.projectAsset],
        exports: [
          createProjectExportEntry({
            id: 'export',
            assetId: 'export-file',
            projectId: project.id,
            mimeType: 'image/png',
            size: 3,
            filename: 'saved.png',
          }),
        ],
        media: [],
        refs: [
          ref,
          {
            ...ref,
            assetId: 'export-file',
            location: { kind: 'opfs', objectKey: 'objects/export-file' },
          },
        ],
        mediaDependencies: [],
      },
    },
  };
}
it('reuses unchanged originals and exports while changed export bytes get a fresh path', async () => {
  const captured = projectCapture();
  await prepareCapturedOutgoing(captured);
  const dav = remote();
  const first = await dispatchPreparedOutgoing(
    'space',
    'operation',
    dav.adapter,
    new AbortController().signal
  );
  const metadata = nextRevision(captured);
  if (metadata.change.kind === 'video-project')
    metadata.change.rows.project.project.name = 'Updated name';
  await prepareCapturedOutgoing(metadata);
  const second = await dispatchPreparedOutgoing(
    'space',
    metadata.operationId,
    dav.adapter,
    new AbortController().signal
  );
  expect(second.objects.map((item) => item.remoteKey)).toEqual(
    first.objects.map((item) => item.remoteKey)
  );
  expect(dav.writes.filter((key) => key.startsWith('Files/'))).toHaveLength(2);
  const changed = nextRevision(metadata);
  if (changed.change.kind === 'video-project') changed.change.rows.refs[1]!.sha256 = null;
  io.read.mockImplementation(
    async (ref: AssetRef, filename: string) =>
      new File(
        [ref.assetId === 'export-file' ? new Uint8Array([1, 2, 3]) : new Uint8Array(3)],
        filename,
        { type: ref.mimeType }
      )
  );
  await prepareCapturedOutgoing(changed);
  const third = await dispatchPreparedOutgoing(
    'space',
    changed.operationId,
    dav.adapter,
    new AbortController().signal
  );
  expect(third.objects[0]?.remoteKey).toBe(first.objects[0]?.remoteKey);
  expect(third.objects[1]?.remoteKey).not.toBe(first.objects[1]?.remoteKey);
  expect(await dav.objects.get(first.objects[1]!.remoteKey)!.arrayBuffer()).toEqual(
    new Uint8Array(3).buffer
  );
  expect(dav.writes.filter((key) => key.startsWith('Files/'))).toHaveLength(3);
});
it('reuses a durable completed part after restart and gives unfinished parts fresh keys', async () => {
  await prepareCapturedOutgoing(projectCapture());
  const dav = remote();
  const adapter: SyncRemoteStore = {
    ...dav.adapter,
    write: async (key, body, signal) => {
      if (key.startsWith('Files/') && dav.writes.length === 1)
        throw new SyncRemoteError('temporary');
      await dav.adapter.write(key, body, signal);
    },
  };
  await expect(
    dispatchPreparedOutgoing('space', 'operation', adapter, new AbortController().signal)
  ).rejects.toThrow('temporary');
  const first = [...io.attempts.values()][0]!;
  expect(io.completed.size).toBe(1);
  vi.resetModules();
  const restarted = await import('./outgoing');
  const next = await restarted.dispatchPreparedOutgoing(
    'space',
    'operation',
    dav.adapter,
    new AbortController().signal
  );
  expect(next.objects[0]?.remoteKey).toBe(first.objects[0]?.remoteKey);
  expect(next.objects[1]?.remoteKey).not.toBe(first.objects[1]?.remoteKey);
  expect(dav.writes.filter((key) => key.startsWith('Files/'))).toHaveLength(2);
});
it('does not reuse unknown-outcome PUT bytes observed before a delayed server write', async () => {
  await prepareCapturedOutgoing(capture());
  const dav = remote();
  let pendingKey = '';
  const ambiguous: SyncRemoteStore = {
    ...dav.adapter,
    write: async (key, body, signal) => {
      await dav.adapter.write(key, body, signal);
      pendingKey = key;
      throw new SyncRemoteError('transport');
    },
  };
  await expect(
    dispatchPreparedOutgoing('space', 'operation', ambiguous, new AbortController().signal)
  ).rejects.toThrow('transport');
  // A successful read cannot establish that the failed PUT has stopped writing.
  expect(
    await new Response(
      await dav.adapter.read(pendingKey, new AbortController().signal)
    ).arrayBuffer()
  ).toEqual(new Uint8Array(3).buffer);
  expect(io.completed.size).toBe(0);
  const next = await dispatchPreparedOutgoing(
    'space',
    'operation',
    dav.adapter,
    new AbortController().signal
  );
  dav.objects.set(pendingKey, new Blob(['late mutation']));
  expect(next.objects[0]?.remoteKey).not.toBe(pendingKey);
  expect(await dav.objects.get(next.objects[0]!.remoteKey)!.arrayBuffer()).toEqual(
    new Uint8Array(3).buffer
  );
});
it.each(['missing', 'digest', 'short', 'long'])(
  'uses a fresh key without overwriting a %s completed candidate',
  async (kind) => {
    await prepareCapturedOutgoing(capture());
    const dav = remote();
    const first = await dispatchPreparedOutgoing(
      'space',
      'operation',
      dav.adapter,
      new AbortController().signal
    );
    const key = first.objects[0]!.remoteKey;
    if (kind === 'missing') dav.objects.delete(key);
    else
      dav.objects.set(key, new Blob([kind === 'short' ? 'x' : kind === 'long' ? 'longer' : 'bad']));
    const before = dav.objects.get(key);
    const next = await dispatchPreparedOutgoing(
      'space',
      'operation',
      dav.adapter,
      new AbortController().signal
    );
    expect(next.objects[0]?.remoteKey).not.toBe(key);
    expect(dav.objects.get(key)).toBe(before);
    expect(dav.writes.filter((item) => item === key)).toHaveLength(1);
  }
);
it.each(['temporary', 'authentication', 'access-denied', 'cancelled'] as const)(
  'stops on a %s candidate read and retains completion evidence',
  async (code) => {
    await prepareCapturedOutgoing(capture());
    const dav = remote();
    await dispatchPreparedOutgoing('space', 'operation', dav.adapter, new AbortController().signal);
    const before = structuredClone(io.completed);
    const writes = [...dav.writes];
    const attempts = io.attempts.size;
    await expect(
      dispatchPreparedOutgoing(
        'space',
        'operation',
        {
          ...dav.adapter,
          read: async () => {
            throw new SyncRemoteError(code);
          },
        },
        new AbortController().signal
      )
    ).rejects.toThrow(code);
    expect(io.completed).toEqual(before);
    expect(dav.writes).toEqual(writes);
    expect(io.attempts.size).toBe(attempts);
  }
);
it('shares completed checked files between warm concurrent dispatches with independent manifests', async () => {
  await prepareCapturedOutgoing(capture());
  const dav = remote();
  const first = await dispatchPreparedOutgoing(
    'space',
    'operation',
    dav.adapter,
    new AbortController().signal
  );
  const next = await Promise.all(
    [1, 2].map(() =>
      dispatchPreparedOutgoing('space', 'operation', dav.adapter, new AbortController().signal)
    )
  );
  expect(new Set(next.map((item) => item.recordKey)).size).toBe(2);
  expect(next.every((item) => item.objects[0]?.remoteKey === first.objects[0]?.remoteKey)).toBe(
    true
  );
  expect(dav.writes.filter((item) => item.startsWith('Files/'))).toHaveLength(1);
});
it('refuses failed completion admission without publishing a manifest and retries on a fresh key', async () => {
  await prepareCapturedOutgoing(capture());
  const dav = remote();
  io.failCompletion = true;
  await expect(
    dispatchPreparedOutgoing('space', 'operation', dav.adapter, new AbortController().signal)
  ).rejects.toThrow('Completion refusal');
  expect(io.completed.size).toBe(0);
  expect(dav.writes).toHaveLength(1);
  const first = [...io.attempts.values()][0]!;
  io.failCompletion = false;
  const next = await dispatchPreparedOutgoing(
    'space',
    'operation',
    dav.adapter,
    new AbortController().signal
  );
  expect(next.objects[0]?.remoteKey).not.toBe(first.objects[0]?.remoteKey);
});

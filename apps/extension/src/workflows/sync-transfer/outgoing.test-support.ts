import { expect, vi } from 'vitest';
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
import { SyncRemoteError, type SyncRemoteStore } from './remote-store';
import { VideoProjectAssetType } from '../../features/video/project/types';

const io = vi.hoisted(() => ({
  prepared: new Map<string, PreparedOutgoingOperation>(),
  attempts: new Map<string, OutgoingDispatchAttempt>(),
  completed: new Set<string>(),
  failCompletion: false,
  verified: vi.fn(),
  read: vi.fn(),
  refuse: false,
}));
export { io };
vi.mock('../../composition/persistence/sync-capture/outgoing-results', () => ({
  commitVerifiedOutgoingResult: io.verified,
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
export function capture(): CapturedChange {
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
export function remote() {
  const objects = new Map<string, Blob>();
  const writes: string[] = [];
  const reads: string[] = [];
  const stats: string[] = [];
  let lose = false;
  let corrupt = false;
  const adapter: SyncRemoteStore = {
    list: async (prefix) => ({
      objects: [...objects]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, body]) => ({ key, size: body.size })),
      prefixes: [],
      nextCursor: null,
    }),
    stat: async (key) => {
      stats.push(key);
      const body = objects.get(key);
      if (!body) throw new SyncRemoteError('missing');
      return { size: body.size };
    },
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
      reads.push(key);
      const body = objects.get(key);
      if (!body) throw new SyncRemoteError('missing');
      return corrupt ? new Blob(['bad']).stream() : body.stream();
    },
  };
  return {
    objects,
    writes,
    reads,
    stats,
    adapter,
    lose: () => {
      lose = true;
    },
    corrupt: () => {
      corrupt = true;
    },
  };
}
export function resetOutgoingFixture() {
  io.prepared.clear();
  io.attempts.clear();
  io.completed.clear();
  io.failCompletion = false;
  io.refuse = false;
  io.verified.mockResolvedValue(undefined);
  vi.clearAllMocks();
  io.read.mockImplementation(
    async (ref: AssetRef, filename: string) =>
      new File([new Uint8Array(ref.size)], filename, { type: ref.mimeType })
  );
}

export function nextRevision(value: CapturedChange) {
  const next = structuredClone(value);
  next.key += '-next';
  next.operationId += '-next';
  next.generation++;
  next.basis = [value.operationId];
  return next;
}
export function projectCapture(): CapturedChange {
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

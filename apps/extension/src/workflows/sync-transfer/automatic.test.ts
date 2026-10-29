import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createMediaLibraryEntry,
  createVideoProjectEntryWithMediaClip,
} from '../../composition/persistence/projects/index.test-support';
import type {
  loadCatalogNativeBases,
  loadCatalogReplicaAdmission,
} from '../../composition/persistence/sync-capture/catalog-admission';
import { encodePortableVideoProjectAssetRefs } from '../media-hub-backup/v6/root-codecs/projects';
import { parseRootEnvelope } from '../media-hub-backup/v6/codec';
import { createAutomaticCatalogSync } from './automatic';
import { projectSyncCatalog, syncCatalogRootKey, type CatalogAttempt } from './catalog-graph';
import type { applyCatalogDeletion } from './incoming';
import type { receiveSelectedCatalogRoot } from './incoming-selected';
import type { SyncRemoteStore } from './remote-store';
import { createSyncAttempt, hashSyncText, parseSyncOperationText } from './wire-record';

const ports = vi.hoisted(() => ({
  bases: vi.fn<typeof loadCatalogNativeBases>(),
  admission: vi.fn<typeof loadCatalogReplicaAdmission>(),
  receive: vi.fn<typeof receiveSelectedCatalogRoot>(),
  deletion: vi.fn<typeof applyCatalogDeletion>(),
  unloaded: vi.fn(),
}));
vi.mock('../../composition/persistence/sync-capture/catalog-admission', () => ({
  loadCatalogNativeBases: ports.bases,
  loadCatalogReplicaAdmission: ports.admission,
}));
vi.mock('./native-residency', () => ({ hasUnloadedNativeEditingRoot: ports.unloaded }));
vi.mock('./incoming-selected', () => ({ receiveSelectedCatalogRoot: ports.receive }));
vi.mock('./incoming', () => ({ applyCatalogDeletion: ports.deletion }));
const scope = { spaceId: 'space', profileCreatedAt: 1, connectionGeneration: 3 };
const authorization = { incarnation: '10000000-0000-4000-8000-000000000001', revision: 1 };
const object = {
  objectId: 'sync-object-000001',
  path: '_sniptale/assets/sync-object-000001/original.png',
  filename: 'original.png',
  mimeType: 'image/png',
  size: 3,
};
type Catalog = Parameters<ReturnType<typeof createAutomaticCatalogSync>['run']>[0]['catalog'];
type Base = Awaited<ReturnType<typeof loadCatalogNativeBases>>[number];
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function remote() {
  return {
    list: vi.fn<SyncRemoteStore['list']>(),
    stat: vi.fn<SyncRemoteStore['stat']>(),
    read: vi.fn<SyncRemoteStore['read']>(),
    write: vi.fn<SyncRemoteStore['write']>(),
  };
}
function metadata(rootId: string) {
  const sourceId = rootId.slice('project-asset:'.length);
  return {
    entry: createMediaLibraryEntry({
      id: rootId,
      filename: object.filename,
      source: { kind: 'project-asset', projectAssetId: sourceId },
      mimeType: object.mimeType,
      size: object.size,
      workspaceRevision: 0,
      lifecycle: { savedAt: 1, storageClass: 'library', updatedAt: 1 },
    }),
    originalObjectId: object.objectId,
    projectAsset: { id: sourceId, mimeType: object.mimeType, size: object.size, createdAt: 1 },
  };
}
async function attempt(
  rootId: string,
  id: string,
  parents: string[] = [],
  kind: 'edit' | 'delete' = 'edit',
  project = false
): Promise<CatalogAttempt> {
  const entry = createVideoProjectEntryWithMediaClip({ id: rootId });
  entry.project.assets[0]!.source = { kind: 'project-asset', projectAssetId: 'source' };
  const rootKind = project ? 'video-project' : 'media';
  const envelope =
    kind === 'delete'
      ? null
      : parseRootEnvelope({
          descriptor: {
            rootKind,
            rootId,
            ...(project ? {} : { mediaSubtype: 'library-item' }),
            metadataPath: 'Metadata/sync-root.json',
            objectCount: 1,
            totalBytes: 3,
          },
          metadata: project
            ? {
                entry: { ...entry, project: encodePortableVideoProjectAssetRefs(entry.project) },
                projectAssets: [
                  {
                    entry: {
                      id: 'source',
                      mimeType: object.mimeType,
                      size: object.size,
                      createdAt: 1,
                    },
                    filename: object.filename,
                    objectId: object.objectId,
                    libraryMediaId: 'project-asset:source',
                  },
                ],
                projectExports: [],
              }
            : metadata(rootId),
          objects: [object],
        });
  const operationText = JSON.stringify({
    format: 'sniptale-sync-operation',
    version: 1,
    spaceId: scope.spaceId,
    operationId: id,
    rootKind,
    rootId,
    kind,
    parents,
    dependencies:
      project && kind !== 'delete'
        ? [{ mediaId: 'project-asset:source', basis: ['missing-dependency'] }]
        : [],
    envelope,
    objects: kind === 'delete' ? [] : [{ objectId: object.objectId, sha256: 'a'.repeat(64) }],
  });
  const operation = await parseSyncOperationText(operationText);
  return {
    ...(await createSyncAttempt(operationText, crypto.randomUUID())),
    operationText,
    operation,
  };
}
function catalog(records: CatalogAttempt[]): Catalog {
  return { ...projectSyncCatalog(scope.spaceId, records), invalid: [], metadataBytes: 0, pages: 1 };
}
async function successor(rootId = 'project-asset:a', deleted = false) {
  const base = await attempt(rootId, `${rootId}-base`);
  const head = await attempt(
    rootId,
    `${rootId}-head`,
    [base.operation.operationId],
    deleted ? 'delete' : 'edit'
  );
  const local: Base = {
    rootKind: 'media',
    rootId,
    generation: 4,
    basis: [base.operation.operationId],
  };
  return { base, head, local };
}
function admission(local: Base) {
  return {
    ...scope,
    authorization,
    expectedLocalGeneration: local.generation,
    expectedBasis: local.basis,
    expectedWorkspaceRevision: null,
    dependencies: [],
  };
}
function args(value: Catalog, signal = new AbortController().signal) {
  return { scope, authorization, catalog: value, remote: remote(), signal };
}
beforeEach(() => {
  vi.resetAllMocks();
  ports.bases.mockResolvedValue([]);
  ports.unloaded.mockResolvedValue(false);
  ports.receive.mockImplementation(async ({ selection }) => selection);
  ports.deletion.mockResolvedValue({ status: 'applied', generation: 5 });
});
afterEach(() => vi.unstubAllGlobals());

it('reads 10000 remote-only roots without originals or native publication', async () => {
  const template = await attempt('project-asset:template', 'template');
  if (!template.operation.envelope) throw new Error('Expected edit envelope');
  const envelope = template.operation.envelope;
  const records: CatalogAttempt[] = [];
  for (let index = 0; index < 10_000; index++) {
    const rootId = `project-asset:remote-${String(index).padStart(5, '0')}`;
    const operationText = JSON.stringify({
      ...template.operation,
      operationId: rootId,
      rootId,
      envelope: {
        ...envelope,
        descriptor: { ...envelope.descriptor, rootId },
        metadata: metadata(rootId),
      },
    });
    const operation = await parseSyncOperationText(operationText);
    const physicalText = JSON.stringify({
      format: 'sniptale-sync-attempt',
      version: 1,
      attemptId: template.attemptId,
      operationText,
      operationSha256: hashSyncText(operationText),
      objects: template.objects,
    });
    const physicalName = `${template.attemptId}-${hashSyncText(physicalText)}.json`;
    records.push({
      ...template,
      operation,
      operationText,
      recordKey: `.sniptale/${hashSyncText(scope.spaceId)}/records/${physicalName}`,
    });
  }
  const input = args(catalog(records));
  expect(input.catalog.roots.size).toBe(10_000);
  expect(await createAutomaticCatalogSync().run(input)).toEqual({
    applied: 0,
    deferred: 0,
    remaining: false,
  });
  expect(ports.bases).toHaveBeenCalledExactlyOnceWith({
    scope,
    authorization,
    roots: records.map(({ operation }) => ({
      rootKind: operation.rootKind,
      rootId: operation.rootId,
    })),
  });
  expect(ports.receive).not.toHaveBeenCalled();
  expect(ports.deletion).not.toHaveBeenCalled();
  expect(ports.admission).not.toHaveBeenCalled();
  expect(input.remote.read).not.toHaveBeenCalled();
  expect(input.remote.list).not.toHaveBeenCalled();
});

it('uses existing incoming publication for one clean materialized causal successor', async () => {
  const f = await successor();
  ports.bases.mockResolvedValue([f.local]);
  const input = args(catalog([f.base, f.head]));
  expect(await createAutomaticCatalogSync().run(input)).toEqual({
    applied: 1,
    deferred: 0,
    remaining: false,
  });
  expect(ports.receive).toHaveBeenCalledExactlyOnceWith({
    ...input,
    residentOnly: true,
    selection: {
      rootKind: 'media',
      rootId: f.local.rootId,
      operationId: f.head.operation.operationId,
      sourceDigest: hashSyncText(f.head.operationText),
    },
  });
  expect(ports.deletion).not.toHaveBeenCalled();
});

it.each(['dirty', 'conflict', 'blocked', 'multiple-local-heads', 'already-current'] as const)(
  'skips a %s root using real causal graph evidence',
  async (kind) => {
    const f = await successor();
    const records = [f.base, f.head];
    if (kind === 'conflict')
      records.push(await attempt(f.local.rootId, 'competing', [f.base.operation.operationId]));
    if (kind === 'blocked')
      records.push(
        await attempt(f.local.rootId, 'pending', [f.head.operation.operationId, 'missing-parent'])
      );
    const local = {
      ...f.local,
      basis:
        kind === 'dirty'
          ? ['unpublished-local']
          : kind === 'multiple-local-heads'
            ? [f.base.operation.operationId, 'unpublished-local']
            : kind === 'already-current'
              ? [f.head.operation.operationId]
              : f.local.basis,
    };
    ports.bases.mockResolvedValue([local]);
    const graph = catalog(records);
    if (kind === 'conflict')
      expect(graph.roots.get(syncCatalogRootKey('media', f.local.rootId))?.conflict).toBe(true);
    if (kind === 'blocked')
      expect(graph.roots.get(syncCatalogRootKey('media', f.local.rootId))?.blocked).toBe(true);
    expect(await createAutomaticCatalogSync().run(args(graph))).toEqual({
      applied: 0,
      deferred: 0,
      remaining: false,
    });
    expect(ports.receive).not.toHaveBeenCalled();
    expect(ports.deletion).not.toHaveBeenCalled();
  }
);

it('skips a project whose causal media dependency is unavailable', async () => {
  const rootId = 'project';
  const base = await attempt(rootId, 'project-base', [], 'edit', true);
  const head = await attempt(rootId, 'project-head', ['project-base'], 'edit', true);
  const graph = catalog([base, head]);
  expect(
    graph.roots.get(syncCatalogRootKey('video-project', rootId))?.unavailableDependencies
  ).toEqual(['project-asset:source']);
  ports.bases.mockResolvedValue([
    { rootKind: 'video-project', rootId, generation: 1, basis: ['project-base'] },
  ]);
  expect(await createAutomaticCatalogSync().run(args(graph))).toEqual({
    applied: 0,
    deferred: 0,
    remaining: false,
  });
  expect(ports.receive).not.toHaveBeenCalled();
});

it.each(['current', 'generation', 'basis'] as const)(
  'rechecks native generation and basis before automatic deletion: %s',
  async (kind) => {
    const f = await successor('project-asset:deleted', true);
    ports.bases.mockResolvedValue([f.local]);
    const selected = admission(f.local);
    if (kind === 'generation') selected.expectedLocalGeneration += 1;
    if (kind === 'basis') selected.expectedBasis = ['new-local'];
    ports.admission.mockResolvedValue(selected);
    const input = args(catalog([f.base, f.head]));
    expect(await createAutomaticCatalogSync().run(input)).toEqual({
      applied: kind === 'current' ? 1 : 0,
      deferred: kind === 'current' ? 0 : 1,
      remaining: false,
    });
    expect(ports.admission).toHaveBeenCalledExactlyOnceWith({
      scope,
      authorization,
      rootKind: 'media',
      rootId: f.local.rootId,
      dependencyMediaIds: [],
    });
    if (kind === 'current')
      expect(ports.deletion).toHaveBeenCalledExactlyOnceWith({
        catalog: input.catalog,
        rootKind: 'media',
        rootId: f.local.rootId,
        admission: selected,
        signal: input.signal,
      });
    else expect(ports.deletion).not.toHaveBeenCalled();
    expect(ports.receive).not.toHaveBeenCalled();
  }
);

it('limits each pass to two attempts and advances beyond a refused root', async () => {
  const fixtures = await Promise.all(
    ['a', 'b', 'c', 'd', 'e'].map((id) => successor(`project-asset:${id}`))
  );
  ports.bases.mockResolvedValue(fixtures.map((f) => f.local));
  ports.receive.mockRejectedValueOnce(new Error('native refusal'));
  const owner = createAutomaticCatalogSync();
  const input = args(catalog(fixtures.flatMap((f) => [f.base, f.head])));
  expect(await owner.run(input)).toEqual({ applied: 1, deferred: 1, remaining: true });
  expect(ports.receive.mock.calls.map(([call]) => call.selection.rootId)).toEqual([
    'project-asset:a',
    'project-asset:b',
  ]);
  expect(await owner.run(input)).toEqual({ applied: 2, deferred: 0, remaining: true });
  expect(await owner.run(input)).toEqual({ applied: 1, deferred: 0, remaining: false });
  expect(ports.receive.mock.calls.map(([call]) => call.selection.rootId)).toEqual(
    fixtures.map((f) => f.local.rootId)
  );
  ports.bases.mockResolvedValue(
    fixtures.map((f) => ({ ...f.local, basis: [f.head.operation.operationId] }))
  );
  expect(await owner.run(input)).toEqual({ applied: 0, deferred: 0, remaining: false });
  expect(ports.receive).toHaveBeenCalledTimes(5);
});

it.each(['restart', 'authorization'] as const)(
  'resets advisory continuation after %s',
  async (kind) => {
    const fixtures = await Promise.all(
      ['a', 'b', 'c'].map((id) => successor(`project-asset:${id}`))
    );
    ports.bases.mockResolvedValue(fixtures.map((f) => f.local));
    let owner = createAutomaticCatalogSync();
    const input = args(catalog(fixtures.flatMap((f) => [f.base, f.head])));
    expect((await owner.run(input)).remaining).toBe(true);
    ports.receive.mockClear();
    if (kind === 'restart') owner = createAutomaticCatalogSync();
    else input.authorization = { ...authorization, revision: 2 };
    expect((await owner.run(input)).remaining).toBe(true);
    expect(ports.receive.mock.calls.map(([call]) => call.selection.rootId)).toEqual([
      'project-asset:a',
      'project-asset:b',
    ]);
    expect(ports.bases.mock.calls.at(-1)?.[0].authorization).toEqual(input.authorization);
  }
);

it('aborts after native metadata selection without applying a root', async () => {
  const f = await successor();
  const selected = deferred<Awaited<ReturnType<typeof loadCatalogNativeBases>>>();
  ports.bases.mockReturnValueOnce(selected.promise);
  const controller = new AbortController();
  const pending = createAutomaticCatalogSync().run(
    args(catalog([f.base, f.head]), controller.signal)
  );
  const refused = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort();
  selected.resolve([f.local]);
  await refused;
  expect(ports.receive).not.toHaveBeenCalled();
  expect(ports.deletion).not.toHaveBeenCalled();
});

it('retains the uncompleted cursor when an incoming request is aborted', async () => {
  const fixtures = await Promise.all(['a', 'b', 'c'].map((id) => successor(`project-asset:${id}`)));
  ports.bases.mockResolvedValue(fixtures.map((f) => f.local));
  const input = args(catalog(fixtures.flatMap((f) => [f.base, f.head])));
  const owner = createAutomaticCatalogSync();
  await owner.run(input);
  const reached = deferred<void>();
  const request = deferred<Awaited<ReturnType<typeof receiveSelectedCatalogRoot>>>();
  ports.receive.mockImplementationOnce(() => {
    reached.resolve();
    return request.promise;
  });
  const controller = new AbortController();
  const pending = owner.run({ ...input, signal: controller.signal });
  const refused = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await reached.promise;
  controller.abort();
  request.reject(new DOMException('Aborted', 'AbortError'));
  await refused;
  ports.receive.mockClear();
  expect(await owner.run(input)).toEqual({ applied: 1, deferred: 0, remaining: false });
  expect(ports.receive.mock.calls.map(([call]) => call.selection.rootId)).toEqual([
    'project-asset:c',
  ]);
});

it('defers deletion when a controlled native writer wins between base selection and apply admission', async () => {
  const f = await successor('project-asset:late-delete', true);
  ports.bases.mockResolvedValue([f.local]);
  const reached = deferred<void>();
  const selected = deferred<Awaited<ReturnType<typeof loadCatalogReplicaAdmission>>>();
  ports.admission.mockImplementationOnce(() => {
    reached.resolve();
    return selected.promise;
  });
  const pending = createAutomaticCatalogSync().run(args(catalog([f.base, f.head])));
  await reached.promise;
  selected.resolve({
    ...admission(f.local),
    expectedLocalGeneration: f.local.generation + 1,
    expectedBasis: ['new-local-write'],
  });
  expect(await pending).toEqual({ applied: 0, deferred: 1, remaining: false });
  expect(ports.deletion).not.toHaveBeenCalled();
});

it('does not admit native work from an incomplete catalogue scan', async () => {
  const f = await successor();
  const graph = catalog([f.base, f.head]);
  graph.invalid.push({ key: 'invalid-manifest', code: 'invalid-manifest' });
  expect(await createAutomaticCatalogSync().run(args(graph))).toEqual({
    applied: 0,
    deferred: 0,
    remaining: false,
  });
  expect(ports.bases).not.toHaveBeenCalled();
  expect(ports.receive).not.toHaveBeenCalled();
  expect(ports.deletion).not.toHaveBeenCalled();
});

it('keeps an unloaded root remote without fetching originals or blocking a later loaded root', async () => {
  const a = await successor('project-asset:a');
  const b = await successor('project-asset:b');
  ports.bases.mockResolvedValue([a.local, b.local]);
  ports.unloaded.mockImplementation(async ({ rootId }) => rootId === a.local.rootId);
  const input = args(catalog([a.base, a.head, b.base, b.head]));
  expect(await createAutomaticCatalogSync().run(input)).toEqual({
    applied: 1,
    deferred: 1,
    remaining: false,
  });
  expect(ports.receive).toHaveBeenCalledTimes(1);
  expect(ports.receive).toHaveBeenCalledWith(
    expect.objectContaining({
      residentOnly: true,
      selection: expect.objectContaining({ rootId: b.local.rootId }),
    })
  );
  expect(input.remote.read).not.toHaveBeenCalled();
});

it('does not turn an unloaded metadata-only tombstone into a download', async () => {
  const f = await successor('project-asset:a', true);
  ports.bases.mockResolvedValue([f.local]);
  ports.admission.mockResolvedValue(admission(f.local));
  ports.unloaded.mockResolvedValue(true);
  const input = args(catalog([f.base, f.head]));
  expect(await createAutomaticCatalogSync().run(input)).toEqual({
    applied: 1,
    deferred: 0,
    remaining: false,
  });
  expect(ports.deletion).toHaveBeenCalledTimes(1);
  expect(ports.receive).not.toHaveBeenCalled();
  expect(input.remote.read).not.toHaveBeenCalled();
});

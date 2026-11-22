import { MAX_CAPTURE_ROWS } from './contracts';
import { beforeEach, expect, it, vi } from 'vitest';
import { readValidAnimationSnapshot } from '../effect-bundles/fixture.test-support';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { createProjectExportEntry } from '../projects/index.test-support';
import { parseVideoProjectEntry } from '../projects/read-guards';
import { annotation, workspace } from '../review-workspaces/backup-restore.test-support';
import type { AssetRef } from '../assets';
import { createVideoProjectHistoryChange } from '../../../features/video/project/history-change';
import { createSha256Digest } from '@sniptale/platform/security/digest';
import { EDITOR_HISTORY_LIMITS } from '../../../features/editor-history/policy';
import {
  collectPreparedProjectReplicaRefs,
  hydratePreparedVideoProjectReplicaRoot,
  parsePreparedVideoProjectReplicaRoot,
  type PreparedVideoProjectReplicaRoot,
} from './prepared-project';

const io = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../assets', async (original) => ({
  ...(await original<typeof import('../assets')>()),
  readAssetFile: io.read,
}));
beforeEach(() => vi.clearAllMocks());

async function setup() {
  const snapshot = await readValidAnimationSnapshot();
  const files = new Map<string, File>();
  function staged(assetId: string, bytes: Uint8Array, mimeType: string): AssetRef {
    files.set(assetId, new File([Uint8Array.from(bytes).buffer], assetId, { type: mimeType }));
    return {
      assetId,
      createdAt: 1,
      location: { kind: 'opfs', objectKey: `objects/${assetId}` },
      mimeType,
      size: bytes.byteLength,
      sha256: null,
    };
  }
  io.read.mockImplementation(async (ref: AssetRef) => {
    const file = files.get(ref.assetId);
    if (!file) throw new Error('Missing staged file');
    return file;
  });
  const project = createEmptyVideoProject('Prepared effect graph');
  const root: PreparedVideoProjectReplicaRoot = {
    entry: {
      id: project.id,
      createdAt: 1,
      updatedAt: 2,
      workspaceRevision: 3,
      project: {
        ...project,
        effectSnapshots: [snapshot],
      },
    },
    assets: [],
    snapshotRefs: [],
  };
  return { root, files, staged };
}

async function historyFixture() {
  const data = await setup();
  const value = JSON.stringify(
    createVideoProjectHistoryChange(
      { ...data.root.entry.project, name: 'Historical name' },
      data.root.entry.project
    )
  );
  const ref = data.staged('history-inverse', new TextEncoder().encode(value), 'application/json');
  ref.sha256 = (await createSha256Digest(value)).slice('sha256:'.length);
  const history = {
    head: {
      version: 1 as const,
      epoch: 'prepared-history',
      past: [{ assetId: ref.assetId }],
      future: [],
      sources: [],
    },
    refs: [ref],
  };
  data.root.history = history;
  return { ...data, history, ref };
}

it('claims and cold-admits an explicit history graph without accepting native fields in the entry', async () => {
  const data = await historyFixture();
  expect(collectPreparedProjectReplicaRefs(data.root)).toEqual([data.ref]);
  const hydrated = await hydratePreparedVideoProjectReplicaRoot(data.root);
  expect(hydrated.entry.history).toEqual(data.history.head);
  expect(hydrated.historyRefs).toEqual([data.ref]);
  expect(data.root.entry).not.toHaveProperty('history');
});

it.each(['missing', 'extra', 'duplicate', 'mime', 'digest', 'budget', 'logical-budget'])(
  'refuses an inconsistent prepared history binding before file IO: %s',
  async (kind) => {
    const data = await historyFixture();
    if (kind === 'missing') data.history.refs = [];
    if (kind === 'extra') data.history.refs.push({ ...data.ref, assetId: 'extra' });
    if (kind === 'duplicate') data.history.refs.push(data.ref);
    if (kind === 'mime') data.ref.mimeType = 'text/plain';
    if (kind === 'digest') data.ref.sha256 = 'invalid';
    if (kind === 'budget') data.ref.size = EDITOR_HISTORY_LIMITS.maxBytes + 1;
    if (kind === 'logical-budget') {
      data.history.head.past = Array.from({ length: 3 }, () => ({ assetId: data.ref.assetId }));
      data.ref.size = Math.floor(EDITOR_HISTORY_LIMITS.maxBytes / 2) + 1;
    }
    expect(() => parsePreparedVideoProjectReplicaRoot(data.root)).toThrow('invalid');
    expect(io.read).not.toHaveBeenCalled();
  }
);

it.each(['hash', 'sources'])(
  'refuses corrupt prepared history before native publication: %s',
  async (kind) => {
    const data = await historyFixture();
    if (kind === 'hash') data.ref.sha256 = 'b'.repeat(64);
    else data.root.history!.head.sources = [{ kind: 'library-asset', id: 'undeclared' }];
    await expect(hydratePreparedVideoProjectReplicaRoot(data.root)).rejects.toThrow();
    expect(data.root.entry).not.toHaveProperty('history');
  }
);

it('hydrates exact self-contained animation bytes without staged effect bindings', async () => {
  const data = await setup(),
    before = JSON.stringify(data.root);
  const parsed = parsePreparedVideoProjectReplicaRoot(data.root);
  expect(JSON.stringify(data.root)).toBe(before);
  expect(collectPreparedProjectReplicaRefs(parsed)).toEqual([]);
  const hydrated = await hydratePreparedVideoProjectReplicaRoot(parsed);
  expect(parseVideoProjectEntry(hydrated.entry)).not.toBeNull();
  data.files.clear();
  expect(hydrated.entry.project.effectSnapshots).toEqual(data.root.entry.project.effectSnapshots);
  expect(JSON.stringify(data.root)).toBe(before);
  expect(io.read).not.toHaveBeenCalled();
});

it.each([
  { history: { version: 1 as const, epoch: 'foreign', past: [], future: [], sources: [] } },
  {
    history: {
      version: 1 as const,
      epoch: 'foreign',
      past: [{ assetId: 'unowned-native-file' }],
      future: [],
      sources: [],
    },
  },
  {
    history: { version: 1 as const, epoch: 'foreign', past: [], future: [], sources: [] },
    historyPublicationId: 'foreign-publication',
  },
  { historyPublicationId: 'foreign-publication' },
])('refuses private native history in a synced root before file IO: %j', async (fields) => {
  const { root } = await setup();
  const candidate = { ...root, entry: { ...root.entry, ...fields } };
  const before = structuredClone(candidate);
  expect(() => parsePreparedVideoProjectReplicaRoot(candidate)).toThrow('invalid');
  await expect(hydratePreparedVideoProjectReplicaRoot(candidate)).rejects.toThrow('invalid');
  expect(candidate).toEqual(before);
  expect(io.read).not.toHaveBeenCalled();
});
it.each(['extra', 'duplicate', 'wrong-slot', 'size', 'mime', 'digest'] as const)(
  'refuses unsupported detached effect binding before physical reads: %s',
  async (change) => {
    const { root, staged } = await setup();
    const binding = {
      snapshotId: root.entry.project.effectSnapshots![0]!.id,
      assetId: 'detached',
      ref: staged('detached', new Uint8Array([1]), 'image/png'),
    };
    root.snapshotRefs = change === 'duplicate' ? [binding, binding] : [binding];
    if (change === 'wrong-slot') binding.snapshotId = 'other';
    if (change === 'size') binding.ref.size++;
    if (change === 'mime') binding.ref.mimeType = 'image/jpeg';
    if (change === 'digest') binding.ref.sha256 = '0'.repeat(64);
    expect(() => parsePreparedVideoProjectReplicaRoot(root)).toThrow('invalid');
    expect(io.read).not.toHaveBeenCalled();
  }
);
it.each(['missing', 'corrupt'] as const)(
  'refuses %s embedded animation source before physical reads',
  async (change) => {
    const { root } = await setup(),
      snapshot = root.entry.project.effectSnapshots![0]!;
    if (change === 'missing') snapshot.source = '{}';
    else snapshot.sha256 = '0'.repeat(64);
    await expect(hydratePreparedVideoProjectReplicaRoot(root)).rejects.toThrow();
    expect(io.read).not.toHaveBeenCalled();
  }
);

it('rejects Blob and class instances at the staged JSON boundary', async () => {
  const { root } = await setup();
  expect(() =>
    parsePreparedVideoProjectReplicaRoot({ ...root, extra: new Blob(['bytes']) })
  ).toThrow('invalid');
  expect(() => parsePreparedVideoProjectReplicaRoot({ ...root, extra: new Date() })).toThrow(
    'invalid'
  );
  const asset = {
    id: 'hidden',
    kind: 'image',
    byteLength: 1,
    mimeType: 'image/png',
    sha256: '0'.repeat(64),
  };
  expect(() =>
    parsePreparedVideoProjectReplicaRoot({
      ...root,
      entry: {
        ...root.entry,
        project: {
          ...root.entry.project,
          effectSnapshots: [
            {
              ...root.entry.project.effectSnapshots![0]!,
              assets: [{ ...asset, blob: new Blob(['hidden']) }],
            },
          ],
        },
      },
    })
  ).toThrow('invalid');
});

it('hydrates associated presentation and thumbnail sidecars and deduplicates physical claims', async () => {
  const data = await setup();
  const ref = data.staged('shared-thumbnail', new Uint8Array([1, 2]), 'image/png');
  const previewRef = data.staged('preview', new Uint8Array([3]), 'image/png');
  data.root.thumbnail = {
    entry: {
      assetId: `video-project:${data.root.entry.id}`,
      createdAt: 1,
      updatedAt: 2,
      width: 8,
      height: 8,
    },
    ref,
  };
  data.root.presentation = {
    entry: {
      aggregateId: data.root.entry.id,
      aggregateKind: 'video-project',
      presentationRevision: 3,
      updatedAt: 2,
    },
    thumbnailRef: ref,
    previewRef,
  };
  expect(
    collectPreparedProjectReplicaRefs(data.root).filter((item) => item.assetId === ref.assetId)
  ).toHaveLength(1);
  const hydrated = await hydratePreparedVideoProjectReplicaRoot(data.root);
  data.files.clear();
  expect(await hydrated.thumbnail!.blob.arrayBuffer()).toEqual(new Uint8Array([1, 2]).buffer);
  expect(await hydrated.presentation!.previewBlob!.arrayBuffer()).toEqual(
    new Uint8Array([3]).buffer
  );
  expect(hydrated.presentation!.aggregateId).toBe(data.root.entry.id);
});

it('refuses inconsistent physical claims and unrelated sidecars', async () => {
  const data = await setup();
  const ref = data.staged('shared', new Uint8Array([1]), 'image/png');
  data.root.presentation = {
    entry: {
      aggregateId: data.root.entry.id,
      aggregateKind: 'video-project',
      presentationRevision: 3,
      updatedAt: 2,
    },
    thumbnailRef: ref,
  };
  data.root.thumbnail = {
    entry: {
      assetId: `video-project:${data.root.entry.id}`,
      createdAt: 1,
      updatedAt: 2,
      width: 8,
      height: 8,
    },
    ref: { ...ref, createdAt: 99 },
  };
  expect(() => collectPreparedProjectReplicaRefs(data.root)).toThrow('invalid');
  data.root.thumbnail.ref = ref;
  data.root.thumbnail.entry.assetId = 'unrelated';
  expect(() => parsePreparedVideoProjectReplicaRoot(data.root)).toThrow('invalid');
});

it('retains native private source reviews and refuses changed workspace or draft associations', async () => {
  const data = await setup();
  const ref = data.staged('review-source', new Uint8Array(6), 'video/webm');
  data.root.assets = [
    {
      entry: {
        id: 'private',
        assetId: ref.assetId,
        createdAt: 1,
        mimeType: ref.mimeType,
        size: ref.size,
      },
      filename: 'source.webm',
      publishToLibrary: false,
      ref,
      videoReview: {
        workspace: {
          ...workspace,
          aggregateId: 'project-asset:private',
          sourceAssetId: ref.assetId,
        },
        draft: {
          aggregateId: 'project-asset:private',
          revision: 3,
          annotation,
          before: null,
          updatedAt: 2,
        },
      },
    },
  ];
  const expected = structuredClone(data.root.assets[0]!.videoReview);
  expect(parsePreparedVideoProjectReplicaRoot(data.root).assets[0]!.videoReview).toEqual(expected);
  expect((await hydratePreparedVideoProjectReplicaRoot(data.root)).assets[0]!.videoReview).toEqual(
    expected
  );
  const review = data.root.assets[0]!.videoReview!;
  review.draft!.aggregateId = 'foreign';
  expect(() => parsePreparedVideoProjectReplicaRoot(data.root)).toThrow('invalid');
  review.draft!.aggregateId = 'project-asset:private';
  review.workspace.sourceAssetId = 'changed-source';
  expect(() => parsePreparedVideoProjectReplicaRoot(data.root)).toThrow('invalid');
});

it('accepts omitted empty effect bindings but refuses detached declarations', async () => {
  const { root } = await setup();
  delete root.snapshotRefs;
  expect(parsePreparedVideoProjectReplicaRoot(root).entry.project.effectSnapshots).toEqual(
    root.entry.project.effectSnapshots
  );
  const snapshot = root.entry.project.effectSnapshots![0]!;
  const asset = {
    id: 'detached',
    kind: 'image' as const,
    byteLength: 1,
    mimeType: 'image/png',
    sha256: '0'.repeat(64),
  };
  snapshot.assets = [asset, asset];
  snapshot.retainedByteLength += 2;
  expect(() => parsePreparedVideoProjectReplicaRoot(root)).toThrow('invalid');
});

it('refuses prepared child rows that disagree with their immutable ref', async () => {
  const { root, staged } = await setup();
  const ref = staged('private-bytes', new Uint8Array(6), 'video/webm');
  root.assets = [
    {
      entry: {
        id: 'private',
        assetId: 'foreign-bytes',
        createdAt: 1,
        mimeType: ref.mimeType,
        size: ref.size,
      },
      filename: 'source.webm',
      ref,
    },
  ];
  expect(() => parsePreparedVideoProjectReplicaRoot(root)).toThrow('invalid');
});

it('keeps a deferred saved export out of physical staging claims and hydration reads', async () => {
  const f = await setup();
  const ref: AssetRef = {
    assetId: 'deferred-export',
    createdAt: 1,
    location: { kind: 'opfs', objectKey: 'objects/deferred-export' },
    size: 100,
    mimeType: 'video/webm',
    sha256: 'b'.repeat(64),
  };
  const entry = createProjectExportEntry({
    id: 'deferred-export',
    projectId: f.root.entry.id,
    assetId: ref.assetId,
    size: ref.size,
    mimeType: ref.mimeType,
  });
  f.root.exports = [
    { entry, ref, remote: { key: 'Files/project/export.webm', sha256: ref.sha256! } },
  ];
  expect(collectPreparedProjectReplicaRefs(f.root).map((item) => item.assetId)).not.toContain(
    ref.assetId
  );
  const hydrated = await hydratePreparedVideoProjectReplicaRoot(f.root);
  expect(hydrated.exports?.[0]?.ref).toEqual(ref);
  expect(io.read.mock.calls.some(([read]) => read.assetId === ref.assetId)).toBe(false);
});

it.each([
  '',
  '../foreign',
  'objects//file',
  'objects/./file',
  'objects/../file',
  'objects/file?query',
  'objects/file#fragment',
  'objects/file:stream',
  'objects\\file',
  'objects/\u0001file',
  'objects/\u007ffile',
  'a'.repeat(2049),
])('refuses deferred project export key %j before physical reads', async (key) => {
  const { root } = await setup();
  const ref: AssetRef = {
    assetId: 'deferred-invalid-key',
    createdAt: 1,
    location: { kind: 'opfs', objectKey: 'objects/deferred-invalid-key' },
    size: 100,
    mimeType: 'video/webm',
    sha256: 'b'.repeat(64),
  };
  const entry = createProjectExportEntry({
    id: 'deferred-invalid-key',
    projectId: root.entry.id,
    assetId: ref.assetId,
    size: ref.size,
    mimeType: ref.mimeType,
  });
  root.exports = [{ entry, ref, remote: { key, sha256: ref.sha256! } }];
  expect(() => parsePreparedVideoProjectReplicaRoot(root)).toThrow('invalid');
  expect(io.read).not.toHaveBeenCalled();
});

it.each(['assets', 'exports'] as const)(
  'refuses malformed or oversized prepared %s collections before physical reads',
  async (slot) => {
    const { root } = await setup();
    for (const value of [{}, [null], Array.from({ length: MAX_CAPTURE_ROWS + 1 }, () => ({}))]) {
      expect(() => parsePreparedVideoProjectReplicaRoot({ ...root, [slot]: value })).toThrow(
        'invalid'
      );
    }
    expect(io.read).not.toHaveBeenCalled();
  }
);

import type { PublishedCaptureOperation } from '../../../apps/extension/src/composition/persistence/sync-capture/contracts';
import { createNativeCapture } from '../../../apps/extension/src/composition/persistence/sync-capture/test-support/frozen-snapshot-database';
import { queueOperationKey } from '../../../apps/extension/src/composition/persistence/sync-capture/queue-model';
// @vitest-environment node
import { createHash } from 'node:crypto';
import { AssetObjectSizeMismatchError } from '../../../apps/extension/src/composition/persistence/assets/opfs-store';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  install: vi.fn(),
  save: vi.fn(),
  scenarioAsset: vi.fn(),
  scenarioCommit: vi.fn(),
  htmlCreate: vi.fn(),
  htmlSave: vi.fn(),
  getAll: vi.fn(),
  reviewRead: vi.fn(),
  resources: vi.fn(),
  fileRead: vi.fn(),
  screenshotSave: vi.fn(),
}));
vi.mock(
  '../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/core',
  async (original) => ({
    ...(await original<object>()),
    initDB: async () => ({
      get: mocks.get,
      getAll: mocks.getAll,
      transaction: () => ({ done: Promise.resolve() }),
    }),
  })
);
vi.mock(
  '../../../apps/extension/src/composition/persistence/sync-capture/profile',
  async (original) => ({
    ...(await original<object>()),
    installExperimentalCaptureProfile: mocks.install,
  })
);
vi.mock('../../../apps/extension/src/composition/persistence/projects', async (original) => ({
  ...(await original<object>()),
  saveProjectAsset: mocks.save,
}));
vi.mock(
  '../../../apps/extension/src/composition/persistence/scenario/store/capture-step/asset-entry',
  () => ({ createScenarioAssetEntryFromBlob: mocks.scenarioAsset })
);
vi.mock('../../../apps/extension/src/composition/persistence/scenario/aggregate-mutations', () => ({
  commitScenarioAggregateMutation: mocks.scenarioCommit,
}));
vi.mock(
  '../../../apps/extension/src/composition/persistence/scenario/export-artifacts',
  async (original) => ({
    ...(await original<
      typeof import('../../../apps/extension/src/composition/persistence/scenario/export-artifacts')
    >()),
    createScenarioHtmlCapture: mocks.htmlCreate,
  })
);
vi.mock(
  '../../../apps/extension/src/composition/persistence/scenario/store/project-records/exports',
  () => ({ saveScenarioExportRecord: mocks.htmlSave })
);
vi.mock(
  '../../../apps/extension/src/composition/persistence/review-workspaces/store',
  async (original) => ({
    ...(await original<
      typeof import('../../../apps/extension/src/composition/persistence/review-workspaces/store')
    >()),
    readVideoWorkspace: mocks.reviewRead,
  })
);
vi.mock(
  '../../../apps/extension/src/composition/persistence/assets/editing-resources',
  async (original) => ({
    ...(await original<
      typeof import('../../../apps/extension/src/composition/persistence/assets/editing-resources')
    >()),
    collectNativeEditingResources: mocks.resources,
  })
);
import { createQuickEditAdvancedState } from '../../../apps/extension/src/features/video/review/advanced/defaults';
import {
  createReviewAdvancedContentOperation,
  reviewAdvancedContentBaseline,
} from '../../../apps/extension/src/features/video/review/document';
import type { VideoWorkspaceSnapshot } from '../../../apps/extension/src/composition/persistence/review-workspaces/contracts';
import type { ReviewOperation } from '../../../apps/extension/src/features/video/review/types';
import { createWebdavCheckpointHarness } from './webdav-checkpoints';
vi.mock('../../../apps/extension/src/composition/persistence/assets', async (original) => ({
  ...(await original<
    typeof import('../../../apps/extension/src/composition/persistence/assets')
  >()),
  readAssetFile: mocks.fileRead,
}));
vi.mock(
  '../../../apps/extension/src/composition/persistence/media-library/index.screenshots',
  () => ({
    saveScreenshotMediaAsset: mocks.screenshotSave,
  })
);
import { createWebdavReviewHarness } from './webdav-review';
const profile = {
  version: 1,
  kind: 'profile',
  key: 'profile',
  createdAt: 1,
  enabled: true,
  spaceId: 'real-workspace',
  connectionGeneration: 1,
};
const connection = {
  version: 1,
  kind: 'sync-connection',
  key: 'connection',
  binding: {
    provider: 'webdav',
    rootUrl: 'https://dav.invalid/workspace/',
    accountId: 'fixture',
    spaceId: 'real-workspace',
    profileCreatedAt: 1,
    connectionGeneration: 1,
  },
  identity: { incarnation: '11111111-1111-4111-8111-111111111111', revision: 1 },
  phase: 'active',
  updateNonce: null,
  credentialId: '22222222-2222-4222-8222-222222222222',
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.get.mockImplementation(async (store: string, key: string) =>
    store === 'sync_capture' && key === 'profile'
      ? profile
      : store === 'sync_connection' && key === 'connection'
        ? connection
        : undefined
  );
  mocks.getAll.mockImplementation(async (store: string) =>
    store === 'sync_capture' ? [profile] : []
  );
  mocks.resources.mockResolvedValue({ refs: [], inlineMediaIds: [] });
  mocks.save.mockRejectedValue(new Error('stop at first source write'));
});
function harness() {
  return createWebdavReviewHarness(() => {
    throw new Error('Fixture cannot access transport');
  });
}
it('refuses missing current enrollment before a review seed can replace its profile or write bytes', async () => {
  mocks.get.mockResolvedValue(undefined);
  await expect(harness().seed([], 'project-asset', { useExistingProfile: true })).rejects.toThrow();
  expect(mocks.install).not.toHaveBeenCalled();
  expect(mocks.save).not.toHaveBeenCalled();
});
it('refuses a foreign existing profile before seed writes', async () => {
  mocks.get.mockImplementation(async (store: string) =>
    store === 'sync_capture' ? { ...profile, spaceId: 'foreign' } : connection
  );
  await expect(harness().seed([], 'project-asset', { useExistingProfile: true })).rejects.toThrow();
  expect(mocks.install).not.toHaveBeenCalled();
  expect(mocks.save).not.toHaveBeenCalled();
});
it('preserves a verified live profile while admitting only fixture source creation', async () => {
  await expect(harness().seed([], 'project-asset', { useExistingProfile: true })).rejects.toThrow(
    'stop at first source write'
  );
  expect(mocks.install).not.toHaveBeenCalled();
  expect(mocks.save).toHaveBeenCalledOnce();
});

it('rejects unsupported fixture profile options before source writes', async () => {
  await expect(harness().seed([], 'project-asset', { useExistingProfile: 'yes' })).rejects.toThrow(
    'Invalid review fixture profile choice'
  );
  expect(mocks.install).not.toHaveBeenCalled();
  expect(mocks.save).not.toHaveBeenCalled();
});
it('keeps the explicit legacy disposable-profile default for existing provider fixtures', async () => {
  mocks.get.mockResolvedValue(undefined);
  await expect(harness().seed([], 'project-asset')).rejects.toThrow('stop at first source write');
  expect(mocks.install).toHaveBeenCalledOnce();
  expect(mocks.install.mock.calls[0]?.[0]).toMatchObject({
    spaceId: 'provider-native-review',
    enabled: true,
  });
  expect(mocks.save).toHaveBeenCalledOnce();
});

it.each([
  { name: '' },
  { name: '   ' },
  { name: 'a'.repeat(161) },
  { name: 'bad\nname' },
  { name: 'bad\u0000name' },
  { name: 'bad\u007fname' },
  { name: 1 },
  { storageClass: 'temporary' },
  { storageClass: 'library' },
  { storageClass: 'full' },
  { storageClass: null },
  { savedHtml: 'yes' },
  { rootUrl: 'https://foreign.invalid/' },
  { html: '<b>arbitrary</b>' },
])(
  'refuses invalid Scenario backup fixture options before native or child writes: %j',
  async (options) => {
    await expect(
      createWebdavCheckpointHarness().seedScenario([137, 80, 78, 71, 13, 10, 26, 10, 1], options)
    ).rejects.toThrow('Invalid Scenario fixture options');
    expect(mocks.scenarioAsset).not.toHaveBeenCalled();
    expect(mocks.scenarioCommit).not.toHaveBeenCalled();
    expect(mocks.htmlCreate).not.toHaveBeenCalled();
    expect(mocks.htmlSave).not.toHaveBeenCalled();
    expect(mocks.install).not.toHaveBeenCalled();
  }
);
it('admits named Library Scenarios through the current enrolled native writer', async () => {
  mocks.scenarioAsset.mockImplementation(async ({ projectId, blob }) => ({
    assetEntry: {
      id: 'fixture-asset',
      projectId,
      assetId: 'native-fixture-asset',
      width: 1,
      height: 1,
      mimeType: blob.type,
      size: blob.size,
      createdAt: 1,
    },
  }));
  const h = createWebdavCheckpointHarness();
  await h.seedScenario([137, 80, 78, 71, 13, 10, 26, 10, 1], {
    name: 'Excluded backup draft',
  });
  expect(mocks.scenarioCommit).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'Excluded backup draft' }),
    expect.objectContaining({ expectedRevision: null })
  );
  await h.seedScenario([137, 80, 78, 71, 13, 10, 26, 10, 1]);
  expect(mocks.scenarioCommit).toHaveBeenLastCalledWith(
    expect.objectContaining({ name: 'Checkpoint Scenario' }),
    expect.objectContaining({ storageClass: 'library' })
  );
  expect(mocks.install).not.toHaveBeenCalled();
});

it('keeps named historical HTML immutable and distinct without accepting arbitrary HTML input', async () => {
  mocks.scenarioAsset.mockImplementation(async ({ projectId, blob }) => ({
    assetEntry: {
      id: crypto.randomUUID(),
      projectId,
      assetId: crypto.randomUUID(),
      width: 1,
      height: 1,
      mimeType: blob.type,
      size: blob.size,
      createdAt: 1,
    },
  }));
  const bodies: Blob[] = [];
  mocks.htmlCreate.mockImplementation(async () => {
    const chunks: number[] = [];
    return {
      append: async (bytes: Uint8Array) => {
        chunks.push(...bytes);
      },
      finalize: async () => {
        const blob = new Blob([Uint8Array.from(chunks)], { type: 'text/html;charset=utf-8' });
        bodies.push(blob);
        const assetId = crypto.randomUUID();
        return {
          ref: {
            assetId,
            createdAt: 1,
            location: { kind: 'opfs', objectKey: `objects/${assetId}` },
            size: blob.size,
            mimeType: blob.type,
            sha256: null,
          },
        };
      },
    };
  });
  mocks.htmlSave.mockImplementation(
    async (input: { filename: string; size: number; projectId: string }) => ({
      id: crypto.randomUUID(),
      ...input,
    })
  );
  const h = createWebdavCheckpointHarness();
  const first = await h.seedScenario([137, 80, 78, 71, 13, 10, 26, 10, 1], {
    name: 'Selected A',
    savedHtml: true,
  });
  const second = await h.seedScenario([137, 80, 78, 71, 13, 10, 26, 10, 1], {
    name: 'Excluded draft',
    savedHtml: true,
  });
  expect(first.artifacts).toHaveLength(2);
  expect(second.artifacts).toHaveLength(2);
  expect(new Set([...first.artifacts, ...second.artifacts].map((item) => item.sha256)).size).toBe(
    4
  );
  expect(await bodies[0]?.text()).toContain(first.projectId);
  expect(await bodies[2]?.text()).toContain(second.projectId);
  expect(mocks.install).not.toHaveBeenCalled();
});

it('refuses Scenario backup fixture creation without the current enrolled native profile', async () => {
  mocks.get.mockResolvedValue(undefined);
  await expect(
    createWebdavCheckpointHarness().seedScenario([137, 80, 78, 71, 13, 10, 26, 10, 1], {
      name: 'Cannot replace profile',
      savedHtml: true,
    })
  ).rejects.toThrow('current enrolled fixture profile');
  expect(mocks.scenarioAsset).not.toHaveBeenCalled();
  expect(mocks.scenarioCommit).not.toHaveBeenCalled();
  expect(mocks.htmlCreate).not.toHaveBeenCalled();
  expect(mocks.install).not.toHaveBeenCalled();
});

it('hashes the canonical persisted Review history position and returns to the baseline hash on Undo', async () => {
  const advanced = createQuickEditAdvancedState();
  const baseline = reviewAdvancedContentBaseline(advanced);
  const operation = createReviewAdvancedContentOperation({
    id: 'background-ui-change',
    at: 2,
    before: baseline,
    after: { ...baseline, background: { ...baseline.background, enabled: true } },
  });
  if (!operation) throw new Error('Background fixture operation is unavailable.');
  const snapshot: VideoWorkspaceSnapshot = {
    workspace: {
      aggregateId: 'review-projection',
      sourceAssetId: 'retained-source',
      formatVersion: 1,
      source: { duration: 12, width: 640, height: 360, mimeType: 'video/webm', size: 3 },
      revision: 7,
      cursor: 0,
      history: [],
      advanced,
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  };
  mocks.reviewRead.mockResolvedValue(snapshot);
  const h = createWebdavCheckpointHarness();
  const root = { rootKind: 'video-review' as const, rootId: snapshot.workspace.aggregateId };
  const queueScope = { spaceId: profile.spaceId, connectionGeneration: 1, profileCreatedAt: 1 };
  const queueRow = {
    ...queueScope,
    version: 1,
    kind: 'queue-operation',
    key: queueOperationKey(queueScope, 'safe-operation'),
    operationId: 'safe-operation',
    captureKey: 'capture',
    captureSha256: 'a'.repeat(64),
    rootKey: JSON.stringify([profile.spaceId, root.rootKind, root.rootId]),
    generation: 1,
    revision: 2,
    status: 'queued',
    stage: 'checking',
    runId: null,
    authorization: null,
    writeStarted: false,
    outcome: 'none',
    attemptId: null,
    failureCode: null,
    nextDueAt: 42,
    automaticRetryCount: 2,
    eventSequence: 0,
    droppedTransitions: 0,
    pendingTransitions: [],
    rawError: 'must not escape',
    endpoint: 'https://private.invalid/',
  };
  mocks.getAll.mockImplementation(async (store: string) =>
    store === 'sync_capture' ? [profile] : store === 'sync_outbox' ? [queueRow] : []
  );
  const before = await h.proof(root);
  expect(before.queue).toEqual([
    {
      operationId: 'safe-operation',
      status: 'queued',
      revision: 2,
      stage: 'checking',
      failureCode: null,
      nextDueAt: 42,
      automaticRetryCount: 2,
    },
  ]);
  const edited: VideoWorkspaceSnapshot = {
    ...snapshot,
    workspace: { ...snapshot.workspace, revision: 8, cursor: 1, history: [operation] },
  };
  mocks.reviewRead.mockResolvedValue(edited);
  const after = await h.proof(root);
  expect(after.revision).toBe(8);
  expect(after.logicalSha256).not.toBe(before.logicalSha256);
  expect(after.logical).toMatchObject({
    document: { advancedContent: { background: { enabled: true } } },
  });
  const cut: ReviewOperation = {
    id: 'retained-cut',
    at: 3,
    target: 'edit',
    before: null,
    after: { id: 'cut', kind: 'cut', start: 2, end: 4, requestedStart: 2, requestedEnd: 4 },
  };
  const annotation: ReviewOperation = {
    id: 'retained-annotation',
    at: 4,
    target: 'annotation',
    before: null,
    after: { id: 'note', text: 'Retained authored note', anchor: { kind: 'point', time: 5 } },
  };
  mocks.reviewRead.mockResolvedValue({
    ...edited,
    workspace: {
      ...edited.workspace,
      revision: 9,
      cursor: 3,
      history: [operation, cut, annotation],
    },
  });
  const complete = await h.proof(root);
  expect(complete.logical).toMatchObject({
    document: {
      edits: [cut.after],
      annotations: [annotation.after],
      advancedContent: { background: { enabled: true } },
    },
  });
  mocks.reviewRead.mockResolvedValue({
    ...edited,
    workspace: {
      ...edited.workspace,
      revision: 10,
      cursor: 0,
      history: [operation, cut, annotation],
    },
  });
  const undone = await h.proof(root);
  expect(undone.logicalSha256).toBe(before.logicalSha256);
  expect(undone.logical).toMatchObject({
    document: { edits: [], annotations: [], advancedContent: { background: { enabled: false } } },
  });
  expect(snapshot.workspace.history).toEqual([]);
});

function artifactFixture() {
  const text = '<!doctype html><main>Immutable historical fixture</main>';
  const blob = new File([text], 'history.html', { type: 'text/html;charset=utf-8' });
  const entry = {
    id: 'historical-export',
    projectId: 'scenario-owner',
    format: 'html',
    filename: 'history.html',
    createdAt: 1,
    size: blob.size,
    html: { mode: 'guide', assetId: 'historical-body' },
  };
  const ref = {
    assetId: entry.html.assetId,
    createdAt: 1,
    size: entry.size,
    mimeType: blob.type,
    sha256: null,
    location: { kind: 'opfs', objectKey: 'objects/historical-body' },
  };
  const owner = {
    ownerKind: 'scenario-export',
    ownerId: entry.id,
    role: 'body',
    assetId: ref.assetId,
  };
  mocks.getAll.mockImplementation(async (store: string) =>
    store === 'scenario_exports' ? [entry] : []
  );
  mocks.get.mockImplementation(async (store: string) =>
    store === 'scenario_exports'
      ? entry
      : store === 'asset_refs'
        ? ref
        : store === 'asset_owners'
          ? owner
          : undefined
  );
  mocks.fileRead.mockResolvedValue(blob);
  return { entry, ref, owner, blob, sha256: createHash('sha256').update(text).digest('hex') };
}
it('observes an intentionally missing historical HTML object without hydration or a broad metadata catch', async () => {
  const f = artifactFixture();
  mocks.fileRead.mockRejectedValue(
    new DOMException('Native HTML object is absent', 'NotFoundError')
  );
  await expect(createWebdavCheckpointHarness().artifacts(f.entry.projectId)).resolves.toEqual([
    expect.objectContaining({ exportId: f.entry.id, resident: false, sha256: null }),
  ]);
  expect(mocks.fileRead).toHaveBeenCalledWith(
    expect.objectContaining({ assetId: f.ref.assetId }),
    f.entry.filename
  );
});
it('does not classify invalid HTML ownership or missing owner schema as an unloaded artifact', async () => {
  const f = artifactFixture();
  mocks.get.mockImplementation(async (store: string) =>
    store === 'scenario_exports'
      ? f.entry
      : store === 'asset_refs'
        ? f.ref
        : store === 'asset_owners'
          ? { ...f.owner, assetId: 'foreign' }
          : undefined
  );
  await expect(createWebdavCheckpointHarness().artifacts(f.entry.projectId)).rejects.toThrow(
    'ownership'
  );
  expect(mocks.fileRead).not.toHaveBeenCalled();
  mocks.get.mockImplementation(async (store: string) => {
    if (store === 'asset_owners')
      throw new DOMException('Missing ownership schema', 'NotFoundError');
    return store === 'scenario_exports' ? f.entry : store === 'asset_refs' ? f.ref : undefined;
  });
  await expect(createWebdavCheckpointHarness().artifacts(f.entry.projectId)).rejects.toThrow(
    'Missing ownership schema'
  );
  expect(mocks.fileRead).not.toHaveBeenCalled();
});
it(
  'keeps corrupted HTML size visible and hashes genuine resident bytes ' +
    'through the canonical artifact reader',
  async () => {
    const f = artifactFixture();
    mocks.fileRead.mockRejectedValueOnce(new AssetObjectSizeMismatchError(f.ref.assetId, 0));
    await expect(createWebdavCheckpointHarness().artifacts(f.entry.projectId)).rejects.toThrow(
      'size'
    );
    mocks.fileRead.mockResolvedValue(f.blob);
    await expect(createWebdavCheckpointHarness().artifacts(f.entry.projectId)).resolves.toEqual([
      expect.objectContaining({ exportId: f.entry.id, resident: true, sha256: f.sha256 }),
    ]);
  }
);

function temporaryScreenshotFixture(storageClass = 'temporary') {
  const blob = new Blob([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1])], {
    type: 'image/png',
  });
  const media = {
    id: 'temporary-screenshot',
    kind: 'screenshot',
    source: { kind: 'screenshot' },
    filename: 'Backup excluded draft.png',
    originalFilename: 'Backup excluded draft.png',
    createdAt: 1,
    updatedAt: 1,
    size: blob.size,
    mimeType: blob.type,
    width: 1,
    height: 1,
    imageContentState: 'original',
    duration: null,
    sourceUrl: null,
    sourceTitle: null,
    sourceFavicon: null,
    tags: [],
    lifecycle: { storageClass, updatedAt: 1, savedAt: storageClass === 'library' ? 1 : null },
    workspaceRevision: 0,
    blob,
  };
  const previous = mocks.get.getMockImplementation();
  mocks.get.mockImplementation(async (store: string, key: string) =>
    store === 'media_library' && key === media.id ? media : previous?.(store, key)
  );
  mocks.screenshotSave.mockResolvedValue(media);
  return media;
}
it('reads back a genuine temporary Screenshot lifecycle and original hash without an Image workspace', async () => {
  const media = temporaryScreenshotFixture();
  const result = await createWebdavCheckpointHarness().seedTemporaryScreenshot([
    137, 80, 78, 71, 13, 10, 26, 10, 1,
  ]);
  expect(mocks.screenshotSave).toHaveBeenCalledWith(
    expect.objectContaining({ storageClass: 'temporary', filename: media.filename })
  );
  expect(result).toMatchObject({
    root: { rootKind: 'media', rootId: media.id },
    lifecycle: { storageClass: 'temporary' },
    captureCount: 0,
    pendingCount: 0,
    original: {
      size: media.size,
      sha256: createHash('sha256')
        .update(new Uint8Array(await media.blob.arrayBuffer()))
        .digest('hex'),
    },
  });
  expect(mocks.reviewRead).not.toHaveBeenCalled();
});
it('refuses a native Screenshot readback that was promoted rather than claiming an excluded draft', async () => {
  temporaryScreenshotFixture('library');
  await expect(
    createWebdavCheckpointHarness().seedTemporaryScreenshot([137, 80, 78, 71, 13, 10, 26, 10, 1])
  ).rejects.toThrow('Temporary screenshot');
});
it.each([[], [1, 2, 3], [137, 80, 78, 71, 13, 10, 26, 10, -1]])(
  'refuses invalid temporary Screenshot bytes before native writes: %j',
  async (bytes) => {
    await expect(createWebdavCheckpointHarness().seedTemporaryScreenshot(bytes)).rejects.toThrow(
      'Invalid temporary screenshot'
    );
    expect(mocks.screenshotSave).not.toHaveBeenCalled();
  }
);
it('refuses temporary Screenshot creation without current enrollment', async () => {
  mocks.get.mockResolvedValue(undefined);
  await expect(
    createWebdavCheckpointHarness().seedTemporaryScreenshot([137, 80, 78, 71, 13, 10, 26, 10, 1])
  ).rejects.toThrow('current enrolled fixture profile');
  expect(mocks.screenshotSave).not.toHaveBeenCalled();
});

function publishedProofFixture() {
  const root = { rootKind: 'video-review' as const, rootId: 'published-proof-review' };
  mocks.reviewRead.mockResolvedValue({
    workspace: {
      aggregateId: root.rootId,
      sourceAssetId: 'retained-source',
      formatVersion: 1,
      source: { duration: 1, width: 1, height: 1, mimeType: 'video/webm', size: 1 },
      revision: 1,
      cursor: 0,
      history: [],
      advanced: createQuickEditAdvancedState(),
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  });
  const first: PublishedCaptureOperation = {
    version: 1,
    kind: 'sync-operation',
    key: 'published-first',
    phase: 'published',
    createdAt: 1,
    spaceId: profile.spaceId,
    connectionGeneration: 1,
    profileCreatedAt: 1,
    rootKind: root.rootKind,
    rootId: root.rootId,
    rootKey: JSON.stringify([profile.spaceId, root.rootKind, root.rootId]),
    generation: 1,
    operationId: 'published-first',
    sourceSha256: 'a'.repeat(64),
    source: { changeKind: 'video-review', label: 'Must not expose source label' },
    basis: [],
    origin: 'local-edit',
    publicationId: null,
    publication: {
      kind: 'verified',
      acceptedAt: 2,
      preparedSha256: 'b'.repeat(64),
      attemptId: '11111111-1111-4111-8111-111111111111',
      recordKey: 'records/first.json',
      recordSha256: 'b'.repeat(64),
    },
    objects: [
      {
        objectId: 'preview',
        filename: 'private-preview-name',
        remoteKey: 'Files/private-preview',
        pinned: true,
        sha256: 'c'.repeat(64),
        ref: {
          assetId: 'preview-asset',
          createdAt: 1,
          size: 1500,
          mimeType: 'image/png',
          sha256: 'c'.repeat(64),
          location: { kind: 'opfs', objectKey: 'objects/preview-asset' },
        },
      },
      {
        objectId: 'thumbnail',
        filename: 'private-thumbnail-name',
        remoteKey: 'Files/private-thumbnail',
        pinned: true,
        sha256: 'd'.repeat(64),
        ref: {
          assetId: 'thumbnail-asset',
          createdAt: 1,
          size: 1470,
          mimeType: 'image/png',
          sha256: 'd'.repeat(64),
          location: { kind: 'opfs', objectKey: 'objects/thumbnail-asset' },
        },
      },
    ],
  };
  return { root, first, harness: createWebdavCheckpointHarness() };
}
it(
  'projects every parsed published object slot only for the exact root and enrollment ' +
    'without reading file bodies',
  async () => {
    const f = publishedProofFixture();
    const second: PublishedCaptureOperation = {
      ...f.first,
      key: 'published-second',
      operationId: 'published-second',
      generation: 2,
      objects: [{ ...f.first.objects[0]!, pinned: false }],
    };
    const foreignGeneration = {
      ...f.first,
      key: 'foreign-generation',
      operationId: 'foreign-generation',
      connectionGeneration: 2,
    };
    const foreignLifetime = {
      ...f.first,
      key: 'foreign-lifetime',
      operationId: 'foreign-lifetime',
      profileCreatedAt: 2,
    };
    const otherRoot = {
      ...f.first,
      key: 'other-root',
      operationId: 'other-root',
      rootId: 'other-review',
      rootKey: JSON.stringify([profile.spaceId, f.root.rootKind, 'other-review']),
    };
    const {
      publication: _publication,
      objects: _objects,
      phase: _phase,
      source: _source,
      sourceSha256: _digest,
      ...header
    } = f.first;
    const unpublished = createNativeCapture({
      ...header,
      key: 'unpublished',
      operationId: 'unpublished',
      change: { kind: 'tombstone' },
    });
    const rawFirst = {
      ...f.first,
      objects: f.first.objects.map((object) => ({
        ...object,
        rawBody: 'unchecked-body-must-not-escape',
        rawUrl: 'https://private.invalid/',
      })),
    };
    mocks.getAll.mockImplementation(async (store: string) =>
      store === 'sync_capture'
        ? [profile, rawFirst, second, foreignGeneration, foreignLifetime, otherRoot, unpublished]
        : []
    );
    const proof = await f.harness.proof(f.root);
    expect(proof).toHaveProperty('publishedObjects', [
      {
        assetId: 'preview-asset',
        objectKey: 'objects/preview-asset',
        size: 1500,
        sha256: 'c'.repeat(64),
        pinned: true,
      },
      {
        assetId: 'thumbnail-asset',
        objectKey: 'objects/thumbnail-asset',
        size: 1470,
        sha256: 'd'.repeat(64),
        pinned: true,
      },
      {
        assetId: 'preview-asset',
        objectKey: 'objects/preview-asset',
        size: 1500,
        sha256: 'c'.repeat(64),
        pinned: false,
      },
    ]);
    expect(proof.objects).toEqual([]);
    expect(proof.physicalScope).toBe('native-editing-closure');
    expect(proof.captures.map((capture) => capture.operationId)).toEqual([
      'published-first',
      'published-second',
      'foreign-generation',
      'foreign-lifetime',
      'unpublished',
    ]);
    expect(proof.allOperations).toHaveLength(6);
    expect(mocks.fileRead).not.toHaveBeenCalled();
    const text = JSON.stringify(proof);
    for (const privateText of [
      'private-preview-name',
      'Files/private-preview',
      'Must not expose source label',
      'unchecked-body-must-not-escape',
      'https://private.invalid/',
    ])
      expect(text).not.toContain(privateText);
  }
);
it('rejects invalid published metadata instead of exposing unchecked object claims', async () => {
  const f = publishedProofFixture();
  mocks.getAll.mockImplementation(async (store: string) =>
    store === 'sync_capture'
      ? [profile, { ...f.first, objects: [{ ...f.first.objects[0], sha256: 'unchecked' }] }]
      : []
  );
  await expect(f.harness.proof(f.root)).rejects.toThrow('Invalid native capture fixture metadata');
  expect(mocks.fileRead).not.toHaveBeenCalled();
});

function savedBackupFile(blob: Blob) {
  const getFileHandle = vi.fn(async () => ({
    getFile: async () => new File([blob], 'backup-all-proof.zip', { type: 'application/zip' }),
  }));
  const getDirectory = vi.fn(async () => ({ getFileHandle }));
  vi.stubGlobal('navigator', { storage: { getDirectory } });
  return { getDirectory, getFileHandle };
}
it.each([
  '../backup-all-proof.zip',
  'backup-foreign-proof.zip',
  'https://private.invalid/backup-all-proof.zip',
  'backup-all-proof.zip/child',
  '',
])(
  'refuses an unsupported backup inspection filename before filesystem access: %s',
  async (filename) => {
    const fs = savedBackupFile(new Blob());
    try {
      await expect(createWebdavCheckpointHarness().inspectBackup(filename)).rejects.toThrow(
        'Invalid backup fixture filename'
      );
      expect(fs.getDirectory).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  }
);
it('canonically inspects the actual picker ZIP and streams exact entry digests without exposing bodies', async () => {
  const { createIdentityMismatchArchive } =
    await import('../../../apps/extension/src/workflows/media-hub-backup/v6/inspect.identity.test-support');
  const blob = await createIdentityMismatchArchive('library-item', 'root-one');
  const fs = savedBackupFile(blob);
  try {
    const result = await createWebdavCheckpointHarness().inspectBackup('backup-all-proof.zip');
    expect(fs.getFileHandle).toHaveBeenCalledExactlyOnceWith('backup-all-proof.zip');
    expect(result.roots).toEqual([{ rootKind: 'media', rootId: 'root-one' }]);
    expect(result.rootIds).toEqual([]);
    expect(result.scenarios).toEqual([]);
    expect(result.files).toContainEqual({
      size: 5,
      sha256: createHash('sha256').update('media').digest('hex'),
    });
    expect(
      result.files.every((entry) => Object.keys(entry).sort().join(',') === 'sha256,size')
    ).toBe(true);
  } finally {
    vi.unstubAllGlobals();
  }
});
it('propagates canonical archive identity refusal without accepting a hand-parsed ZIP', async () => {
  const { createIdentityMismatchArchive } =
    await import('../../../apps/extension/src/workflows/media-hub-backup/v6/inspect.identity.test-support');
  savedBackupFile(await createIdentityMismatchArchive('library-item'));
  try {
    await expect(
      createWebdavCheckpointHarness().inspectBackup('backup-selected-proof.zip')
    ).rejects.toThrow();
  } finally {
    vi.unstubAllGlobals();
  }
});
it('decodes canonical Scenario metadata and historical export identities from the saved ZIP', async () => {
  const { createGuideProject } =
    await import('../../../apps/extension/src/features/scenario/project/factories');
  const { buildScenarioProjectRootInventory } =
    await import('../../../apps/extension/src/workflows/media-hub-backup/v6/inventory/scenario-projects');
  const { createArchivePathAllocator } =
    await import('../../../apps/extension/src/composition/archive-transfer');
  const { createArchiveMemorySink } =
    await import('../../../apps/extension/src/composition/archive-transfer/test-support');
  const { buildMediaHubBackupExportPlanV6, exportMediaHubBackupV6 } =
    await import('../../../apps/extension/src/workflows/media-hub-backup/v6/export');
  const { createMediaHubBackupExportOptions } =
    await import('../../../apps/extension/src/workflows/media-hub-backup/v6/options');
  const project = createGuideProject('Preserved local name', 'archive-scenario', 1);
  const entry = { id: project.id, project, createdAt: 1, updatedAt: 1, workspaceRevision: 1 };
  const html = new File(['<html>Distinct historical artifact</html>'], 'history.html', {
    type: 'text/html',
  });
  const ref = {
    assetId: 'archive-html',
    createdAt: 1,
    location: { kind: 'opfs', objectKey: 'objects/archive-html' },
    mimeType: html.type,
    size: html.size,
    sha256: null,
  };
  const saved = {
    id: 'saved-export',
    projectId: project.id,
    format: 'html',
    filename: html.name,
    createdAt: 1,
    size: html.size,
    html: { mode: 'guide', assetId: ref.assetId },
  };
  mocks.fileRead.mockResolvedValue(html);
  const roots = await buildScenarioProjectRootInventory({
    db: {
      transaction: () => ({
        objectStore: (store: string) => ({
          getAll: async () => (store === 'scenario_projects' ? [entry] : []),
        }),
        done: Promise.resolve(),
      }),
      get: async (store) => (store === 'asset_refs' ? ref : undefined),
      getAll: async (store) => (store === 'scenario_projects' ? [entry] : []),
      getAllFromIndex: async (store) => (store === 'scenario_exports' ? [saved] : []),
    },
    paths: createArchivePathAllocator(),
    options: createMediaHubBackupExportOptions(),
  });
  const { MEDIA_HUB_BACKUP_SHARED_LAYOUT } =
    await import('../../../apps/extension/src/workflows/media-hub-backup/v6/layout');
  const output = createArchiveMemorySink();
  await exportMediaHubBackupV6({
    plan: buildMediaHubBackupExportPlanV6({
      layout: MEDIA_HUB_BACKUP_SHARED_LAYOUT,
      roots,
      privacy: {
        includeSourceMetadata: false,
        includeTelemetry: false,
        includeWebSnapshots: false,
      },
    }),
    sink: output.sink,
  });
  savedBackupFile(output.blob());
  try {
    const result = await createWebdavCheckpointHarness().inspectBackup('backup-selected-proof.zip');
    expect(result.roots).toEqual([{ rootKind: 'scenario-project', rootId: project.id }]);
    expect(result.rootIds).toEqual([project.id]);
    expect(result.scenarios).toEqual([
      { id: project.id, name: 'Preserved local name', exports: [saved.id] },
    ]);
    expect(result.files).toContainEqual({
      size: html.size,
      sha256: createHash('sha256')
        .update(await html.text())
        .digest('hex'),
    });
  } finally {
    vi.unstubAllGlobals();
  }
});

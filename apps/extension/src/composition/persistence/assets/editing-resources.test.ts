import { expect, it, vi } from 'vitest';
import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import { workspace as template } from '../review-workspaces/backup-restore.test-support';
import { materializeVideoWorkspaceProject } from '../review-workspaces/project-metadata';
import type { VideoWorkspace } from '../review-workspaces/contracts';
import {
  createMediaLibraryEntry,
  createProjectAssetEntry,
  createVideoProjectEntryWithMediaClip,
  createProjectExportEntry,
} from '../projects/index.test-support';
import { VideoProjectAssetType } from '../../../features/video/project/types';
import { betaV1Fixture } from '../infrastructure/indexed-db/fixtures/beta-v1';
import { reference } from '../sync-capture/test-support/freeze';
import { createPersistedEditorDocumentFixture } from '../document-assets/test-support';
import { createEditorDocumentFixture } from '../../../editor/document/page-session/document.test-support';
import { updateQuickEditBackground } from '../../../features/video/review/advanced/background';
import {
  createReviewAdvancedContentOperation,
  reviewAdvancedContentBaseline,
} from '../../../features/video/review/document';
import {
  createGuideProject,
  createGuideStep,
  createGuideImageBlock,
  createTourDocument,
} from '../../../features/scenario/project/factories';
import { createScenarioProjectEntry } from '../scenario/projects/entry';
import { encodeScenarioUnitStorage } from '../scenario/storage-units';
import { collectNativeEditingResources, NATIVE_EDITING_RESOURCE_STORES } from './editing-resources';

function fixture() {
  const f = createReviewWorkspaceStoreFixture(() => false);
  for (const name of NATIVE_EDITING_RESOURCE_STORES) f.rows.set(name, new Map());
  const seed = (store: string, key: IDBValidKey, value: unknown) =>
    f.rows.get(store)!.set(typeof key === 'string' ? key : JSON.stringify(key), value);
  const tx = () =>
    f.database.transaction(
      [...NATIVE_EDITING_RESOURCE_STORES],
      'readonly'
    ) as unknown as Parameters<typeof collectNativeEditingResources>[0];
  const project = (id: string) =>
    collectNativeEditingResources(tx(), { rootKind: 'video-project', rootId: id });
  const media = (id: string) =>
    collectNativeEditingResources(tx(), { rootKind: 'media', rootId: id });
  const owner = (kind: string, id: string, assetId: string, role = 'body') =>
    seed('asset_owners', [kind, id, role], { ownerKind: kind, ownerId: id, role, assetId });
  const asset = (id: string, mimeType = 'image/png', originMediaId?: string) => {
    const entry = createProjectAssetEntry({
      id,
      assetId: `bytes-${id}`,
      mimeType,
      size: 6,
      ...(originMediaId ? { originMediaId } : {}),
    });
    seed('project_assets', id, entry);
    seed('asset_refs', entry.assetId, reference(entry.assetId, mimeType, entry.size));
    owner('project-asset', id, entry.assetId);
    return entry;
  };
  const image = (id: string, source: 'screenshot' | 'stored-asset' = 'screenshot') => {
    const entry = createMediaLibraryEntry({
      id,
      kind: source === 'screenshot' ? 'screenshot' : 'image',
      source:
        source === 'screenshot'
          ? { kind: 'screenshot' }
          : { kind: 'stored-asset', assetId: `original-${id}` },
      mimeType: 'image/png',
      size: 6,
      workspaceRevision: 1,
    });
    seed('media_library', id, entry);
    if (source === 'stored-asset') {
      seed('asset_refs', `original-${id}`, reference(`original-${id}`, 'image/png', 6));
      owner('media-library', id, `original-${id}`, 'source');
    }
    const document = createPersistedEditorDocumentFixture(
      createEditorDocumentFixture(),
      `document-${id}`
    );
    seed('image_workspaces', id, {
      aggregateId: id,
      document,
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
      sourceUrl: null,
      sourceTitle: null,
    });
    seed('asset_refs', `document-${id}`, reference(`document-${id}`, 'image/png', 6));
    return entry;
  };
  const review = (source: ReturnType<typeof asset>, child?: ReturnType<typeof asset>) => {
    const id = `project-asset:${source.id}`;
    let workspace: VideoWorkspace = materializeVideoWorkspaceProject(
      {
        ...structuredClone(template),
        aggregateId: id,
        sourceAssetId: source.assetId,
        source: { ...template.source, mimeType: source.mimeType, size: source.size },
        history: [],
        cursor: 0,
      },
      id
    );
    if (child)
      workspace = {
        ...workspace,
        advanced: {
          ...workspace.advanced,
          background: updateQuickEditBackground(workspace.advanced.background, {
            enabled: true,
            type: 'image',
            assetId: `project-asset:${child.id}`,
          }),
        },
      };
    seed('video_workspaces', id, workspace);
    return workspace;
  };
  const publish = (entry: ReturnType<typeof asset>) => {
    const id = `project-asset:${entry.id}`;
    seed(
      'media_library',
      id,
      createMediaLibraryEntry({
        id,
        kind: 'video',
        source: { kind: 'project-asset', projectAssetId: entry.id },
        size: entry.size,
        mimeType: entry.mimeType,
        lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 1 },
      })
    );
    return id;
  };
  return { ...f, seed, tx, project, media, owner, asset, image, review, publish };
}

it.each([false, true])(
  'projects an inline screenshot with bytes present=%s without reading bytes',
  async (present) => {
    const f = fixture();
    const image = f.image('screen');
    if (present)
      f.seed('media_library', image.id, {
        ...image,
        blob: new Blob(['source'], { type: 'image/png' }),
      });
    const stream = vi.spyOn(Blob.prototype, 'stream').mockImplementation(() => {
      throw new Error('Original bytes must not be read');
    });
    const buffer = vi.spyOn(Blob.prototype, 'arrayBuffer').mockImplementation(() => {
      throw new Error('Original bytes must not be read');
    });
    try {
      expect(await f.media('screen')).toEqual({
        refs: [reference('document-screen', 'image/png', 6)],
        inlineMediaIds: ['screen'],
      });
    } finally {
      stream.mockRestore();
      buffer.mockRestore();
    }
  }
);

it('projects an original-only image after its workspace was removed at a nonzero revision', async () => {
  const f = fixture();
  f.image('restored-original');
  f.rows.get('image_workspaces')!.delete('restored-original');
  expect(await f.media('restored-original')).toEqual({
    refs: [],
    inlineMediaIds: ['restored-original'],
  });
});

it('retains a stored image original and projects newly saved document resources on the next call', async () => {
  const f = fixture();
  f.image('photo', 'stored-asset');
  expect((await f.media('photo')).refs.map((ref) => ref.assetId)).toEqual([
    'original-photo',
    'document-photo',
  ]);
  const document = createPersistedEditorDocumentFixture(
    createEditorDocumentFixture(),
    'new-source'
  );
  f.seed('image_workspaces', 'photo', {
    aggregateId: 'photo',
    revision: 1,
    createdAt: 1,
    updatedAt: 2,
    sourceUrl: null,
    sourceTitle: null,
    document,
  });
  f.seed('asset_refs', 'new-source', reference('new-source', 'image/png', 9));
  expect((await f.media('photo')).refs.map((ref) => ref.assetId)).toEqual([
    'original-photo',
    'new-source',
  ]);
});

it('refuses a missing or contradictory reachable source binding and preserves native rows', async () => {
  const f = fixture();
  f.image('photo', 'stored-asset');
  f.seed('asset_refs', 'original-photo', reference('wrong-key', 'image/png', 6));
  const before = structuredClone(f.rows);
  await expect(f.media('photo')).rejects.toThrow('unavailable');
  expect(f.rows).toEqual(before);
  f.rows.get('asset_refs')!.delete('original-photo');
  await expect(f.media('photo')).rejects.toThrow('unavailable');
});

it('retains Montage private Review cycles and redo-only resources, excluding parent exports', async () => {
  const f = fixture();
  const montage = createVideoProjectEntryWithMediaClip();
  const source = montage.project.assets[0]!;
  if (source.source.kind !== 'project-asset') throw new Error('Expected native fixture source');
  const first = f.asset(source.source.projectAssetId, source.metadata.mimeType);
  first.size = source.metadata.size;
  f.seed('project_assets', first.id, first);
  f.seed('asset_refs', first.assetId, reference(first.assetId, first.mimeType, first.size));
  const second = f.asset('nested', 'video/webm');
  const redo = f.asset('redo');
  const review = f.review(first, second);
  f.review(second, first);
  const before = reviewAdvancedContentBaseline(review.advanced);
  const operation = createReviewAdvancedContentOperation({
    id: 'redo',
    at: 4,
    before,
    after: {
      ...before,
      background: updateQuickEditBackground(before.background, {
        type: 'image',
        assetId: `project-asset:${redo.id}`,
        enabled: true,
      }),
    },
  });
  if (!operation) throw new Error('Expected valid native history');
  review.history = [operation];
  f.seed('video_workspaces', review.aggregateId, review);
  f.seed('video_projects', montage.id, montage);
  const exported = createProjectExportEntry({ projectId: montage.id });
  f.seed('project_exports', exported.id, exported);
  // An export-only private Review is intentionally malformed: editable closure must never read it.
  f.seed('video_workspaces', `export:${exported.id}`, { invalid: true });
  const result = await f.project(montage.id);
  expect(result.refs.map((ref) => ref.assetId).sort()).toEqual(
    [first.assetId, second.assetId, redo.assetId].sort()
  );
});

it('deduplicates shared Montage resources while including the origin image document and original', async () => {
  const f = fixture();
  f.image('origin', 'stored-asset');
  const montage = createVideoProjectEntryWithMediaClip();
  const source = montage.project.assets[0]!;
  if (source.source.kind !== 'project-asset') throw new Error('Expected fixture source');
  const entry = f.asset(source.source.projectAssetId, source.metadata.mimeType, 'origin');
  entry.size = source.metadata.size;
  f.seed('project_assets', entry.id, entry);
  f.seed('asset_refs', entry.assetId, reference(entry.assetId, entry.mimeType, entry.size));
  montage.project.assets.push(structuredClone(source));
  montage.project.assets[1]!.id += '-shared';
  f.seed('video_projects', montage.id, montage);
  const result = await f.project(montage.id);
  expect(result.refs.map((ref) => ref.assetId).sort()).toEqual(
    [entry.assetId, 'original-origin', 'document-origin'].sort()
  );
  expect(new Set(result.refs.map((ref) => ref.assetId)).size).toBe(result.refs.length);
});

it('projects a native Review root with nested private resources', async () => {
  const f = fixture();
  const original = f.asset('original', 'video/webm');
  const nested = f.asset('nested', 'video/webm');
  const still = f.asset('still');
  const id = f.publish(original);
  f.review(original, nested);
  f.review(nested, still);
  const result = await collectNativeEditingResources(f.tx(), {
    rootKind: 'video-review',
    rootId: id,
  });
  expect(result.refs.map((ref) => ref.assetId).sort()).toEqual(
    [original.assetId, nested.assetId, still.assetId].sort()
  );
});

it('opens the selected archived Review without downloading another Review on the same original', async () => {
  const f = fixture();
  const original = f.asset('original', 'video/webm');
  const archivedMaterial = f.asset('archived-material');
  const unrelatedMaterial = f.asset('current-material');
  const sourceId = f.publish(original);
  const previous = f.review(original, archivedMaterial);
  const archiveId = 'recording:quick-project:archive';
  f.seed('video_workspaces', archiveId, {
    ...previous,
    aggregateId: archiveId,
    sourceMediaId: sourceId,
  });
  f.review(original, unrelatedMaterial);
  const result = await collectNativeEditingResources(f.tx(), {
    rootKind: 'video-review',
    rootId: archiveId,
  });
  expect(result.refs.map((ref) => ref.assetId).sort()).toEqual(
    [original.assetId, archivedMaterial.assetId].sort()
  );
});

it('includes an exported media source when that media is selected', async () => {
  const f = fixture();
  const exported = createProjectExportEntry();
  const id = `export:${exported.id}`;
  f.seed('project_exports', exported.id, exported);
  f.seed(
    'asset_refs',
    exported.assetId,
    reference(exported.assetId, exported.mimeType!, exported.size)
  );
  f.owner('project-export', exported.id, exported.assetId);
  f.seed(
    'media_library',
    id,
    createMediaLibraryEntry({
      id,
      kind: 'export',
      source: { kind: 'project-export', exportId: exported.id, projectId: exported.projectId },
      mimeType: exported.mimeType!,
      size: exported.size,
    })
  );
  expect((await f.media(id)).refs.map((ref) => ref.assetId)).toEqual([exported.assetId]);
});

it('uses exact Scenario children from Montage without reading the unrelated Scenario root', async () => {
  const f = fixture();
  const montage = createVideoProjectEntryWithMediaClip();
  const source = montage.project.assets[0]!;
  source.source = { kind: 'scenario-asset', scenarioAssetId: 'child' };
  source.type = VideoProjectAssetType.IMAGE;
  source.metadata = {
    ...source.metadata,
    mimeType: 'image/png',
    size: 6,
    width: 10,
    height: 10,
    duration: null,
    hasAudio: false,
  };
  f.seed('scenario_assets', 'child', {
    id: 'child',
    projectId: 'unrelated-root',
    assetId: 'child-bytes',
    galleryAssetId: null,
    mimeType: 'image/png',
    width: 10,
    height: 10,
    size: 6,
    createdAt: 1,
  });
  f.owner('scenario-asset', 'child', 'child-bytes');
  f.seed('asset_refs', 'child-bytes', reference('child-bytes', 'image/png', 6));
  f.seed('scenario_projects', 'unrelated-root', { invalid: true });
  f.seed('video_projects', montage.id, montage);
  expect((await f.project(montage.id)).refs.map((ref) => ref.assetId)).toEqual(['child-bytes']);
});

it('materializes Scenario retained history and keeps history documents and detached Tour audio', async () => {
  const f = fixture();
  const project = createGuideProject('Guide', 'guide', 100);
  const old = structuredClone(project);
  const step = createGuideStep('Old image', 'old-step');
  step.blocks.push(
    createGuideImageBlock({
      id: 'old-image',
      assetId: 'child',
      editDocumentId: 'old-edit',
      width: 10,
      height: 10,
      source: { kind: 'import', filename: 'old.png' },
    })
  );
  old.items.push(step);
  project.tour = createTourDocument('tour');
  project.tour.audioResources = [{ assetId: 'audio', duration: 2, name: 'Take.wav' }];
  const entry = {
    ...createScenarioProjectEntry({ project, existing: undefined, updatedAt: 200 }),
    workspaceRevision: 2,
    history: [{ revision: 1, savedAt: 100, project: old }],
  };
  const encoded = encodeScenarioUnitStorage(entry, []);
  f.seed('scenario_projects', entry.id, encoded.head);
  for (const row of encoded.rows)
    f.seed('scenario_project_history', [row.projectId, row.revision], row);
  for (const row of encoded.units)
    f.seed('scenario_project_units', [row.projectId, row.unitId, row.revision], row);
  for (const [id, mimeType, width, height, duration] of [
    ['child', 'image/png', 10, 10, undefined],
    ['audio', 'audio/wav', 0, 0, 2],
  ] as const) {
    f.seed('scenario_assets', id, {
      id,
      projectId: project.id,
      assetId: `bytes-${id}`,
      galleryAssetId: null,
      mimeType,
      width,
      height,
      size: 6,
      createdAt: 1,
      ...(duration ? { duration } : {}),
    });
    f.seed('asset_refs', `bytes-${id}`, reference(`bytes-${id}`, mimeType, 6));
    f.owner('scenario-asset', id, `bytes-${id}`);
  }
  f.seed('scenario_step_editor_documents', 'old-edit', {
    stepId: 'old-edit',
    projectId: project.id,
    createdAt: 1,
    updatedAt: 1,
    document: createPersistedEditorDocumentFixture(
      createEditorDocumentFixture(),
      'history-document'
    ),
  });
  f.seed('asset_refs', 'history-document', reference('history-document', 'image/png', 6));
  const result = await collectNativeEditingResources(f.tx(), {
    rootKind: 'scenario-project',
    rootId: project.id,
  });
  expect(result.refs.map((ref) => ref.assetId).sort()).toEqual(
    ['bytes-child', 'bytes-audio', 'history-document'].sort()
  );
  f.rows.get('asset_refs')!.delete('history-document');
  await expect(
    collectNativeEditingResources(f.tx(), { rootKind: 'scenario-project', rootId: project.id })
  ).rejects.toThrow('unavailable');
});

it('keeps screenshot provenance and its editable document in a native Review closure', async () => {
  const f = fixture();
  f.image('screen');
  const original = f.asset('original', 'video/webm');
  const derived = f.asset('derived', 'image/png', 'screen');
  const id = f.publish(original);
  f.review(original, derived);
  const result = await collectNativeEditingResources(f.tx(), {
    rootKind: 'video-review',
    rootId: id,
  });
  expect(result.inlineMediaIds).toEqual(['screen']);
  expect(result.refs.map((ref) => ref.assetId).sort()).toEqual(
    [original.assetId, derived.assetId, 'document-screen'].sort()
  );
});

it('keeps recording graph originals that have no authored media clip', async () => {
  const f = fixture();
  const recording = betaV1Fixture.records.recordings[0];
  const media = betaV1Fixture.records.media_library[0];
  const ref = betaV1Fixture.records.asset_refs[0];
  f.seed('recordings', recording.id, recording);
  f.seed('media_library', media.id, media);
  f.seed('asset_refs', ref.assetId, ref);
  f.owner('recording', recording.id, ref.assetId);
  const montage = createVideoProjectEntryWithMediaClip();
  const source = montage.project.assets[0]!;
  if (source.source.kind !== 'project-asset') throw new Error('Expected fixture source');
  const asset = f.asset(source.source.projectAssetId, source.metadata.mimeType);
  asset.size = source.metadata.size;
  f.seed('project_assets', asset.id, asset);
  f.seed('asset_refs', asset.assetId, reference(asset.assetId, asset.mimeType, asset.size));
  montage.project.baseRecordingId = recording.id;
  f.seed('video_projects', montage.id, montage);
  expect((await f.project(montage.id)).refs.map((item) => item.assetId).sort()).toEqual(
    [ref.assetId, asset.assetId].sort()
  );
});

it('deduplicates borrowed Scenario originals and retains the current Library image workspace', async () => {
  const f = fixture();
  f.image('photo', 'stored-asset');
  const project = createGuideProject('Borrowed', 'borrowed', 100);
  const step = createGuideStep('Shared image', 'step');
  for (const id of ['first', 'second']) {
    step.blocks.push(
      createGuideImageBlock({
        id: `block-${id}`,
        assetId: id,
        width: 10,
        height: 10,
        source: { kind: 'import', filename: 'image.png' },
      })
    );
    f.seed('scenario_assets', id, {
      id,
      projectId: project.id,
      assetId: 'original-photo',
      galleryAssetId: 'photo',
      borrowedMediaId: 'photo',
      mimeType: 'image/png',
      width: 10,
      height: 10,
      size: 6,
      createdAt: 1,
    });
    f.owner('scenario-asset', id, 'original-photo');
  }
  project.items.push(step);
  f.seed(
    'scenario_projects',
    project.id,
    createScenarioProjectEntry({ project, existing: undefined, updatedAt: 100 })
  );
  const result = await collectNativeEditingResources(f.tx(), {
    rootKind: 'scenario-project',
    rootId: project.id,
  });
  expect(result.refs.map((item) => item.assetId).sort()).toEqual(
    ['original-photo', 'document-photo'].sort()
  );
  f.seed('scenario_assets', 'second', {
    id: 'second',
    projectId: project.id,
    assetId: 'foreign-same-shape',
    galleryAssetId: 'photo',
    borrowedMediaId: 'photo',
    mimeType: 'image/png',
    width: 10,
    height: 10,
    size: 6,
    createdAt: 1,
  });
  f.seed('asset_refs', 'foreign-same-shape', reference('foreign-same-shape', 'image/png', 6));
  f.owner('scenario-asset', 'second', 'foreign-same-shape');
  await expect(
    collectNativeEditingResources(f.tx(), { rootKind: 'scenario-project', rootId: project.id })
  ).rejects.toThrow('unavailable');
});

it('collects the original before the first Review opening creates its workspace', async () => {
  const f = fixture();
  const source = f.asset('first-review', 'video/webm');
  const id = f.publish(source);
  await expect(
    collectNativeEditingResources(f.tx(), { rootKind: 'video-review', rootId: id })
  ).resolves.toMatchObject({
    refs: [expect.objectContaining({ assetId: source.assetId })],
    inlineMediaIds: [],
  });
  expect(f.rows.get('video_workspaces')!.size).toBe(0);
});

it('includes native project exports for backup while ordinary editing keeps its smaller closure', async () => {
  const f = fixture();
  const entry = createVideoProjectEntryWithMediaClip();
  const source = entry.project.assets[0]!;
  if (source.source.kind !== 'project-asset') throw new Error('Expected project source');
  const original = f.asset(source.source.projectAssetId, source.metadata.mimeType);
  original.size = source.metadata.size;
  f.seed('project_assets', original.id, original);
  f.seed(
    'asset_refs',
    original.assetId,
    reference(original.assetId, original.mimeType, original.size)
  );
  f.seed('video_projects', entry.id, entry);
  const saved = createProjectExportEntry({
    id: 'saved-export',
    projectId: entry.id,
    assetId: 'export-bytes',
    size: 6,
    mimeType: 'video/webm',
  });
  f.seed('project_exports', saved.id, saved);
  f.seed('asset_refs', saved.assetId, reference(saved.assetId, 'video/webm', 6));
  f.owner('project-export', saved.id, saved.assetId);
  expect((await f.project(entry.id)).refs.map((ref) => ref.assetId)).not.toContain(saved.assetId);
  expect(
    (
      await collectNativeEditingResources(
        f.tx(),
        { rootKind: 'video-project', rootId: entry.id },
        'backup'
      )
    ).refs.map((ref) => ref.assetId)
  ).toContain(saved.assetId);
});

it.each(['project-asset', 'export'] as const)(
  'prepares a %s Review source from its native owner without creating a media mirror',
  async (kind) => {
    const f = fixture();
    const source = f.asset('virtual-source', 'video/webm');
    const child = f.asset('review-image');
    const workspace = f.review(source, child);
    const id = kind === 'project-asset' ? `project-asset:${source.id}` : 'export:retained';
    if (kind === 'export') {
      const entry = createProjectExportEntry({
        id: 'retained',
        projectId: 'project',
        assetId: source.assetId,
        filename: 'saved.webm',
        mimeType: source.mimeType,
        size: source.size,
      });
      f.seed('project_exports', entry.id, entry);
      f.owner('project-export', entry.id, source.assetId);
    }
    f.seed('video_workspaces', id, { ...workspace, aggregateId: id });
    const resources = await collectNativeEditingResources(
      f.tx(),
      { rootKind: 'video-review', rootId: id },
      'backup'
    );
    expect(resources.refs.map((ref) => ref.assetId).sort()).toEqual(
      [source.assetId, child.assetId].sort()
    );
    expect(f.rows.get('media_library')!.has(id)).toBe(false);
  }
);

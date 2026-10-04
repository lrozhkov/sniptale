import { expect, it, vi } from 'vitest';
import {
  getStore,
  createAsset,
  createDocument,
  db,
  stores,
} from './aggregate-mutations.test-support';
import { createGuideProject } from '../../../features/scenario/project/factories';
import { commitScenarioAggregateMutation } from './aggregate-mutations';
import { deleteOrphanedScenarioAggregateChild, deleteScenarioAggregate } from './aggregate-cleanup';
import { completePhysicalDeleteOperation } from '../assets';
import { pruneScenarioResources } from './retention';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import { createMediaLibraryEntry } from '../projects/index.test-support';

async function commitLegacyFrozenChild(
  project: GuideProject,
  child: Omit<ReturnType<typeof createAsset>, 'galleryAssetId'> & { galleryAssetId: string | null }
) {
  if (child.galleryAssetId)
    getStore('media_library').set(
      child.galleryAssetId,
      createMediaLibraryEntry({ id: child.galleryAssetId, source: { kind: 'screenshot' } })
    );
  await commitScenarioAggregateMutation(project, { children: { assetPuts: [child] } });
  // Cleanup fixtures intentionally retain the legacy graph with a missing logical origin.
  if (child.galleryAssetId) getStore('media_library').delete(child.galleryAssetId);
}

it('retains an external montage snapshot when its scenario is replaced from an archive', async () => {
  const { createVideoProjectEntryWithMediaClip } = await import('../projects/index.test-support');
  const { putScenarioProjectBackupRestore } = await import('./backup-restore');
  const project = createGuideProject('Archive replacement');
  const child = { ...createAsset(project.id), galleryAssetId: 'origin' };
  await commitLegacyFrozenChild(project, child);
  const video = createVideoProjectEntryWithMediaClip();
  video.project.assets[0]!.source = { kind: 'scenario-asset', scenarioAssetId: child.id };
  getStore('video_projects').set(video.id, video);
  stores.set('thumbnails', new Map());
  const tx = db.transaction([...getStoreNames()]);
  await putScenarioProjectBackupRestore({
    operation: {
      operationId: 'archive-delete',
      kind: 'physical-delete',
      status: 'pending',
      assetIds: [],
      createdAt: 1,
      updatedAt: 1,
    },
    root: {
      assets: [],
      entry: { id: project.id, project, createdAt: 1, updatedAt: 2, workspaceRevision: 2 },
      exports: [],
      exportThumbnails: [],
      stepDocuments: [],
    },
    stores: {
      assets: tx.objectStore('scenario_assets'),
      exports: tx.objectStore('scenario_exports'),
      operations: tx.objectStore('asset_operations'),
      owners: tx.objectStore('asset_owners'),
      presentations: tx.objectStore('aggregate_presentations'),
      projects: tx.objectStore('scenario_projects'),
      refs: tx.objectStore('asset_refs'),
      stepDocuments: tx.objectStore('scenario_step_editor_documents'),
      thumbnails: tx.objectStore('thumbnails'),
    } as unknown as Parameters<typeof putScenarioProjectBackupRestore>[0]['stores'],
    strategy: 'replace',
    tx: tx as unknown as Parameters<typeof putScenarioProjectBackupRestore>[0]['tx'],
  });
  const saved = getStore('video_projects').get(video.id) as typeof video;
  expect(saved.project.assets[0]!.source.kind).toBe('project-asset');
  expect(getStore('asset_refs').has(child.assetId)).toBe(true);
  expect(getStore('media_library').size).toBe(0);
});

function getStoreNames() {
  return [
    'scenario_projects',
    'scenario_assets',
    'scenario_exports',
    'scenario_step_editor_documents',
    'asset_operations',
    'asset_owners',
    'asset_refs',
    'media_library',
    'project_assets',
    'video_projects',
    'recordings',
    'aggregate_presentations',
    'thumbnails',
  ];
}

it('retains an invalid scenario source record together with its byte owner on parent removal', async () => {
  const project = createGuideProject('Retain source evidence');
  const child = { ...createAsset(project.id), galleryAssetId: 'origin' };
  await commitLegacyFrozenChild(project, child);
  getStore('scenario_assets').set(child.id, { ...child, mimeType: 123 });
  const before = structuredClone(getStore('asset_owners'));
  await expect(deleteScenarioAggregate(project.id)).rejects.toThrow();
  expect(getStore('scenario_projects').has(project.id)).toBe(true);
  expect(getStore('scenario_assets').has(child.id)).toBe(true);
  expect(getStore('asset_owners')).toEqual(before);
  expect(completePhysicalDeleteOperation).not.toHaveBeenCalled();
});

it.each(['child-delete', 'prune', 'child-replace'] as const)(
  'retains externally used scenario bytes through %s without publishing a card',
  async (operation) => {
    const { createVideoProjectEntryWithMediaClip } = await import('../projects/index.test-support');
    const project = createGuideProject('Scenario resource lifetime');
    const child = { ...createAsset(project.id), galleryAssetId: 'origin' };
    await commitLegacyFrozenChild(project, child);
    const video = createVideoProjectEntryWithMediaClip();
    video.project.assets[0]!.source = { kind: 'scenario-asset', scenarioAssetId: child.id };
    getStore('video_projects').set(video.id, video);
    if (operation === 'prune') await pruneScenarioResources(project.id);
    else
      await commitScenarioAggregateMutation(project, {
        children:
          operation === 'child-delete'
            ? { assetDeletes: [child.id] }
            : {
                assetPuts: [
                  {
                    ...child,
                    assetId: 'replacement',
                    assetRef: {
                      ...child.assetRef,
                      assetId: 'replacement',
                      location: { kind: 'opfs', objectKey: 'objects/replacement' },
                    },
                  },
                ],
              },
      });
    const saved = getStore('video_projects').get(video.id) as typeof video;
    expect(saved.project.assets[0]!.source.kind).toBe('project-asset');
    const source = saved.project.assets[0]!.source;
    if (source.kind !== 'project-asset') throw new Error('Expected retained private source');
    expect(getStore('project_assets').get(source.projectAssetId)).toMatchObject({
      assetId: child.assetId,
    });
    expect(getStore('asset_refs').has(child.assetId)).toBe(true);
    expect(getStore('media_library').size).toBe(0);
  }
);

function retainHtml(projectId: string, mode: 'guide' | 'tour', malformed = false) {
  const entry = {
    id: 'saved-html',
    projectId,
    filename: 'saved.html',
    format: 'html',
    createdAt: 1,
    size: 4,
    html: { mode, assetId: 'html-body' },
  };
  getStore('scenario_exports').set(entry.id, malformed ? { id: entry.id, projectId } : entry);
  getStore('asset_refs').set('html-body', { assetId: 'html-body' });
  getStore('asset_owners').set(JSON.stringify(['scenario-export', entry.id, 'body']), {
    ownerKind: 'scenario-export',
    ownerId: entry.id,
    role: 'body',
    assetId: 'html-body',
  });
  return entry;
}

it.each(['guide', 'tour'] as const)(
  'deletes the complete saved %s root while preserving borrowed library bytes',
  async (mode) => {
    const project = createGuideProject('Saved export owner');
    await commitScenarioAggregateMutation(project, {
      children: {
        assetPuts: [createAsset(project.id)],
        editorDocumentPuts: [createDocument(project.id)],
      },
    });
    const entry = retainHtml(project.id, mode);
    getStore('scenario_exports').set('legacy', { ...entry, id: 'legacy', html: undefined });
    await deleteScenarioAggregate(project.id);
    expect(getStore('scenario_projects').size).toBe(0);
    expect(getStore('scenario_exports').size).toBe(0);
    expect(getStore('scenario_step_editor_documents').size).toBe(0);
    expect(
      getStore('asset_owners').has(JSON.stringify(['scenario-export', entry.id, 'body']))
    ).toBe(false);
    expect(getStore('asset_refs').has('html-body')).toBe(false);
    expect(getStore('media_library').size).toBe(1);
    expect(getStore('asset_refs').has('opfs-asset-1')).toBe(true);
    expect(getStore('asset_operations').get('delete-1')).toMatchObject({
      assetIds: expect.arrayContaining(['html-body']),
    });
    expect(completePhysicalDeleteOperation).toHaveBeenCalled();
  }
);

it('uses confirmed HTML graph ownership even when legacy export metadata is incomplete', async () => {
  const project = createGuideProject('Legacy cleanup');
  await commitScenarioAggregateMutation(project);
  const entry = retainHtml(project.id, 'guide', true);
  await deleteScenarioAggregate(project.id);
  expect(getStore('scenario_exports').has(entry.id)).toBe(false);
  expect(getStore('asset_refs').has('html-body')).toBe(false);
  expect(getStore('scenario_assets').size).toBe(0);
  expect(getStore('scenario_step_editor_documents').size).toBe(0);
  expect(getStore('asset_operations').get('delete-1')).toMatchObject({ assetIds: ['html-body'] });
});

it('keeps a body referenced by another catalogue owner after deleting its source root', async () => {
  const project = createGuideProject('Shared immutable body');
  await commitScenarioAggregateMutation(project);
  retainHtml(project.id, 'tour');
  const sibling = {
    ownerKind: 'scenario-export',
    ownerId: 'other-root-export',
    role: 'body',
    assetId: 'html-body',
  };
  getStore('asset_owners').set(
    JSON.stringify([sibling.ownerKind, sibling.ownerId, sibling.role]),
    sibling
  );
  await deleteScenarioAggregate(project.id);
  expect(getStore('asset_refs').has('html-body')).toBe(true);
  expect(
    getStore('asset_owners').get(JSON.stringify([sibling.ownerKind, sibling.ownerId, sibling.role]))
  ).toEqual(sibling);
  expect(getStore('asset_operations').size).toBe(0);
  expect(completePhysicalDeleteOperation).not.toHaveBeenCalled();
});

it('settles an already missing root without manufacturing a physical delete operation', async () => {
  await deleteScenarioAggregate('already-deleted');
  expect(getStore('asset_operations').size).toBe(0);
  expect(completePhysicalDeleteOperation).not.toHaveBeenCalled();
});

it('releases an orphaned editor document through its confirmed resource graph', async () => {
  const project = createGuideProject('Interrupted root cleanup');
  await commitScenarioAggregateMutation(project, {
    children: { editorDocumentPuts: [createDocument(project.id)] },
  });
  getStore('scenario_projects').delete(project.id);
  await deleteOrphanedScenarioAggregateChild({ kind: 'editor-document', id: 'step-1' });
  expect(getStore('scenario_step_editor_documents').size).toBe(0);
  expect(getStore('asset_refs').size).toBe(0);
  expect(getStore('asset_owners').size).toBe(0);
  expect(getStore('asset_operations').get('delete-1')).toMatchObject({ assetIds: ['editor-1'] });
  expect(completePhysicalDeleteOperation).toHaveBeenCalled();
});

it('rolls back the root and catalogue when retained HTML ownership is malformed', async () => {
  const project = createGuideProject('Rollback retained HTML');
  await commitScenarioAggregateMutation(project);
  const entry = retainHtml(project.id, 'guide');
  getStore('asset_owners').set(JSON.stringify(['scenario-export', entry.id, 'body']), {
    ownerKind: 'scenario-export',
    ownerId: 'foreign-owner',
    role: 'body',
    assetId: 'html-body',
  });
  await expect(deleteScenarioAggregate(project.id)).rejects.toThrow('ownership is invalid');
  expect(getStore('scenario_projects').has(project.id)).toBe(true);
  expect(getStore('scenario_exports').has(entry.id)).toBe(true);
  expect(getStore('asset_refs').has('html-body')).toBe(true);
  expect(getStore('asset_operations').size).toBe(0);
  expect(completePhysicalDeleteOperation).not.toHaveBeenCalled();
});

it('keeps durable deletion authority when physical HTML removal temporarily fails', async () => {
  const project = createGuideProject('Deferred physical cleanup');
  await commitScenarioAggregateMutation(project);
  retainHtml(project.id, 'guide');
  vi.mocked(completePhysicalDeleteOperation).mockRejectedValueOnce(
    new Error('OPFS temporarily busy')
  );
  await expect(deleteScenarioAggregate(project.id)).resolves.toBeUndefined();
  expect(getStore('scenario_projects').size).toBe(0);
  expect(getStore('scenario_exports').size).toBe(0);
  expect(getStore('asset_operations').get('delete-1')).toMatchObject({
    assetIds: ['html-body'],
    status: 'pending',
  });
});

it('retains shared editor resources while cleaning an orphaned document', async () => {
  const project = createGuideProject('Shared editor body');
  await commitScenarioAggregateMutation(project, {
    children: { editorDocumentPuts: [createDocument(project.id)] },
  });
  getStore('scenario_projects').delete(project.id);
  getStore('asset_owners').set(
    JSON.stringify(['scenario-editor-document', 'other-document', 'source']),
    {
      ownerKind: 'scenario-editor-document',
      ownerId: 'other-document',
      role: 'source',
      assetId: 'editor-1',
    }
  );
  await deleteOrphanedScenarioAggregateChild({ kind: 'editor-document', id: 'step-1' });
  expect(getStore('asset_refs').has('editor-1')).toBe(true);
  expect(getStore('asset_owners').size).toBe(1);
  expect(getStore('asset_operations').size).toBe(0);
});

it.each([true, false])(
  'retains a scenario snapshot used by a montage with published origin=%s',
  async (published) => {
    const { createVideoProjectEntryWithMediaClip } = await import('../projects/index.test-support');
    const project = createGuideProject('Scenario snapshot owner');
    const child = { ...createAsset(project.id), galleryAssetId: 'original-image' };
    await commitLegacyFrozenChild(project, child);
    if (published) {
      const { createMediaLibraryEntry } = await import('../projects/index.test-support');
      getStore('media_library').set(
        'original-image',
        createMediaLibraryEntry({ id: 'original-image', source: { kind: 'screenshot' } })
      );
    }
    const video = createVideoProjectEntryWithMediaClip();
    video.project.source = { kind: 'scenario', scenarioProjectId: project.id };
    video.project.assets[0]!.source = { kind: 'scenario-asset', scenarioAssetId: child.id };
    getStore('video_projects').set(video.id, video);
    await deleteScenarioAggregate(project.id);
    const saved = getStore('video_projects').get(video.id) as typeof video;
    expect(saved.project.source).toEqual({ kind: 'manual' });
    expect(saved.project.assets[0]!.source.kind).toBe('project-asset');
    const source = saved.project.assets[0]!.source;
    if (source.kind !== 'project-asset') throw new Error('Expected retained representation');
    expect(getStore('project_assets').get(source.projectAssetId)).toMatchObject({
      assetId: child.assetId,
    });
    expect(getStore('asset_refs').has(child.assetId)).toBe(true);
    expect(getStore('media_library').size).toBe(published ? 1 : 0);
    expect(saved.workspaceRevision).toBe((video.workspaceRevision ?? 0) + 1);
    expect(source.originMediaId).toBe(published ? 'original-image' : undefined);
    expect(getStore('scenario_assets').size).toBe(0);
    expect(getStore('asset_operations').size).toBe(0);
  }
);

it('aborts scenario deletion when a related montage cannot be safely rehomed', async () => {
  const { createVideoProjectEntryWithMediaClip } = await import('../projects/index.test-support');
  const project = createGuideProject('Retain on invalid montage');
  const child = createAsset(project.id);
  await commitLegacyFrozenChild(project, child);
  const video = createVideoProjectEntryWithMediaClip();
  video.project.assets[0]!.source = { kind: 'scenario-asset', scenarioAssetId: child.id };
  getStore('video_projects').set(video.id, {
    ...video,
    project: { ...video.project, name: 123 },
  });
  await expect(deleteScenarioAggregate(project.id)).rejects.toThrow(
    'Related video project is invalid'
  );
  expect(getStore('scenario_projects').has(project.id)).toBe(true);
  expect(getStore('scenario_assets').has(child.id)).toBe(true);
  expect(getStore('project_assets').size).toBe(0);
});

it.each(['missing-bytes', 'invalid-library', 'unknown-video'] as const)(
  'retains the complete scenario graph when external transfer cannot be admitted: %s',
  async (failure) => {
    const { createVideoProjectEntryWithMediaClip } = await import('../projects/index.test-support');
    const project = createGuideProject('Retained scenario');
    const child = { ...createAsset(project.id), galleryAssetId: 'origin' };
    await commitLegacyFrozenChild(project, child);
    const video = createVideoProjectEntryWithMediaClip();
    video.project.assets[0]!.source = { kind: 'scenario-asset', scenarioAssetId: child.id };
    getStore('video_projects').set(
      video.id,
      failure === 'unknown-video' ? { ...video, project: { version: 999 } } : video
    );
    if (failure === 'missing-bytes') getStore('asset_refs').delete(child.assetId);
    if (failure === 'invalid-library') getStore('media_library').set('origin', { id: 'origin' });
    await expect(deleteScenarioAggregate(project.id)).rejects.toThrow();
    expect(getStore('scenario_projects').has(project.id)).toBe(true);
    expect(getStore('scenario_assets').has(child.id)).toBe(true);
    expect(getStore('project_assets').size).toBe(0);
  }
);

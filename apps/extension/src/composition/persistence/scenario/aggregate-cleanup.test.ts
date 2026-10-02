import { expect, it, vi } from 'vitest';
import { getStore, createAsset, createDocument } from './aggregate-mutations.test-support';
import { createGuideProject } from '../../../features/scenario/project/factories';
import { commitScenarioAggregateMutation } from './aggregate-mutations';
import { deleteOrphanedScenarioAggregateChild, deleteScenarioAggregate } from './aggregate-cleanup';
import { completePhysicalDeleteOperation } from '../assets';

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
  getStore('scenario_assets').set('legacy-asset', { id: 'legacy-asset', projectId: project.id });
  getStore('scenario_step_editor_documents').set('legacy-document', {
    stepId: 'legacy-document',
    projectId: project.id,
  });
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

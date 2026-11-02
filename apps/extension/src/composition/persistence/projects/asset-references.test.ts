import { EXPECTED_STORES } from '../infrastructure/indexed-db/core';
import { beforeEach, expect, it } from 'vitest';
import { deleteProjectAssetsUnreferencedByOtherProjects } from './asset-references';
import { buildPhysicalDeleteOperation } from '../assets';
import { createProjectAssetEntry, createVideoProjectEntry } from './index.test-support';
import { rows, harness } from '../media-library/delete-cascade.test-support';

beforeEach(() => {
  rows.clear();
  for (const name of EXPECTED_STORES) rows.set(name, new Map());
});

function table(name: string) {
  const store = rows.get(name);
  if (!store) throw new Error(`Missing fixture store ${name}`);
  return store;
}

it('defers an ordinary save release until mounted Undo readers have drained', async () => {
  table('project_assets').set(
    'private',
    createProjectAssetEntry({ id: 'private', assetId: 'held-bytes' })
  );
  const before = structuredClone(rows);
  const operation = buildPhysicalDeleteOperation([]);
  const db = await harness.db();
  const tx = db.transaction([...rows.keys()], 'readwrite');
  await deleteProjectAssetsUnreferencedByOtherProjects({
    tx,
    operation,
    projectAssetIds: ['private'],
    deferForReaders: true,
  });
  await tx.done;
  expect(rows).toEqual(before);
  expect(operation).toMatchObject({
    assetIds: [],
    privateSources: [{ projectAssetId: 'private', expectedAssetId: 'held-bytes' }],
  });
});

it.each(['unknown-video', 'scenario', 'review'] as const)(
  'retains a private resource used by an external %s consumer',
  async (kind) => {
    table('project_assets').set('private', createProjectAssetEntry({ id: 'private' }));
    if (kind === 'unknown-video')
      table('video_projects').set('unknown', {
        ...createVideoProjectEntry(),
        project: { version: 999 },
      });
    if (kind === 'scenario')
      table('scenario_assets').set('child', {
        id: 'child',
        assetId: 'bytes',
        galleryAssetId: 'project-asset:private',
      });
    if (kind === 'review')
      table('video_workspaces').set('external', { aggregateId: 'external', version: 999 });
    const before = structuredClone(rows);
    const operation = buildPhysicalDeleteOperation([]);
    const db = await harness.db();
    const tx = db.transaction([...rows.keys()], 'readwrite');
    await deleteProjectAssetsUnreferencedByOtherProjects({
      tx,
      operation,
      projectAssetIds: ['private'],
    });
    await tx.done;
    expect(rows).toEqual(before);
    expect(operation.assetIds).toEqual([]);
  }
);

it('retains an independent quick-edit project and its nested auxiliaries after placement removal', async () => {
  const { createQuickEditAdvancedState } =
    await import('../../../features/video/review/advanced/defaults');
  const advanced = createQuickEditAdvancedState();
  advanced.audio.music.push({
    id: 'music',
    assetId: 'project-asset:child',
    timelineStart: 0,
    sourceOffset: 0,
    duration: 1,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
  });
  for (const id of ['parent', 'child'])
    table('project_assets').set(id, createProjectAssetEntry({ id, assetId: `${id}-bytes` }));
  table('video_workspaces').set('project-asset:parent', {
    aggregateId: 'project-asset:parent',
    sourceAssetId: 'parent-bytes',
    source: { duration: 2, width: 100, height: 100, size: 5, mimeType: 'video/webm' },
    formatVersion: 1,
    revision: 1,
    history: [],
    cursor: 0,
    advanced,
    createdAt: 1,
    updatedAt: 1,
  });
  const db = await harness.db();
  const tx = db.transaction([...rows.keys()], 'readwrite');
  await deleteProjectAssetsUnreferencedByOtherProjects({
    tx,
    operation: buildPhysicalDeleteOperation([]),
    projectAssetIds: ['parent'],
  });
  await tx.done;
  expect(table('project_assets').has('parent')).toBe(true);
  expect(table('project_assets').has('child')).toBe(true);
  expect(table('video_workspaces').has('project-asset:parent')).toBe(true);
});

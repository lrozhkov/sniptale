import { createAsset, db, getStore } from './aggregate-mutations.test-support';
import { expect, it, vi } from 'vitest';
import {
  createGuideProject,
  createGuideStep,
  createGuideImageBlock,
} from '../../../features/scenario/project/factories';
import { runWithDurableAssetLifecycleLock } from '../infrastructure/mutation-barrier';

vi.mock('./resource-sessions', () => ({
  tryScenarioResourceCleanup: async (_id: string, operation: () => Promise<unknown>) => operation(),
}));

import {
  commitScenarioAggregateMutation,
  recoverScenarioAssetPublications,
} from './aggregate-mutations';

it('publishes an independent Library identity while reusing an existing physical scenario source', async () => {
  const source = createGuideProject('Source');
  const original = createAsset(source.id, 'original');
  await commitScenarioAggregateMutation(source, { children: { assetPuts: [original] } });
  const destination = createGuideProject('Destination');
  await commitScenarioAggregateMutation(destination, {
    children: {
      assetPuts: [
        {
          ...original,
          id: 'clone',
          projectId: destination.id,
          galleryAssetId: null,
          borrowedMediaId: 'scenario-asset:original',
          independentLibraryIdentity: true,
        },
      ],
    },
  });
  expect(getStore('asset_refs').size).toBe(1);
  expect(getStore('media_library').get('scenario-asset:clone')).toMatchObject({
    source: { kind: 'stored-asset', assetId: original.assetId },
  });
  expect(getStore('scenario_assets').get('clone')).not.toHaveProperty('borrowedMediaId');
  expect(
    getStore('asset_owners').get(
      JSON.stringify(['media-library', 'scenario-asset:clone', 'source'])
    )
  ).toMatchObject({
    assetId: original.assetId,
  });
  getStore('media_library').delete('scenario-asset:original');
  await expect(
    commitScenarioAggregateMutation(destination, {
      children: {
        assetPuts: [
          {
            ...original,
            id: 'rejected-clone',
            projectId: destination.id,
            borrowedMediaId: 'scenario-asset:original',
            independentLibraryIdentity: true,
          },
        ],
      },
    })
  ).rejects.toThrow('Borrowed scenario source is unavailable');
  expect(getStore('media_library').has('scenario-asset:rejected-clone')).toBe(false);
  expect(getStore('asset_refs').has(original.assetId)).toBe(true);
});

it('replays a mixed staged and reused source through the ready journal', async () => {
  const source = createGuideProject('Source');
  const original = createAsset(source.id, 'original');
  await commitScenarioAggregateMutation(source, { children: { assetPuts: [original] } });
  const destination = createGuideProject('Destination');
  const staged = createAsset(destination.id, 'staged');
  await commitScenarioAggregateMutation(destination, {
    children: {
      assetPuts: [
        {
          ...original,
          id: 'clone',
          projectId: destination.id,
          galleryAssetId: null,
          borrowedMediaId: 'scenario-asset:original',
          independentLibraryIdentity: true,
        },
        staged,
      ],
    },
  });
  expect(getStore('media_library').get('scenario-asset:clone')).toMatchObject({
    source: { kind: 'stored-asset', assetId: original.assetId },
  });
  expect(getStore('media_library').get('scenario-asset:staged')).toMatchObject({
    source: { kind: 'stored-asset', assetId: staged.assetId },
  });
  expect(getStore('asset_refs').size).toBe(2);
});

it('aborts a mixed transaction and discards only staged bytes when the shared source disappears', async () => {
  const source = createGuideProject('Source');
  const original = createAsset(source.id, 'original');
  await commitScenarioAggregateMutation(source, { children: { assetPuts: [original] } });
  const destination = createGuideProject('Destination');
  const staged = createAsset(destination.id, 'staged');
  const assets = await import('../assets');
  vi.mocked(assets.publishReadyJournalWithRetry).mockImplementationOnce(
    async (journal, publish) => {
      getStore('media_library').delete('scenario-asset:original');
      await publish(journal);
    }
  );

  await expect(
    commitScenarioAggregateMutation(destination, {
      children: {
        assetPuts: [
          staged,
          {
            ...original,
            id: 'rejected-clone',
            projectId: destination.id,
            galleryAssetId: null,
            borrowedMediaId: 'scenario-asset:original',
            independentLibraryIdentity: true,
          },
        ],
      },
    })
  ).rejects.toThrow('Borrowed scenario source is unavailable');
  expect(db.transaction.mock.results.at(-1)?.value.abort).toHaveBeenCalledOnce();
  expect(getStore('scenario_assets').has(staged.id)).toBe(false);
  expect(getStore('media_library').has(`scenario-asset:${staged.id}`)).toBe(false);
  expect(getStore('asset_refs').has(staged.assetId)).toBe(false);
  expect(assets.cancelAssetPublication).toHaveBeenCalled();
  const cancelled = vi.mocked(assets.cancelAssetPublication).mock.calls[0]![0];
  expect(cancelled.journalId).toBe('journal-1');
  expect(cancelled.assetRefs.map((ref) => ref.assetId)).toEqual([staged.assetId]);
  expect(assets.deleteAssetObject).not.toHaveBeenCalled();
});

it('clears an interrupted mixed journal on startup after its shared source was deleted', async () => {
  const source = createGuideProject('Source');
  const original = createAsset(source.id, 'original');
  await commitScenarioAggregateMutation(source, { children: { assetPuts: [original] } });
  const destination = createGuideProject('Destination');
  const staged = createAsset(destination.id, 'staged');
  const assets = await import('../assets');
  vi.mocked(assets.publishReadyJournalWithRetry).mockRejectedValueOnce(new Error('context closed'));
  await expect(
    commitScenarioAggregateMutation(destination, {
      children: {
        assetPuts: [
          staged,
          {
            ...original,
            id: 'clone',
            projectId: destination.id,
            galleryAssetId: null,
            borrowedMediaId: 'scenario-asset:original',
            independentLibraryIdentity: true,
          },
        ],
      },
    })
  ).rejects.toThrow('context closed');
  const journalArgs = vi.mocked(assets.createAssetPublicationJournal).mock.calls.at(-1)![0];
  const interruptedJournal = { ...journalArgs, createdAt: 1, journalId: 'journal-1' };
  getStore('media_library').delete('scenario-asset:original');
  vi.mocked(assets.recoverStandaloneAssetPublications).mockImplementationOnce(async (adapters) => {
    await runWithDurableAssetLifecycleLock(() => adapters[0]!.publish(interruptedJournal));
    return 1;
  });

  await expect(recoverScenarioAssetPublications()).resolves.toBe(1);
  expect(assets.cancelAssetPublication).toHaveBeenCalled();
  const cancelled = vi.mocked(assets.cancelAssetPublication).mock.calls[0]![0];
  expect(cancelled.journalId).toBe('journal-1');
  expect(cancelled.assetRefs.map((ref) => ref.assetId)).toEqual([staged.assetId]);
  expect(assets.deleteAssetObject).not.toHaveBeenCalled();
  expect(getStore('scenario_assets').has('clone')).toBe(false);
  expect(getStore('asset_refs').has(staged.assetId)).toBe(false);
});

it('keeps a rendered Library import project-private through aggregate publication and replay', async () => {
  const source = createGuideProject('Source');
  await commitScenarioAggregateMutation(source, {
    children: { assetPuts: [createAsset(source.id, 'original')] },
  });
  const project = createGuideProject('Imported');
  const asset = {
    ...createAsset(project.id, 'rendered-import'),
    galleryAssetId: 'scenario-asset:original',
  };
  await commitScenarioAggregateMutation(project, { children: { assetPuts: [asset] } });
  expect([...getStore('media_library').keys()]).toEqual(['scenario-asset:original']);
  expect(getStore('scenario_assets').get(asset.id)).toMatchObject({
    assetId: asset.assetId,
    galleryAssetId: 'scenario-asset:original',
  });
  expect(getStore('asset_refs').has(asset.assetId)).toBe(true);
  expect(
    getStore('asset_owners').get(JSON.stringify(['scenario-asset', asset.id, 'body']))
  ).toMatchObject({ assetId: asset.assetId });
  await recoverScenarioAssetPublications();
  expect([...getStore('media_library').keys()]).toEqual(['scenario-asset:original']);
});

it('aborts the whole import when a frozen Library origin is purged after preparation', async () => {
  const source = createGuideProject('Source');
  const original = createAsset(source.id, 'original');
  await commitScenarioAggregateMutation(source, { children: { assetPuts: [original] } });
  const project = createGuideProject('Destination');
  const staged = createAsset(project.id, 'staged');
  const frozen = {
    ...createAsset(project.id, 'frozen'),
    galleryAssetId: 'scenario-asset:original',
  };
  const assets = await import('../assets');
  vi.mocked(assets.publishReadyJournalWithRetry).mockImplementationOnce(
    async (journal, publish) => {
      getStore('media_library').delete('scenario-asset:original');
      await publish(journal);
    }
  );
  await expect(
    commitScenarioAggregateMutation(project, {
      children: { assetPuts: [staged, frozen] },
    })
  ).rejects.toThrow('Scenario Library source is unavailable');
  expect(getStore('scenario_projects').has(project.id)).toBe(false);
  expect(getStore('scenario_assets').has(staged.id)).toBe(false);
  expect(getStore('scenario_assets').has(frozen.id)).toBe(false);
  expect(getStore('asset_refs').has(frozen.assetId)).toBe(false);
  expect(db.transaction.mock.results.at(-1)?.value.abort).toHaveBeenCalledOnce();
  expect(assets.cancelAssetPublication).toHaveBeenCalled();
});

it('allows unchanged legacy frozen origins but refuses a new missing origin atomically', async () => {
  const source = createGuideProject('Source');
  await commitScenarioAggregateMutation(source, {
    children: { assetPuts: [createAsset(source.id, 'original')] },
  });
  const project = createGuideProject('Destination');
  const frozen = {
    ...createAsset(project.id, 'frozen'),
    galleryAssetId: 'scenario-asset:original',
  };
  await commitScenarioAggregateMutation(project, { children: { assetPuts: [frozen] } });
  getStore('media_library').delete('scenario-asset:original');
  await expect(
    commitScenarioAggregateMutation(project, {
      children: { assetPuts: [{ ...frozen, width: 20 }] },
    })
  ).resolves.toBeDefined();
  await expect(
    commitScenarioAggregateMutation(project, {
      children: { assetPuts: [{ ...frozen, galleryAssetId: 'missing-other' }] },
    })
  ).rejects.toThrow('Scenario Library source is unavailable');
  expect(getStore('scenario_assets').get(frozen.id)).toMatchObject({
    galleryAssetId: frozen.galleryAssetId,
    width: 20,
  });
});

it('cancels an interrupted frozen-origin journal after its Library source disappears', async () => {
  const source = createGuideProject('Source');
  await commitScenarioAggregateMutation(source, {
    children: { assetPuts: [createAsset(source.id, 'original')] },
  });
  const project = createGuideProject('Destination');
  const frozen = {
    ...createAsset(project.id, 'frozen'),
    galleryAssetId: 'scenario-asset:original',
  };
  const assets = await import('../assets');
  vi.mocked(assets.publishReadyJournalWithRetry).mockRejectedValueOnce(new Error('context closed'));
  await expect(
    commitScenarioAggregateMutation(project, { children: { assetPuts: [frozen] } })
  ).rejects.toThrow('context closed');
  const args = vi.mocked(assets.createAssetPublicationJournal).mock.calls.at(-1)![0];
  const journal = { ...args, createdAt: 1, journalId: 'interrupted' };
  getStore('media_library').delete('scenario-asset:original');
  vi.mocked(assets.recoverStandaloneAssetPublications).mockImplementationOnce(async (adapters) => {
    await runWithDurableAssetLifecycleLock((permit) => adapters[0]!.publish(journal, permit));
    return 1;
  });
  await expect(recoverScenarioAssetPublications()).resolves.toBe(1);
  expect(getStore('scenario_assets').has(frozen.id)).toBe(false);
  expect(assets.cancelAssetPublication).toHaveBeenCalledWith(journal, expect.anything());
});

it.each(['borrowed', 'frozen'] as const)(
  'promotes the original Library identity only when a %s scenario insertion commits',
  async (path) => {
    const source = createGuideProject('Source');
    const original = createAsset(source.id, 'original');
    await commitScenarioAggregateMutation(source, { children: { assetPuts: [original] } });
    const mediaId = 'scenario-asset:original';
    const draft = {
      ...(getStore('media_library').get(mediaId) as object),
      lifecycle: { savedAt: null, storageClass: 'temporary', updatedAt: 1 },
    };
    getStore('media_library').set(mediaId, draft);
    const destination = createGuideProject('Destination');
    const inserted =
      path === 'borrowed'
        ? {
            ...original,
            id: 'inserted',
            projectId: destination.id,
            galleryAssetId: mediaId,
            borrowedMediaId: mediaId,
          }
        : { ...createAsset(destination.id, 'inserted'), galleryAssetId: mediaId };
    expect(getStore('media_library').get(mediaId)).toEqual(draft);
    await commitScenarioAggregateMutation(destination, { children: { assetPuts: [inserted] } });
    expect(getStore('media_library').get(mediaId)).toMatchObject({
      lifecycle: { storageClass: 'library' },
    });
  }
);

it('rolls back source promotion if a later scenario child fails validation', async () => {
  const source = createGuideProject('Source');
  const original = createAsset(source.id, 'original');
  await commitScenarioAggregateMutation(source, { children: { assetPuts: [original] } });
  const mediaId = 'scenario-asset:original';
  const draft = {
    ...(getStore('media_library').get(mediaId) as object),
    lifecycle: { savedAt: null, storageClass: 'temporary', updatedAt: 1 },
  };
  getStore('media_library').set(mediaId, draft);
  const destination = createGuideProject('Destination');
  const broken = createAsset(destination.id, 'broken');
  await expect(
    commitScenarioAggregateMutation(destination, {
      children: {
        assetPuts: [
          {
            ...original,
            id: 'inserted',
            projectId: destination.id,
            galleryAssetId: mediaId,
            borrowedMediaId: mediaId,
          },
          { ...broken, galleryAssetId: 'missing-origin' },
        ],
      },
    })
  ).rejects.toThrow('Scenario Library source is unavailable');
  expect(getStore('media_library').get(mediaId)).toEqual(draft);
  expect(getStore('scenario_assets').has('inserted')).toBe(false);
});

it('promotes a retained child when a parent-only edit accepts its use', async () => {
  const project = createGuideProject('Existing');
  const original = createAsset(project.id, 'retained');
  await commitScenarioAggregateMutation(project, { children: { assetPuts: [original] } });
  const mediaId = 'scenario-asset:retained';
  getStore('media_library').set(mediaId, {
    ...(getStore('media_library').get(mediaId) as object),
    lifecycle: { savedAt: null, storageClass: 'temporary', updatedAt: 1 },
  });
  const step = createGuideStep('Accepted');
  step.blocks = [
    createGuideImageBlock({
      id: 'retained-block',
      assetId: original.id,
      width: 10,
      height: 10,
      source: { kind: 'import', filename: 'retained.png' },
    }),
  ];
  await commitScenarioAggregateMutation({ ...project, items: [step] });
  expect(getStore('media_library').get(mediaId)).toMatchObject({
    lifecycle: { storageClass: 'library' },
  });
});

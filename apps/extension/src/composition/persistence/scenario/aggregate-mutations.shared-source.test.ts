import { createAsset, db, getStore } from './aggregate-mutations.test-support';
import { expect, it, vi } from 'vitest';
import { createGuideProject } from '../../../features/scenario/project/factories';
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
  expect(assets.deleteReadyJournal).toHaveBeenCalledWith('journal-1');
  expect(assets.deleteAssetObject).toHaveBeenCalledWith(staged.assetId);
  expect(assets.deleteAssetObject).not.toHaveBeenCalledWith(original.assetId);
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
  expect(assets.deleteReadyJournal).toHaveBeenCalledWith('journal-1');
  expect(assets.deleteAssetObject).toHaveBeenCalledWith(staged.assetId);
  expect(assets.deleteAssetObject).not.toHaveBeenCalledWith(original.assetId);
  expect(getStore('scenario_assets').has('clone')).toBe(false);
  expect(getStore('asset_refs').has(staged.assetId)).toBe(false);
});

it('keeps a rendered Library import project-private through aggregate publication and replay', async () => {
  const project = createGuideProject('Imported');
  const asset = {
    ...createAsset(project.id, 'rendered-import'),
    galleryAssetId: 'library-original',
  };
  await commitScenarioAggregateMutation(project, { children: { assetPuts: [asset] } });
  expect(getStore('media_library').size).toBe(0);
  expect(getStore('scenario_assets').get(asset.id)).toMatchObject({
    assetId: asset.assetId,
    galleryAssetId: 'library-original',
  });
  expect(getStore('asset_refs').has(asset.assetId)).toBe(true);
  expect(
    getStore('asset_owners').get(JSON.stringify(['scenario-asset', asset.id, 'body']))
  ).toMatchObject({ assetId: asset.assetId });
  await recoverScenarioAssetPublications();
  expect(getStore('media_library').size).toBe(0);
});

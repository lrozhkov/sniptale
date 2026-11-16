import { vi } from 'vitest';
import { runWithIndexedDbMutation } from '../../infrastructure/indexed-db/mutation';
import { createProjectMutationStores } from '../../projects/mutation-stores';
import { captureMediaInTransaction } from '../capture';
import type { AssetRef } from '../../assets/contracts';
import type { CapturedChange, SyncCaptureProfile } from '../contracts';
import { readImageWorkspaceIdentity } from '../../image-workspaces/identity';

interface ImageReceiptFixtureContext {
  table(name: string): Map<string, unknown>;
  profile(): SyncCaptureProfile;
  publishCapture(change: CapturedChange): Promise<void>;
}

/** Native Image receipt setup keeps original-resource and journal behavior observable. */
export async function createImageReceiptFixture(
  { table, profile, publishCapture }: ImageReceiptFixtureContext,
  source: 'screenshot' | 'project-asset' = 'screenshot'
) {
  const assets = await import('../../assets');
  const documents = await import('../../document-assets');
  const { createEditorDocumentFixture } =
    await import('../../../../editor/document/page-session/document.test-support');
  const { createPersistedEditorDocumentFixture } =
    await import('../../document-assets/test-support');
  const { saveScreenshotMediaAsset } = await import('../../media-library/index.screenshots');
  const mutations = await import('../../image-aggregates/mutations');
  const original = new Blob(['image-receipt-original'], { type: 'image/png' });
  const { createMediaLibraryEntry, createProjectAssetEntry } =
    await import('../../projects/index.test-support');
  const media =
    source === 'screenshot'
      ? await saveScreenshotMediaAsset({
          id: 'image-native-receipt',
          filename: 'receipt.png',
          blob: original,
          storageClass: 'library',
        })
      : createMediaLibraryEntry({
          id: 'project-asset:imported-image-native-receipt',
          source: { kind: 'project-asset', projectAssetId: 'imported-image-native-receipt' },
          filename: 'imported.png',
          originalFilename: 'imported.png',
          size: original.size,
          width: 100,
          height: 80,
          workspaceRevision: 0,
          lifecycle: { storageClass: 'library', updatedAt: 1, savedAt: 1 },
        });
  const identity = await readImageWorkspaceIdentity(
    {
      objectStore: (name) => ({ get: async (id) => table(name).get(id) }),
    },
    media.id
  );
  const ref: AssetRef = {
    assetId: 'receipt-source',
    createdAt: 1,
    location: { kind: 'opfs', objectKey: 'objects/receipt-source' },
    mimeType: 'image/png',
    size: original.size,
    sha256: null,
  };
  const document = createEditorDocumentFixture();
  table('asset_refs').set(ref.assetId, ref);
  if (media.source.kind === 'project-asset') {
    table('project_assets').set(
      media.source.projectAssetId,
      createProjectAssetEntry({
        id: media.source.projectAssetId,
        assetId: ref.assetId,
        size: ref.size,
        mimeType: ref.mimeType,
      })
    );
    table('asset_owners').set(
      JSON.stringify(['project-asset', media.source.projectAssetId, 'body']),
      {
        assetId: ref.assetId,
        ownerKind: 'project-asset',
        ownerId: media.source.projectAssetId,
        role: 'body',
      }
    );
    table('media_library').set(media.id, media);
    const initial = await runWithIndexedDbMutation(async (db) => {
      const { tx } = createProjectMutationStores(db);
      const captured = await captureMediaInTransaction(tx, media.id, { checkpoint: 'freeze' });
      await tx.done;
      return captured;
    });
    if (initial?.phase !== 'native') throw new Error('Imported source capture is missing');
    await publishCapture(initial);
  }
  table('asset_owners').set(JSON.stringify(['image-workspace', media.id, 'source-image']), {
    assetId: ref.assetId,
    ownerKind: 'image-workspace',
    ownerId: media.id,
    role: 'source-image',
  });
  table('media_library').set(media.id, { ...media, workspaceRevision: 1 });
  table('image_workspaces').set(media.id, {
    aggregateId: media.id,
    document: createPersistedEditorDocumentFixture(document, ref.assetId),
    revision: 1,
    createdAt: media.createdAt,
    updatedAt: media.updatedAt,
    sourceTitle: null,
    sourceUrl: null,
  });
  table('sync_capture').set('profile', { ...profile(), checkpointIntervalMs: 300000 });
  vi.spyOn(documents, 'preparePersistedEditorDocument').mockImplementation(async (input) => ({
    document: createPersistedEditorDocumentFixture(input, ref.assetId),
    refs: [ref],
    objects: [],
    runtimeAssetsByUrl: new Map([['runtime-source', ref]]),
    vectorAssetsByDefinitionId: new Map(),
  }));
  const journal = vi
    .spyOn(assets, 'createAssetPublicationJournal')
    .mockImplementation(async (args) => ({
      assetRefs: args.assetRefs,
      createdAt: 1,
      domain: args.domain,
      journalId: crypto.randomUUID(),
      payload: args.payload,
    }));
  vi.spyOn(assets, 'recoverStandaloneAssetPublications').mockResolvedValue(0);
  vi.spyOn(assets, 'releaseAssetReadyProtection').mockResolvedValue(undefined);
  vi.spyOn(assets, 'publishReadyJournalWithRetry').mockImplementation(async (ready, publish) => {
    await publish(ready);
  });
  const save = (revision: number, padding: number) =>
    mutations.commitImageWorkspace({
      aggregateId: media.id,
      expectedRevision: revision,
      expectedGeneration: identity?.generation ?? null,
      requireExistingRoot: true,
      reusableAssetsByRuntimeUrl: new Map([[document.sourceImageData, ref]]),
      document: { ...document, frame: { ...document.frame, paddingLeft: padding } },
    });
  return { media, original, document, ref, journal, save, mutations };
}

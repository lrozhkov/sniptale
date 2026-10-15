import type { LibrarySceneSource } from './library-scene-source';
import type { AssetReadyJournal } from '../assets/contracts';
import { cancelAssetPublication, publishReadyJournalWithRetry } from '../assets/publication';
import { publishProjectAssetJournal } from './asset-publication';
import type { ProjectAssetPublicationPayload } from './asset-publication-payload';
/** Publication retry/cancellation state for one already-admitted ready claim. */
export function createLibraryBinding(
  journal: AssetReadyJournal<ProjectAssetPublicationPayload>,
  projectAssetId: string
) {
  let published = false;
  let publishing: Promise<void> | null = null;
  return {
    assetId: `project-asset:${projectAssetId}`,
    async publish() {
      if (published) return;
      if (publishing) return publishing;
      publishing = publishReadyJournalWithRetry(journal, publishProjectAssetJournal);
      try {
        await publishing;
        published = true;
      } finally {
        publishing = null;
      }
    },
    async cancel() {
      if (!published) await cancelAssetPublication(journal);
    },
  };
}

export function libraryBindingPayload(source: LibrarySceneSource, projectAssetId: string) {
  const entry = source.entry ?? {
    id: projectAssetId,
    assetId: source.ref.assetId,
    mimeType: source.ref.mimeType,
    size: source.ref.size,
    createdAt: Date.now(),
    originMediaId: source.mediaId,
  };
  return {
    entry,
    filename: source.filename,
    expectedAssetId: source.entry?.assetId ?? null,
    librarySourceId: source.mediaId,
    ...(!source.entry ? { publishToLibrary: false } : {}),
  };
}

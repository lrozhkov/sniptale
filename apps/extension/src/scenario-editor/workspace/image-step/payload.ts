import type { MediaLibraryItem } from '../../../composition/persistence/media-library/contracts';
import type { ScenarioEditorInsertImagePayload } from '../../project/state/types';

export function buildLibraryImagePayload(
  item: MediaLibraryItem,
  blob: Blob
): ScenarioEditorInsertImagePayload {
  return {
    blob,
    filename: item.originalFilename || item.filename,
    galleryAssetId: item.id,
    sourceTitle: item.sourceTitle,
    sourceUrl: item.sourceUrl,
  };
}

export function createFileImagePayload(file: File): ScenarioEditorInsertImagePayload {
  return {
    blob: file,
    filename: file.name,
  };
}

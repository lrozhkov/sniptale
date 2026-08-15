import {
  commitImagePresentation,
  promoteImageAggregate,
} from '../../composition/persistence/image-aggregates';
import { dataUrlToBlob } from '../../platform/media-utils/data-url';
import { createImageThumbnailBlob } from '../../platform/media-utils/image-thumbnail';
import type { EditorDocument } from '../../features/editor/document/types';

interface PromoteEditorImageToLibraryPort {
  flushAutosave: (serialize: () => EditorDocument) => Promise<void>;
  getDurableRevision: () => number | null;
  serializeDocument: () => EditorDocument;
  renderPresentation: () => Promise<string>;
}

export async function promoteEditorImageToLibrary(args: {
  aggregateId: string;
  port: PromoteEditorImageToLibraryPort;
}): Promise<void> {
  await args.port.flushAutosave(args.port.serializeDocument);
  const revision = args.port.getDurableRevision();
  if (revision === null) {
    throw new Error('Image workspace revision is unavailable.');
  }

  const previewBlob = await dataUrlToBlob(await args.port.renderPresentation());
  await commitImagePresentation({
    aggregateId: args.aggregateId,
    expectedWorkspaceRevision: revision,
    previewBlob,
    thumbnailBlob: await createImageThumbnailBlob(previewBlob),
  });
  await promoteImageAggregate(args.aggregateId, revision);
}

import { saveImageAggregateCopyFromDocument } from '../../composition/persistence/image-aggregates';
import { createSecureRandomUuid } from '@sniptale/platform/security/secure-random-id';
import { dataUrlToBlob } from '../../platform/media-utils/data-url';
import { createImageThumbnailBlob } from '../../platform/media-utils/image-thumbnail';
import type { EditorSessionAutosaveService } from '../document/session-autosave';
import { replaceEditorPageAggregateId } from '../document/page-session';
import type { ImageEditorController } from '../controller';
import { useEditorStore } from '../state/useEditorStore';

type StaleImageCopyController = Pick<ImageEditorController, 'exportDocument' | 'renderForExport'>;

export async function saveStaleEditorImageCopy(args: {
  autosaveService: Pick<EditorSessionAutosaveService, 'activate'>;
  controller: StaleImageCopyController;
  isSourceActive: () => boolean;
  pageTitle: string;
  sourceAggregateId: string;
}): Promise<'saved' | 'stale'> {
  const document = args.controller.exportDocument();
  const previewBlob = await dataUrlToBlob(
    await args.controller.renderForExport({ format: 'png', quality: 1 })
  );
  const targetAggregateId = createSecureRandomUuid('Secure random image copy IDs are unavailable.');
  await saveImageAggregateCopyFromDocument({
    document,
    previewBlob,
    sourceTitle: args.pageTitle,
    targetAggregateId,
    thumbnailBlob: await createImageThumbnailBlob(previewBlob),
  });
  if (!args.isSourceActive()) return 'stale';

  replaceEditorPageAggregateId(targetAggregateId);
  args.autosaveService.activate({
    aggregateId: targetAggregateId,
    durableRevision: 1,
    renderPresentation: () => args.controller.renderForExport({ format: 'png', quality: 1 }),
    sourceTitle: args.pageTitle,
    sourceUrl: null,
  });
  useEditorStore.getState().setSaveErrorMessage(null);
  useEditorStore.getState().setSaveState('saved');
  return 'saved';
}

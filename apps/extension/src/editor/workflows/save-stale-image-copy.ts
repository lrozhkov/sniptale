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
  autosaveService: Pick<EditorSessionAutosaveService, 'rebindAggregate' | 'captureSnapshot'>;
  controller: StaleImageCopyController;
  isSourceActive: () => boolean;
  pageTitle: string;
  sourceAggregateId: string;
}): Promise<'saved' | 'stale'> {
  const snapshot = args.autosaveService.captureSnapshot(() => args.controller.exportDocument());
  const document = snapshot.document;
  const previewBlob = await dataUrlToBlob(
    await args.controller.renderForExport({ format: 'png', quality: 1 })
  );
  const targetAggregateId = createSecureRandomUuid('Secure random image copy IDs are unavailable.');
  const copy = await saveImageAggregateCopyFromDocument({
    document,
    ...(snapshot.history ? { history: snapshot.history } : {}),
    previewBlob,
    sourceTitle: args.pageTitle,
    targetAggregateId,
    thumbnailBlob: await createImageThumbnailBlob(previewBlob),
  });
  if (!args.isSourceActive() || !snapshot.isCurrent()) return 'stale';

  replaceEditorPageAggregateId(copy.aggregateId);
  args.autosaveService.rebindAggregate(
    {
      aggregateId: copy.aggregateId,
      durableRevision: copy.revision,
      renderPresentation: (signal) =>
        args.controller.renderForExport(
          { format: 'png', quality: 1, ...(signal ? { signal } : {}) },
          'committed'
        ),
      sourceTitle: args.pageTitle,
      sourceUrl: null,
    },
    copy
  );
  useEditorStore.getState().setSaveErrorMessage(null);
  useEditorStore.getState().setSaveState('saved');
  return 'saved';
}

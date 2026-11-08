import { getMediaLibraryEntry } from '../../composition/persistence/media-library';
import { recoverAndGetImageWorkspace } from '../../composition/persistence/image-workspaces';
import type { ImageEditorController } from '../controller';
import type { EditorSessionAutosaveService } from '../document/session-autosave';
import {
  resolveEditorPageRestoreSource,
  replaceEditorPageImageLocation,
} from '../document/page-session';
import { flushEditorDocumentForExit } from '../document/file-actions/checkpoint-exit';
import {
  captureEditorDocumentOpenOperation,
  isCurrentEditorDocumentOpenOperation,
} from '../document/file-actions/operation';
import { useEditorStore } from '../state/useEditorStore';

type SwitchController = Pick<
  ImageEditorController,
  | 'loadDocument'
  | 'openImage'
  | 'applyDocument'
  | 'exportDocument'
  | 'history'
  | 'originalDocument'
  | 'syncRuntimeState'
  | 'isDocumentReadyForExport'
> & {
  autosaveService: Pick<
    EditorSessionAutosaveService,
    | 'beginHydration'
    | 'flushAutosave'
    | 'prepareCheckpointExit'
    | 'saveNow'
    | 'isEnabled'
    | 'hasUnsavedChanges'
    | 'adoptPreparedDocument'
  > | null;
};
type PreparedSource = Extract<
  Awaited<ReturnType<typeof resolveEditorPageRestoreSource>>,
  { kind: 'draft' | 'asset' }
>;

async function assertEligibleImage(id: string): Promise<void> {
  const entry = await getMediaLibraryEntry(id);
  if (
    !entry ||
    (entry.kind !== 'image' && entry.kind !== 'screenshot') ||
    entry.lifecycle?.trashedAt !== undefined ||
    entry.lifecycle?.storageClass === 'temporary'
  )
    throw new Error('The library image is unavailable.');
}

async function prepareImage(id: string, isCurrent: () => boolean): Promise<PreparedSource> {
  await assertEligibleImage(id);
  const source = await resolveEditorPageRestoreSource(
    { assetId: id, bootstrapId: null },
    id,
    { restoreDraft: recoverAndGetImageWorkspace },
    isCurrent
  );
  if (source.kind !== 'draft' && source.kind !== 'asset')
    throw new Error('The image is unavailable.');
  return source;
}

async function loadPreparedImage(
  controller: SwitchController,
  source: PreparedSource
): Promise<void> {
  if (source.kind === 'draft') {
    await controller.loadDocument(source.entry.document, { preserveInspector: true });
  } else {
    await controller.openImage(source.dataUrl, source.filename, {
      browserFrameUrl: source.sourceUrl,
      preserveInspector: true,
      pageTitle: source.sourceTitle,
      sourceFaviconUrl: source.sourceFaviconUrl,
    });
  }
}

async function applyImageSwitch(args: {
  id: string;
  controller: SwitchController;
  autosave: NonNullable<SwitchController['autosaveService']>;
  source: PreparedSource;
  ownsOperation: () => boolean;
}): Promise<boolean> {
  const { controller, autosave, source, ownsOperation } = args;
  const previous = {
    document: controller.exportDocument(),
    history: controller.history,
    original: controller.originalDocument,
    title: useEditorStore.getState().pageTitle,
    capturedAt: useEditorStore.getState().capturedAt,
  };
  const hydration = autosave.beginHydration(ownsOperation);
  let restoreLocation: (() => void) | undefined;
  try {
    await loadPreparedImage(controller, source);
    if (!ownsOperation()) return false;
    const store = useEditorStore.getState();
    if (source.kind === 'draft' && source.entry.document.displayName === undefined)
      store.setPageTitle(source.entry.sourceTitle ?? '');
    store.setCapturedAt(source.capturedAt);
    restoreLocation = replaceEditorPageImageLocation(args.id);
    // Transfer resource ownership last, after all fallible pre-commit work.
    autosave.adoptPreparedDocument(
      source.kind === 'draft'
        ? source.entry
        : {
            aggregateId: args.id,
            revision: source.nativeRevision,
            sourceTitle: source.sourceTitle,
            sourceUrl: source.sourceUrl,
          }
    );
    hydration.finish(true);
    return true;
  } catch (error) {
    if (ownsOperation()) {
      try {
        await controller.applyDocument(previous.document, {
          resetHistory: false,
          updateOriginal: false,
          preserveViewport: true,
        });
        controller.history = previous.history;
        controller.originalDocument = previous.original;
        useEditorStore.getState().setPageTitle(previous.title);
        useEditorStore.getState().setCapturedAt(previous.capturedAt);
        controller.syncRuntimeState();
        restoreLocation?.();
        hydration.finish(true);
      } catch (restoreError) {
        hydration.finish(false);
        const failure = new AggregateError(
          [error, restoreError],
          'Could not restore the previous image.'
        );
        failure.name = 'EditorSwitchRecoveryError';
        throw failure;
      }
    }
    throw error;
  }
}

/** Saves the outgoing document and replaces its canvas without remounting the editor. */
export async function openRecentEditorImage(args: {
  id: string;
  controller: SwitchController;
  /** Dismissal can cancel preparation; an admitted canvas transaction completes atomically. */
  isActive?: () => boolean;
}): Promise<void> {
  const { controller, id } = args;
  const sourceId = useEditorStore.getState().sessionId;
  if (sourceId === id) return;
  const autosave = controller.autosaveService;
  if (!autosave || !controller.isDocumentReadyForExport())
    throw new Error('The editor is not ready.');
  const token = captureEditorDocumentOpenOperation(controller);
  const ownsOperation = () =>
    isCurrentEditorDocumentOpenOperation(token) && controller.autosaveService === autosave;
  const isCurrent = () =>
    ownsOperation() &&
    useEditorStore.getState().sessionId === sourceId &&
    args.isActive?.() !== false;
  const source = await prepareImage(id, isCurrent);
  let adopted = false;
  try {
    if (!isCurrent()) throw new Error('The active image changed before switching.');
    // This explicit command must save even when background autosave is disabled.
    if (!autosave.isEnabled() && autosave.hasUnsavedChanges())
      await autosave.saveNow(() => controller.exportDocument());
    await flushEditorDocumentForExit(autosave, () => controller.exportDocument());
    await assertEligibleImage(id);
    if (!isCurrent()) throw new Error('The active image changed before switching.');
    adopted = await applyImageSwitch({ id, controller, autosave, source, ownsOperation });
  } finally {
    if (!adopted && source.kind === 'draft') source.entry.releaseDocumentAssets?.();
  }
}

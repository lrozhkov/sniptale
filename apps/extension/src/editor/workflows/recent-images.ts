import {
  getMediaAssetBlob,
  getMediaLibraryEntry,
  listMediaLibrary,
} from '../../composition/persistence/media-library';
import { getAggregatePresentation } from '../../composition/persistence/aggregate-presentations';
import { buildEditorUrl } from '../../platform/navigation/extension-pages/editor';
import { ensureNativeEditingRootAvailable } from '../../workflows/sync-transfer/editing-admission';
import type { EditorDocument } from '../../features/editor/document/types';
import type { EditorSessionAutosaveService } from '../document/session-autosave';
import { useEditorStore } from '../state/useEditorStore';
import { flushEditorDocumentForExit } from '../document/file-actions/checkpoint-exit';
import {
  captureEditorDocumentOpenOperation,
  isCurrentEditorDocumentOpenOperation,
} from '../document/file-actions/operation';

/** Lists reusable image metadata for the start page and transient recent chooser. */
export async function listRecentEditorImages() {
  const images = await listMediaLibrary();
  return images
    .filter(
      (item) =>
        (item.kind === 'image' || item.kind === 'screenshot') &&
        item.lifecycle?.trashedAt === undefined &&
        item.lifecycle?.storageClass !== 'temporary'
    )
    .map((item) => ({
      id: item.id,
      title: item.filename,
      detail: [item.width, item.height].every((value) => typeof value === 'number')
        ? `${item.width} × ${item.height}`
        : '',
      updatedAt: item.updatedAt,
      thumbnailId: item.id,
    }));
}

/** Reads only a presentation that matches the current accepted workspace revision. */
export async function readRecentEditorThumbnail(id: string): Promise<Blob | undefined> {
  const entry = await getMediaLibraryEntry(id);
  if (!entry || entry.lifecycle?.trashedAt !== undefined) return undefined;
  const revision = entry.workspaceRevision ?? 0;
  const presentation = await getAggregatePresentation({ kind: 'image', id });
  const blob =
    presentation?.presentationRevision === revision
      ? (presentation.previewBlob ?? presentation.thumbnailBlob)
      : revision === 0
        ? await getMediaAssetBlob(id)
        : undefined;
  const latest = await getMediaLibraryEntry(id);
  return latest &&
    latest.lifecycle?.trashedAt === undefined &&
    (latest.workspaceRevision ?? 0) === revision
    ? blob
    : undefined;
}

/** Keep the mounted editor and its writer intact until canonical same-tab navigation. */
export async function openRecentEditorImage(args: {
  id: string;
  controller: {
    autosaveService: Pick<
      EditorSessionAutosaveService,
      'flushAutosave' | 'prepareCheckpointExit'
    > | null;
    exportDocument(): EditorDocument;
    isDocumentReadyForExport(): boolean;
  };
  navigate?: (url: string) => void;
  /** Refuse a handoff after its chooser has been dismissed. */
  isActive?: () => boolean;
}): Promise<void> {
  const sourceId = useEditorStore.getState().sessionId;
  if (sourceId === args.id) return;
  const autosave = args.controller.autosaveService;
  const token = captureEditorDocumentOpenOperation(args.controller);
  const isCurrent = () =>
    args.isActive?.() !== false &&
    isCurrentEditorDocumentOpenOperation(token) &&
    args.controller.autosaveService === autosave &&
    useEditorStore.getState().sessionId === sourceId;
  const available = async () => {
    const entry = await getMediaLibraryEntry(args.id);
    if (
      !entry ||
      (entry.kind !== 'image' && entry.kind !== 'screenshot') ||
      entry.lifecycle?.trashedAt !== undefined ||
      entry.lifecycle?.storageClass === 'temporary'
    )
      throw new Error('The library image is unavailable.');
  };
  await available();
  await ensureNativeEditingRootAvailable({ rootKind: 'media', rootId: args.id });
  if (!isCurrent()) throw new Error('The active image changed before switching.');
  if (!(await getMediaAssetBlob(args.id))) throw new Error('The original image is unavailable.');
  if (args.controller.isDocumentReadyForExport()) {
    if (!autosave) throw new Error('Image autosave is unavailable.');
    await flushEditorDocumentForExit(autosave, () => args.controller.exportDocument());
  }
  await available();
  if (!isCurrent()) throw new Error('The active image changed before switching.');
  // Disabled autosave keeps the existing beforeunload Save/Leave protection.
  (args.navigate ?? ((url) => window.location.assign(url)))(buildEditorUrl({ assetId: args.id }));
}

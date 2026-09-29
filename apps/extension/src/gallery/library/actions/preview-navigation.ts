import type { GalleryItem } from '../items';
import type { GalleryPreviewController } from './controller-types';
import { persistPreviewMetadata, type PreviewMetadataSnapshot } from './preview';
import type { GalleryBusyAction } from './shared';

type PreviewState = GalleryPreviewController['state'];
type PreviewDraft = PreviewState['preview']['draft'];

export interface PreviewNavigationCoordinator {
  revision: number;
  pendingSave: { draftKey: string; promise: Promise<boolean>; sourceId: string } | null;
  lastPersisted: {
    filename: string;
    sourceId: string;
    sourceItem: GalleryItem;
    tags: string[];
  } | null;
  refreshDue: boolean;
}

export function createPreviewNavigationCoordinator(): PreviewNavigationCoordinator {
  return { revision: 0, pendingSave: null, lastPersisted: null, refreshDue: false };
}

export function previewDraftKey(draft: PreviewDraft): string {
  return JSON.stringify([draft.filename, draft.tags]);
}

function isSameDraft(left: PreviewDraft, right: PreviewDraft): boolean {
  return previewDraftKey(left) === previewDraftKey(right);
}

function metadataValues(item: GalleryItem, draft: PreviewDraft) {
  return { filename: draft.filename.trim() || item.filename, tags: draft.tags };
}

function getPersistedBaseline(
  coordinator: PreviewNavigationCoordinator,
  source: GalleryItem
): PreviewMetadataSnapshot['baseline'] {
  const last = coordinator.lastPersisted;
  if (last?.sourceId === source.id) {
    const sourceChanged = last.sourceItem !== source;
    const metadataChanged =
      last.filename !== source.filename ||
      last.tags.length !== source.tags.length ||
      last.tags.some((tag, index) => tag !== source.tags[index]);
    if (!sourceChanged || !metadataChanged) return last;
  }
  return { filename: source.filename, tags: source.tags };
}

function needsPreviewNavigationSave(
  coordinator: PreviewNavigationCoordinator,
  source: GalleryItem,
  draft: PreviewDraft
): boolean {
  const persisted = getPersistedBaseline(coordinator, source);
  const current = metadataValues(source, draft);
  return (
    draft.hasChanges ||
    current.filename !== persisted.filename ||
    current.tags.length !== persisted.tags.length ||
    current.tags.some((tag, index) => tag !== persisted.tags[index])
  );
}

function startPreviewSave(
  controller: GalleryPreviewController,
  coordinator: PreviewNavigationCoordinator,
  source: GalleryItem,
  draft: PreviewDraft
) {
  const baseline = getPersistedBaseline(coordinator, source);
  const values = metadataValues(source, draft);
  const pending = {
    draftKey: previewDraftKey(draft),
    sourceId: source.id,
    promise: Promise.resolve(false),
  };
  pending.promise = persistPreviewMetadata(controller, { item: source, draft, baseline })
    .then((changed) => {
      coordinator.lastPersisted = { ...values, sourceId: source.id, sourceItem: source };
      if (changed) coordinator.refreshDue = true;
      return changed;
    })
    .finally(() => {
      if (coordinator.pendingSave === pending) coordinator.pendingSave = null;
    });
  coordinator.pendingSave = pending;
  return pending;
}

export async function savePreviewDraftAfterPending(
  controller: GalleryPreviewController,
  coordinator: PreviewNavigationCoordinator,
  source: GalleryItem,
  draft: PreviewDraft,
  canContinue: () => boolean
): Promise<boolean | null> {
  const key = previewDraftKey(draft);
  const pending = coordinator.pendingSave;
  if (pending) {
    if (pending.sourceId === source.id && pending.draftKey === key) {
      return pending.promise;
    }
    try {
      await pending.promise;
    } catch {
      // A newer draft can still be saved after an older write fails.
    }
    if (!canContinue()) return null;
  }
  if (!needsPreviewNavigationSave(coordinator, source, draft)) return false;
  return startPreviewSave(controller, coordinator, source, draft).promise;
}

export function createNavigatePreviewAction(
  controller: GalleryPreviewController,
  coordinator = createPreviewNavigationCoordinator(),
  readState: () => PreviewState = () => controller.state
) {
  return async (target: GalleryItem, withBusy: GalleryBusyAction) => {
    const source = controller.state.preview.session.item;
    if (!source || source.id === target.id) return;
    const draft = controller.state.preview.draft;
    const requestRevision = ++coordinator.revision;
    const commitTarget = () =>
      controller.actions.preview.setPreview((current) =>
        coordinator.revision === requestRevision && current.item?.id === source.id
          ? { inspectorCollapsed: current.inspectorCollapsed, item: target, url: null }
          : current
      );

    if (!coordinator.pendingSave && !needsPreviewNavigationSave(coordinator, source, draft)) {
      commitTarget();
      if (coordinator.refreshDue) {
        await controller.actions.storage.refresh();
        coordinator.refreshDue = false;
      }
      return;
    }

    await withBusy(async () => {
      const changed = await savePreviewDraftAfterPending(
        controller,
        coordinator,
        source,
        draft,
        () =>
          coordinator.revision === requestRevision &&
          readState().preview.session.item?.id === source.id &&
          isSameDraft(readState().preview.draft, draft)
      );
      if (changed === null) return;

      const current = readState().preview;
      if (
        coordinator.revision !== requestRevision ||
        current.session.item?.id !== source.id ||
        !isSameDraft(current.draft, draft)
      ) {
        return;
      }
      commitTarget();
      if (coordinator.refreshDue) {
        await controller.actions.storage.refresh();
        coordinator.refreshDue = false;
      }
    });
  };
}

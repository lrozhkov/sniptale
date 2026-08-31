import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { getMediaAssetBlob } from '../../../composition/persistence/media-library/index.library.ts';
import { getWebSnapshotScreenshotFile } from '../../../composition/persistence/web-snapshots';
import { isGalleryMediaItem } from '../items';
import type { GalleryPreviewSessionState } from '../types';
import { getAggregatePreviewBlob } from '../../../composition/persistence/aggregate-presentations';
import { validateWebSnapshotScreenshotBlob } from '../../../features/web-snapshot/screenshot-validation';

const EMPTY_PREVIEW_STATE: GalleryPreviewSessionState = {
  inspectorCollapsed: false,
  item: null,
  url: null,
};

type GalleryPreviewDraftStateSetters = {
  setFilenameDraft: (value: string) => void;
  setInitialFilename: (value: string) => void;
  setInitialTagDrafts: (value: string[]) => void;
  setTagDraft: (value: string) => void;
  setTagDrafts: (value: string[]) => void;
};

function syncDraftState(
  values: {
    filename: string;
    tags: string[];
  },
  args: GalleryPreviewDraftStateSetters
) {
  args.setFilenameDraft(values.filename);
  args.setInitialFilename(values.filename);
  args.setTagDraft('');
  args.setTagDrafts(values.tags);
  args.setInitialTagDrafts(values.tags);
}

function resetDraftState(args: GalleryPreviewDraftStateSetters) {
  syncDraftState({ filename: '', tags: [] }, args);
}

function normalizePreviewSelectionChange(
  current: GalleryPreviewSessionState,
  next: GalleryPreviewSessionState
): GalleryPreviewSessionState {
  const nextWithRememberedInspector = next.item
    ? next
    : { ...next, inspectorCollapsed: current.inspectorCollapsed };
  const currentItemId = current.item?.id ?? null;
  const nextItemId = nextWithRememberedInspector.item?.id ?? null;

  if (
    currentItemId !== nextItemId ||
    !nextWithRememberedInspector.item ||
    !isGalleryMediaItem(nextWithRememberedInspector.item)
  ) {
    return nextWithRememberedInspector.url === null
      ? nextWithRememberedInspector
      : { ...nextWithRememberedInspector, url: null };
  }

  return nextWithRememberedInspector;
}

async function loadPreviewBlob(
  previewItem: NonNullable<GalleryPreviewSessionState['item']>
): Promise<Blob | null> {
  if (!isGalleryMediaItem(previewItem)) {
    return null;
  }

  const assetId = previewItem.entityId ?? previewItem.id;
  if (previewItem.kind === 'image' || previewItem.kind === 'screenshot') {
    return (await getAggregatePreviewBlob({ id: assetId, kind: 'image' })) ?? null;
  }
  if (previewItem.kind === 'web-archive') {
    const screenshot = (await getWebSnapshotScreenshotFile(assetId)) ?? null;
    if (screenshot) {
      await validateWebSnapshotScreenshotBlob(screenshot);
    }
    return screenshot;
  }

  return (await getMediaAssetBlob(assetId)) ?? null;
}

function applyPreviewItemDraftState(
  previewItem: NonNullable<GalleryPreviewSessionState['item']>,
  args: GalleryPreviewDraftStateSetters
) {
  syncDraftState(
    {
      filename: previewItem.filename,
      tags: previewItem.tags,
    },
    args
  );
}

function syncPreviewUrl(
  previewItem: GalleryPreviewSessionState['item'],
  setPreview: Dispatch<SetStateAction<GalleryPreviewSessionState>>
) {
  let active = true;
  let objectUrl: string | null = null;

  if (!previewItem || !isGalleryMediaItem(previewItem)) {
    setPreview((current) => (current.url === null ? current : { ...current, url: null }));
    return () => undefined;
  }

  void loadPreviewBlob(previewItem)
    .then((blob) => {
      if (!blob || !active) {
        return;
      }

      objectUrl = URL.createObjectURL(blob);
      setPreview((current) => ({ ...current, url: objectUrl }));
    })
    .catch(() => {
      if (active) {
        setPreview((current) => ({ ...current, url: null }));
      }
    });

  return () => {
    active = false;
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  };
}

function haveTagDraftsChanged(initialTagDrafts: string[], tagDrafts: string[]) {
  return (
    initialTagDrafts.length !== tagDrafts.length ||
    initialTagDrafts.some((tag, index) => tag !== tagDrafts[index])
  );
}

function usePreviewItemSync(
  previewItem: GalleryPreviewSessionState['item'],
  setPreview: Dispatch<SetStateAction<GalleryPreviewSessionState>>,
  draftSetters: GalleryPreviewDraftStateSetters
) {
  useEffect(() => {
    if (!previewItem) {
      resetDraftState(draftSetters);
      setPreview((current) => (current.url === null ? current : { ...current, url: null }));
      return undefined;
    }

    applyPreviewItemDraftState(previewItem, draftSetters);
    return syncPreviewUrl(previewItem, setPreview);
  }, [draftSetters, previewItem, setPreview]);
}

function buildPreviewStateResult(args: {
  filenameDraft: string;
  hasChanges: boolean;
  initialFilename: string;
  initialTagDrafts: string[];
  preview: GalleryPreviewSessionState;
  tagDraft: string;
  tagDrafts: string[];
}) {
  return {
    draft: {
      filename: args.filenameDraft,
      hasChanges: args.hasChanges,
      initialFilename: args.initialFilename,
      initialTagDrafts: args.initialTagDrafts,
      tagInput: args.tagDraft,
      tags: args.tagDrafts,
    },
    session: args.preview,
  };
}

export function useGalleryPreviewState() {
  const [preview, setPreviewState] = useState<GalleryPreviewSessionState>(EMPTY_PREVIEW_STATE);
  const [filenameDraft, setFilenameDraft] = useState('');
  const [initialFilename, setInitialFilename] = useState('');
  const [tagDraft, setTagDraft] = useState('');
  const [tagDrafts, setTagDrafts] = useState<string[]>([]);
  const [initialTagDrafts, setInitialTagDrafts] = useState<string[]>([]);
  const previewItem = preview.item;
  const draftSetters = useMemo<GalleryPreviewDraftStateSetters>(
    () => ({
      setFilenameDraft,
      setInitialFilename,
      setInitialTagDrafts,
      setTagDraft,
      setTagDrafts,
    }),
    []
  );

  const setPreview: Dispatch<SetStateAction<GalleryPreviewSessionState>> = useCallback((value) => {
    setPreviewState((current) => {
      const next = typeof value === 'function' ? value(current) : value;
      return normalizePreviewSelectionChange(current, next);
    });
  }, []);

  usePreviewItemSync(previewItem, setPreview, draftSetters);

  const hasChanges =
    previewItem !== null &&
    (filenameDraft.trim() !== initialFilename || haveTagDraftsChanged(initialTagDrafts, tagDrafts));

  return {
    actions: {
      setFilenameDraft,
      setPreview,
      setTagDraft,
      setTagDrafts,
    },
    state: buildPreviewStateResult({
      filenameDraft,
      hasChanges,
      initialFilename,
      initialTagDrafts,
      preview,
      tagDraft,
      tagDrafts,
    }),
  };
}

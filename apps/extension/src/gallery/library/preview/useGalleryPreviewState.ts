import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { getMediaAssetBlob } from '../../../composition/persistence/media-library/index.library.ts';
import { getWebSnapshotScreenshotFile } from '../../../composition/persistence/web-snapshots';
import { isGalleryMediaItem } from '../items';
import { createPreviewResources } from './resources';
import type { GalleryPreviewPresentation, GalleryPreviewSessionState } from '../types';
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
  if (current === next) return current;
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
    return {
      ...nextWithRememberedInspector,
      requestRevision:
        currentItemId !== nextItemId ? (current.requestRevision ?? 0) + 1 : current.requestRevision,
      url: null,
      loadStatus:
        nextWithRememberedInspector.item && isGalleryMediaItem(nextWithRememberedInspector.item)
          ? 'loading'
          : undefined,
    };
  }

  if (current.item !== nextWithRememberedInspector.item) {
    return {
      ...nextWithRememberedInspector,
      requestRevision: (current.requestRevision ?? 0) + 1,
      url: null,
      loadStatus: 'loading',
    };
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
  if (previewItem.source.kind === 'screenshot') {
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

function haveTagDraftsChanged(initialTagDrafts: string[], tagDrafts: string[]) {
  return (
    initialTagDrafts.length !== tagDrafts.length ||
    initialTagDrafts.some((tag, index) => tag !== tagDrafts[index])
  );
}

function usePreviewItemSync(
  previewItem: GalleryPreviewSessionState['item'],
  setPreview: Dispatch<SetStateAction<GalleryPreviewSessionState>>,
  draftSetters: GalleryPreviewDraftStateSetters,
  touched: MutableRefObject<{ filename: boolean; tags: boolean }>,
  draft: {
    filename: string;
    initialFilename: string;
    initialTags: string[];
    tags: string[];
  }
) {
  const previousItemId = useRef<string | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  useEffect(() => {
    if (!previewItem) {
      previousItemId.current = null;
      touched.current = { filename: false, tags: false };
      resetDraftState(draftSetters);
      setPreview((current) =>
        current.url === null && current.loadStatus === undefined
          ? current
          : { ...current, url: null, loadStatus: undefined }
      );
      return undefined;
    }

    if (previousItemId.current === previewItem.id) {
      const currentDraft = draftRef.current;
      draftSetters.setFilenameDraft(
        !touched.current.filename && currentDraft.filename.trim() === currentDraft.initialFilename
          ? previewItem.filename
          : currentDraft.filename
      );
      draftSetters.setTagDrafts(
        touched.current.tags || haveTagDraftsChanged(currentDraft.initialTags, currentDraft.tags)
          ? currentDraft.tags
          : previewItem.tags
      );
      draftSetters.setInitialFilename(previewItem.filename);
      draftSetters.setInitialTagDrafts(previewItem.tags);
      if (currentDraft.filename.trim() === previewItem.filename) touched.current.filename = false;
      if (!haveTagDraftsChanged(previewItem.tags, currentDraft.tags)) touched.current.tags = false;
    } else {
      touched.current = { filename: false, tags: false };
      applyPreviewItemDraftState(previewItem, draftSetters);
    }
    previousItemId.current = previewItem.id;
    return undefined;
  }, [draftSetters, previewItem, setPreview, touched]);
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
  const touched = useRef({ filename: false, tags: false });
  const previewItem = preview.item;
  const resources = useMemo(() => createPreviewResources((url) => URL.revokeObjectURL(url)), []);
  const requestRevision = preview.requestRevision ?? 0;
  useEffect(() => () => resources.dispose(), [resources]);
  useEffect(() => {
    resources.begin(requestRevision);
    if (!previewItem || !isGalleryMediaItem(previewItem)) {
      resources.dispose();
      return;
    }
    let active = true;
    const publish = (url: string | null, loadStatus: GalleryPreviewSessionState['loadStatus']) => {
      if (!active) return;
      setPreviewState((current) =>
        current.requestRevision === requestRevision ? { ...current, url, loadStatus } : current
      );
    };
    void loadPreviewBlob(previewItem)
      .then((blob) => {
        if (!active) return;
        if (!blob) {
          publish(null, 'missing');
          return;
        }
        const url = URL.createObjectURL(blob);
        if (resources.offer(requestRevision, url)) publish(url, 'ready');
      })
      .catch(() => publish(null, 'error'));
    return () => {
      active = false;
    };
  }, [previewItem, requestRevision, resources]);
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

  usePreviewItemSync(previewItem, setPreview, draftSetters, touched, {
    filename: filenameDraft,
    initialFilename,
    initialTags: initialTagDrafts,
    tags: tagDrafts,
  });

  const hasChanges =
    previewItem !== null &&
    (filenameDraft.trim() !== initialFilename || haveTagDraftsChanged(initialTagDrafts, tagDrafts));

  return {
    actions: {
      acknowledgePresented: (presentation: GalleryPreviewPresentation) =>
        resources.acknowledge(presentation),
      setFilenameDraft: (value: SetStateAction<string>) => {
        touched.current.filename = true;
        setFilenameDraft(value);
      },
      setPreview,
      setTagDraft,
      setTagDrafts: (value: SetStateAction<string[]>) => {
        touched.current.tags = true;
        setTagDrafts(value);
      },
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

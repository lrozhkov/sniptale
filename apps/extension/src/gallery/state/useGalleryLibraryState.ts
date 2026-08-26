import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeToMediaHubEvents } from '../../features/media-hub/events';
import type { StorageEstimateInfo } from '../../features/media-hub/storage-capacity';
import { translate } from '../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { GalleryItem } from '../library/items';
import { loadGalleryLibrarySnapshot } from './use-gallery-library-snapshot';

interface UseGalleryLibraryStateOptions {
  onBanner: (message: string) => void;
  onRefresh?: () => void;
  onPreviewItemRefresh: (items: GalleryItem[]) => void;
  onSelectionRefresh: (items: GalleryItem[]) => void;
}

type GalleryRefreshActionArgs = {
  itemsRef: React.MutableRefObject<GalleryItem[]>;
  onBanner: (message: string) => void;
  onPreviewItemRefresh: (items: GalleryItem[]) => void;
  onRefresh?: (() => void) | undefined;
  onSelectionRefresh: (items: GalleryItem[]) => void;
  refreshEpochRef: React.MutableRefObject<number>;
  setIsLoading: (isLoading: boolean) => void;
  setItems: (items: GalleryItem[]) => void;
  setStorageInfo: (value: StorageEstimateInfo | null) => void;
  storageInfoRef: React.MutableRefObject<StorageEstimateInfo | null>;
};

const logger = createLogger({ namespace: 'GalleryLibraryState' });

function createMediaHubEventHandler(
  onBanner: (message: string) => void,
  refresh: () => Promise<void>
) {
  return (
    event: Parameters<typeof subscribeToMediaHubEvents>[0] extends (event: infer T) => void
      ? T
      : never
  ) => {
    if (event.type === 'library-changed') {
      void refresh();
      return;
    }

    onBanner(event.message);
    void refresh();
  };
}

function applyGalleryRefreshResult(props: {
  estimate: StorageEstimateInfo;
  itemsRef: React.MutableRefObject<GalleryItem[]>;
  nextItems: GalleryItem[];
  onPreviewItemRefresh: (items: GalleryItem[]) => void;
  onSelectionRefresh: (items: GalleryItem[]) => void;
  setItems: (items: GalleryItem[]) => void;
  setStorageInfo: (value: StorageEstimateInfo | null) => void;
  storageInfoRef: React.MutableRefObject<StorageEstimateInfo | null>;
}) {
  const resolvedItems = resolveStableGalleryItems(props.itemsRef.current, props.nextItems);
  const itemsChanged = resolvedItems !== props.itemsRef.current;

  if (itemsChanged) {
    props.itemsRef.current = resolvedItems;
    props.setItems(resolvedItems);
    props.onSelectionRefresh(resolvedItems);
    props.onPreviewItemRefresh(resolvedItems);
  }

  if (!isStorageEstimateEqual(props.storageInfoRef.current, props.estimate)) {
    props.storageInfoRef.current = props.estimate;
    props.setStorageInfo(props.estimate);
  }
}

function isStorageEstimateEqual(
  left: StorageEstimateInfo | null,
  right: StorageEstimateInfo
): boolean {
  return (
    left !== null &&
    left.isPersistent === right.isPersistent &&
    left.pressure === right.pressure &&
    left.remaining === right.remaining &&
    left.usage === right.usage &&
    left.usageRatio === right.usageRatio &&
    left.quota === right.quota
  );
}

function resolveStableGalleryItems(
  currentItems: GalleryItem[],
  nextItems: GalleryItem[]
): GalleryItem[] {
  return areGalleryItemsEquivalent(currentItems, nextItems) ? currentItems : nextItems;
}

function areGalleryItemsEquivalent(left: GalleryItem[], right: GalleryItem[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((item, index) => JSON.stringify(item) === JSON.stringify(right[index]));
}

function useGalleryLibrarySubscriptions({
  onBanner,
  refresh,
}: {
  onBanner: (message: string) => void;
  refresh: () => Promise<void>;
}) {
  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(
    () => subscribeToMediaHubEvents(createMediaHubEventHandler(onBanner, refresh)),
    [onBanner, refresh]
  );
}

function beginGalleryRefreshEpoch(args: Pick<GalleryRefreshActionArgs, 'refreshEpochRef'>) {
  const refreshEpoch = args.refreshEpochRef.current + 1;
  args.refreshEpochRef.current = refreshEpoch;
  return refreshEpoch;
}

function isCurrentGalleryRefreshEpoch(args: {
  refreshEpoch: number;
  refreshEpochRef: React.MutableRefObject<number>;
}) {
  return args.refreshEpochRef.current === args.refreshEpoch;
}

async function runGalleryRefresh(args: GalleryRefreshActionArgs) {
  const refreshEpoch = beginGalleryRefreshEpoch(args);
  if (args.itemsRef.current.length === 0) {
    args.setIsLoading(true);
  }
  try {
    const { estimate, nextItems } = await loadGalleryLibrarySnapshot();
    if (!isCurrentGalleryRefreshEpoch({ refreshEpoch, refreshEpochRef: args.refreshEpochRef })) {
      return;
    }

    applyGalleryRefreshResult({
      estimate,
      itemsRef: args.itemsRef,
      nextItems,
      onPreviewItemRefresh: args.onPreviewItemRefresh,
      onSelectionRefresh: args.onSelectionRefresh,
      setItems: args.setItems,
      setStorageInfo: args.setStorageInfo,
      storageInfoRef: args.storageInfoRef,
    });
    args.onRefresh?.();
  } catch (error) {
    if (!isCurrentGalleryRefreshEpoch({ refreshEpoch, refreshEpochRef: args.refreshEpochRef })) {
      return;
    }
    logger.error('Failed to refresh gallery library state', error);
    args.onBanner(translate('common.states.error'));
  } finally {
    if (isCurrentGalleryRefreshEpoch({ refreshEpoch, refreshEpochRef: args.refreshEpochRef })) {
      args.setIsLoading(false);
    }
  }
}

function useGalleryRefreshAction(args: GalleryRefreshActionArgs) {
  const {
    onBanner,
    itemsRef,
    onPreviewItemRefresh,
    onRefresh,
    onSelectionRefresh,
    refreshEpochRef,
    setIsLoading,
    setItems,
    setStorageInfo,
    storageInfoRef,
  } = args;

  return useCallback(
    () =>
      runGalleryRefresh({
        onBanner,
        itemsRef,
        onPreviewItemRefresh,
        onRefresh,
        onSelectionRefresh,
        refreshEpochRef,
        setIsLoading,
        setItems,
        setStorageInfo,
        storageInfoRef,
      }),
    [
      onBanner,
      itemsRef,
      onPreviewItemRefresh,
      onRefresh,
      onSelectionRefresh,
      refreshEpochRef,
      setIsLoading,
      setItems,
      setStorageInfo,
      storageInfoRef,
    ]
  );
}

export function useGalleryLibraryState({
  onBanner,
  onRefresh,
  onPreviewItemRefresh,
  onSelectionRefresh,
}: UseGalleryLibraryStateOptions) {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [storageInfo, setStorageInfo] = useState<StorageEstimateInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const itemsRef = useRef<GalleryItem[]>([]);
  const refreshEpochRef = useRef(0);
  const storageInfoRef = useRef<StorageEstimateInfo | null>(null);
  const refresh = useGalleryRefreshAction({
    itemsRef,
    onBanner,
    onPreviewItemRefresh,
    onRefresh,
    onSelectionRefresh,
    refreshEpochRef,
    setIsLoading,
    setItems,
    setStorageInfo,
    storageInfoRef,
  });

  useGalleryLibrarySubscriptions({ onBanner, refresh });

  return {
    isLoading,
    items,
    refresh,
    storageInfo,
  };
}

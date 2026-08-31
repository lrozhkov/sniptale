import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeToMediaHubEvents } from '../../features/media-hub/events';
import type { StorageEstimateInfo } from '../../features/media-hub/storage-capacity';
import { translate } from '../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  isGalleryMediaItem,
  isGalleryScenarioExportItem,
  isGalleryScenarioItem,
  isGalleryVideoProjectItem,
  type GalleryItem,
  type GalleryMediaItem,
} from '../library/items';
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

  return left.every((item, index) => areGalleryItemsUiEquivalent(item, right[index]));
}

function areStringArraysEqual(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined
) {
  if (left === right) return true;
  if (!left || !right || left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function areLifecyclesEqual(left: GalleryItem['lifecycle'], right: GalleryItem['lifecycle']) {
  return (
    left === right ||
    (left !== undefined &&
      right !== undefined &&
      left.savedAt === right.savedAt &&
      left.storageClass === right.storageClass &&
      left.updatedAt === right.updatedAt)
  );
}

function areRecordingGroupMembersEqual(
  left: GalleryMediaItem['recordingGroup'],
  right: GalleryMediaItem['recordingGroup']
) {
  return (
    left === right ||
    (left !== undefined &&
      right !== undefined &&
      left.groupId === right.groupId &&
      left.order === right.order &&
      left.role === right.role &&
      left.sourceFavicon === right.sourceFavicon &&
      left.sourceLabel === right.sourceLabel &&
      left.sourceUrl === right.sourceUrl &&
      left.dimensions?.height === right.dimensions?.height &&
      left.dimensions?.width === right.dimensions?.width)
  );
}

function areRecordingGroupViewsEqual(
  left: GalleryMediaItem['recordingGroupView'],
  right: GalleryMediaItem['recordingGroupView']
) {
  return (
    left === right ||
    (left !== undefined &&
      right !== undefined &&
      areRecordingGroupMembersEqual(left, right) &&
      left.memberCount === right.memberCount &&
      left.projectId === right.projectId &&
      left.projectName === right.projectName)
  );
}

function areMediaSourcesEqual(left: GalleryMediaItem['source'], right: GalleryMediaItem['source']) {
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case 'recording':
      return right.kind === left.kind && left.recordingId === right.recordingId;
    case 'project-export':
      return (
        right.kind === left.kind &&
        left.exportId === right.exportId &&
        left.projectId === right.projectId
      );
    case 'project-asset':
      return right.kind === left.kind && left.projectAssetId === right.projectAssetId;
    case 'web-snapshot':
      return right.kind === left.kind && left.snapshotId === right.snapshotId;
    case 'screenshot':
      return true;
  }
}

function areGalleryItemBaseFieldsEqual(left: GalleryItem, right: GalleryItem) {
  return (
    left.id === right.id &&
    left.entityId === right.entityId &&
    left.type === right.type &&
    left.kind === right.kind &&
    left.filename === right.filename &&
    left.originalFilename === right.originalFilename &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt &&
    left.expiresAt === right.expiresAt &&
    left.size === right.size &&
    left.mimeType === right.mimeType &&
    left.width === right.width &&
    left.height === right.height &&
    left.duration === right.duration &&
    left.hasThumbnail === right.hasThumbnail &&
    left.imageContentState === right.imageContentState &&
    left.presentationRevision === right.presentationRevision &&
    left.workspaceRevision === right.workspaceRevision &&
    left.sourceUrl === right.sourceUrl &&
    left.sourceTitle === right.sourceTitle &&
    left.sourceFavicon === right.sourceFavicon &&
    areStringArraysEqual(left.tags, right.tags) &&
    areLifecyclesEqual(left.lifecycle, right.lifecycle)
  );
}

function areGalleryItemsUiEquivalent(left: GalleryItem, right: GalleryItem | undefined): boolean {
  if (!right || !areGalleryItemBaseFieldsEqual(left, right)) return false;
  if (isGalleryMediaItem(left)) {
    return (
      isGalleryMediaItem(right) &&
      areMediaSourcesEqual(left.source, right.source) &&
      areRecordingGroupMembersEqual(left.recordingGroup, right.recordingGroup) &&
      areRecordingGroupViewsEqual(left.recordingGroupView, right.recordingGroupView)
    );
  }
  if (isGalleryScenarioItem(left)) {
    return (
      isGalleryScenarioItem(right) &&
      left.project.id === right.project.id &&
      left.project.name === right.project.name &&
      left.project.updatedAt === right.project.updatedAt &&
      left.project.workspaceRevision === right.project.workspaceRevision
    );
  }
  if (isGalleryScenarioExportItem(left)) {
    return (
      isGalleryScenarioExportItem(right) &&
      left.format === right.format &&
      left.exportEntry.id === right.exportEntry.id &&
      left.exportEntry.projectId === right.exportEntry.projectId &&
      left.exportEntry.createdAt === right.exportEntry.createdAt &&
      left.project.id === right.project.id &&
      left.project.updatedAt === right.project.updatedAt
    );
  }
  return (
    isGalleryVideoProjectItem(left) &&
    isGalleryVideoProjectItem(right) &&
    left.thumbnailSourceMediaId === right.thumbnailSourceMediaId &&
    left.unavailableReason === right.unavailableReason &&
    left.project.id === right.project.id &&
    left.project.updatedAt === right.project.updatedAt &&
    left.project.clipCount === right.project.clipCount &&
    left.project.trackCount === right.project.trackCount &&
    left.project.retentionKind === right.project.retentionKind &&
    areStringArraysEqual(left.project.recordingIds, right.project.recordingIds)
  );
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

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { ensureLibraryThumbnail } from './ensure';
import type { LibraryThumbnailItem, LibraryThumbnailViewState } from './types';

const MAX_PARALLEL_THUMBNAILS = 3;

interface LoadedLibraryThumbnailViewState {
  itemKey: string;
  viewState: LibraryThumbnailViewState;
}

function createItemKey(item: LibraryThumbnailItem): string {
  return `${item.thumbnailId}:${item.sourceMediaId ?? ''}`;
}

function createItemsKey(items: LibraryThumbnailItem[]): string {
  return items.map((item) => `${item.thumbnailId}:${item.sourceMediaId ?? ''}`).join('|');
}

function revokeThumbnailUrls(thumbnails: Record<string, LoadedLibraryThumbnailViewState>) {
  for (const thumbnail of Object.values(thumbnails)) {
    URL.revokeObjectURL(thumbnail.viewState.url);
  }
}

function createThumbnailViewStateMap(
  thumbnails: Record<string, LoadedLibraryThumbnailViewState>
): Record<string, LibraryThumbnailViewState> {
  return Object.fromEntries(
    Object.entries(thumbnails).map(([thumbnailId, thumbnail]) => [thumbnailId, thumbnail.viewState])
  );
}

function isLoadedEntry(
  entry: [string, LoadedLibraryThumbnailViewState] | null
): entry is [string, LoadedLibraryThumbnailViewState] {
  return entry !== null;
}

async function loadItemThumbnail(
  item: LibraryThumbnailItem,
  revision: number,
  getCurrentRevision: () => number
): Promise<[string, LoadedLibraryThumbnailViewState] | null> {
  const entry = await ensureLibraryThumbnail(item);
  if (!entry) {
    return null;
  }

  const url = URL.createObjectURL(entry.blob);
  if (getCurrentRevision() !== revision) {
    URL.revokeObjectURL(url);
    return null;
  }

  return [item.thumbnailId, { itemKey: createItemKey(item), viewState: { status: 'ready', url } }];
}

async function loadThumbnailBatch(
  items: LibraryThumbnailItem[],
  revision: number,
  getCurrentRevision: () => number
): Promise<Array<[string, LoadedLibraryThumbnailViewState] | null>> {
  const entries: Array<[string, LoadedLibraryThumbnailViewState] | null> = [];
  let nextIndex = 0;

  async function loadNextItem(): Promise<void> {
    const item = items[nextIndex];
    nextIndex += 1;
    if (!item) {
      return;
    }

    entries.push(await loadItemThumbnail(item, revision, getCurrentRevision));
    await loadNextItem();
  }

  const workers = items.slice(0, MAX_PARALLEL_THUMBNAILS).map(() => loadNextItem());
  await Promise.all(workers);
  return entries;
}

function retainCurrentThumbnails(args: {
  items: LibraryThumbnailItem[];
  previous: Record<string, LoadedLibraryThumbnailViewState>;
}): Record<string, LoadedLibraryThumbnailViewState> {
  const retained: Record<string, LoadedLibraryThumbnailViewState> = {};
  const expectedItemKeys = new Map(
    args.items.map((item) => [item.thumbnailId, createItemKey(item)])
  );

  for (const [thumbnailId, thumbnail] of Object.entries(args.previous)) {
    if (expectedItemKeys.get(thumbnailId) === thumbnail.itemKey) {
      retained[thumbnailId] = thumbnail;
      continue;
    }
    URL.revokeObjectURL(thumbnail.viewState.url);
  }

  return retained;
}

function resolveMissingThumbnailItems(args: {
  items: LibraryThumbnailItem[];
  retained: Record<string, LoadedLibraryThumbnailViewState>;
}): LibraryThumbnailItem[] {
  return args.items.filter((item) => args.retained[item.thumbnailId] === undefined);
}

function useStableThumbnailItemsRef(items: LibraryThumbnailItem[], itemKey: string) {
  const itemKeyRef = useRef(itemKey);
  const itemsRef = useRef(items);

  if (itemKeyRef.current !== itemKey) {
    itemKeyRef.current = itemKey;
    itemsRef.current = items;
  }

  return itemsRef;
}

function useThumbnailLoadEffect(args: {
  itemKey: string;
  itemsRef: MutableRefObject<LibraryThumbnailItem[]>;
  loadedThumbnailsRef: MutableRefObject<Record<string, LoadedLibraryThumbnailViewState>>;
  revisionRef: MutableRefObject<number>;
  setThumbnails: Dispatch<SetStateAction<Record<string, LibraryThumbnailViewState>>>;
}) {
  const { itemKey, itemsRef, loadedThumbnailsRef, revisionRef, setThumbnails } = args;

  useEffect(() => {
    const revision = revisionRef.current + 1;
    revisionRef.current = revision;
    const retained = retainCurrentThumbnails({
      items: itemsRef.current,
      previous: loadedThumbnailsRef.current,
    });
    loadedThumbnailsRef.current = retained;
    setThumbnails(createThumbnailViewStateMap(retained));

    const missingItems = resolveMissingThumbnailItems({ items: itemsRef.current, retained });
    queueMissingThumbnailLoads({
      loadedThumbnailsRef,
      missingItems,
      revision,
      revisionRef,
      setThumbnails,
    });

    return () => {
      revisionRef.current += 1;
    };
  }, [itemKey, itemsRef, loadedThumbnailsRef, revisionRef, setThumbnails]);
}

function queueMissingThumbnailLoads(args: {
  missingItems: LibraryThumbnailItem[];
  loadedThumbnailsRef: MutableRefObject<Record<string, LoadedLibraryThumbnailViewState>>;
  revision: number;
  revisionRef: MutableRefObject<number>;
  setThumbnails: Dispatch<SetStateAction<Record<string, LibraryThumbnailViewState>>>;
}) {
  if (args.missingItems.length === 0) {
    return;
  }

  void loadThumbnailBatch(args.missingItems, args.revision, () => args.revisionRef.current)
    .then((entries) => {
      if (args.revisionRef.current !== args.revision) {
        return;
      }

      args.loadedThumbnailsRef.current = {
        ...args.loadedThumbnailsRef.current,
        ...Object.fromEntries(entries.filter(isLoadedEntry)),
      };
      args.setThumbnails(createThumbnailViewStateMap(args.loadedThumbnailsRef.current));
    })
    .catch(() => undefined);
}

function useThumbnailCleanupEffect(args: {
  loadedThumbnailsRef: MutableRefObject<Record<string, LoadedLibraryThumbnailViewState>>;
  revisionRef: MutableRefObject<number>;
}) {
  const { loadedThumbnailsRef, revisionRef } = args;

  useEffect(() => {
    const loadedThumbnails = loadedThumbnailsRef;
    const revision = revisionRef;
    return () => {
      revision.current += 1;
      revokeThumbnailUrls(loadedThumbnails.current);
      loadedThumbnails.current = {};
    };
  }, [loadedThumbnailsRef, revisionRef]);
}

export function useLibraryThumbnails(
  items: LibraryThumbnailItem[]
): Record<string, LibraryThumbnailViewState> {
  const itemKey = useMemo(() => createItemsKey(items), [items]);
  const revisionRef = useRef(0);
  const itemsRef = useStableThumbnailItemsRef(items, itemKey);
  const loadedThumbnailsRef = useRef<Record<string, LoadedLibraryThumbnailViewState>>({});
  const [thumbnails, setThumbnails] = useState<Record<string, LibraryThumbnailViewState>>({});

  useThumbnailLoadEffect({ itemKey, itemsRef, loadedThumbnailsRef, revisionRef, setThumbnails });
  useThumbnailCleanupEffect({ loadedThumbnailsRef, revisionRef });

  return thumbnails;
}

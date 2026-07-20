import { useEffect, useMemo, useState } from 'react';
import {
  getMediaThumbnail,
  listMediaLibrary,
  syncLegacyMediaLibrary,
} from '../../../composition/persistence/media-library/index.library.ts';
import type { MediaLibraryItem } from '../../../composition/persistence/media-library/contracts';

function isImageLibraryItem(item: MediaLibraryItem) {
  return item.mimeType.startsWith('image/');
}

function matchesImageSearch(item: MediaLibraryItem, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  const haystack = [
    item.filename,
    item.originalFilename,
    item.sourceTitle,
    item.sourceUrl,
    item.tags.join(' '),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(normalizedQuery);
}

export function useScenarioImageStepLibrary(search: string) {
  const { items, loading } = useScenarioImageLibraryItems();
  const filteredItems = useMemo(
    () => items.filter((item) => matchesImageSearch(item, search)),
    [items, search]
  );
  const thumbnailUrls = useScenarioImageStepThumbnails(filteredItems);

  return {
    filteredItems,
    loading,
    thumbnailUrls,
  };
}

function useScenarioImageLibraryItems() {
  const [items, setItems] = useState<MediaLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const syncAndLoadItems = async () => {
      setLoading(true);
      try {
        await syncLegacyMediaLibrary();
        const nextItems = (await listMediaLibrary()).filter(isImageLibraryItem);
        if (!cancelled) {
          setItems(nextItems);
        }
      } catch {
        if (!cancelled) {
          setItems([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void syncAndLoadItems();

    return () => {
      cancelled = true;
    };
  }, []);

  return { items, loading };
}

async function loadScenarioImageThumbnailEntries(items: MediaLibraryItem[]) {
  const blobs: Array<readonly [string, Blob | null]> = await Promise.all(
    items.map(async (item) => {
      if (!item.hasThumbnail) {
        return [item.id, null] as const;
      }

      const entry = await getMediaThumbnail(item.id);
      return [item.id, entry?.blob ?? null] as const;
    })
  );

  return blobs.flatMap((entry) => {
    const [id, blob] = entry;
    if (!blob) {
      return [];
    }

    const url = URL.createObjectURL(blob);
    return [[id, url] as const];
  });
}

function useScenarioImageStepThumbnails(items: MediaLibraryItem[]) {
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    let objectUrls: string[] = [];

    const loadThumbnails = async () => {
      try {
        const nextEntries = await loadScenarioImageThumbnailEntries(items);

        if (cancelled) {
          return;
        }

        objectUrls = nextEntries.map((entry) => entry[1]);
        setThumbnailUrls(Object.fromEntries(nextEntries));
      } catch {
        if (!cancelled) {
          setThumbnailUrls({});
        }
      }
    };

    setThumbnailUrls({});
    void loadThumbnails();

    return () => {
      cancelled = true;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [items]);

  return thumbnailUrls;
}

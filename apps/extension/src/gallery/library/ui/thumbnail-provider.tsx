import { subscribeToMediaHubEvents } from '../../../features/media-hub/events';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ensureGalleryItemThumbnail, type GalleryItem } from '../items';
import { createGalleryThumbnailResources } from './thumbnail-resources';

const ThumbnailResources = createContext<ReturnType<typeof createGalleryThumbnailResources> | null>(
  null
);

export function GalleryThumbnailProvider(props: { snapshot: GalleryItem[]; children: ReactNode }) {
  const resources = useMemo(() => {
    const admitted = new Set(props.snapshot);
    return createGalleryThumbnailResources((item, signal) =>
      admitted.has(item) ? ensureGalleryItemThumbnail(item, signal) : Promise.resolve(undefined)
    );
  }, [props.snapshot]);
  useEffect(() => {
    const invalidate = () => resources.invalidate();
    const onVisible = () => {
      if (document.visibilityState === 'visible') invalidate();
    };
    const unsubscribe = subscribeToMediaHubEvents(invalidate);
    window.addEventListener('focus', invalidate);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      unsubscribe();
      window.removeEventListener('focus', invalidate);
      document.removeEventListener('visibilitychange', onVisible);
      resources.dispose();
    };
  }, [resources]);
  return (
    <ThumbnailResources.Provider value={resources}>{props.children}</ThumbnailResources.Provider>
  );
}

function loadThumbUrl(item: GalleryItem, setThumbUrl: (value: string | null) => void) {
  let disposed = false;
  let objectUrl: string | null = null;
  const controller = new AbortController();

  ensureGalleryItemThumbnail(item, controller.signal)
    .then((thumb) => {
      if (disposed) {
        return;
      }
      if (!thumb) {
        setThumbUrl(null);
        return;
      }

      objectUrl = URL.createObjectURL(thumb.blob);
      setThumbUrl(objectUrl);
    })
    .catch(() => {
      if (disposed) {
        return;
      }
      setThumbUrl(null);
    });

  return () => {
    disposed = true;
    controller.abort();
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  };
}

function getGalleryItemThumbnailIdentity(item: GalleryItem): string {
  if (item.type === 'video-project') {
    return `${item.id}:${item.hasThumbnail}:${item.presentationRevision ?? ''}:${item.workspaceRevision ?? ''}`;
  }
  if (item.type === 'scenario' || item.type === 'scenario-export') {
    return `${item.id}:${item.hasThumbnail}:${item.project.updatedAt}:${item.workspaceRevision ?? ''}`;
  }
  return `${item.id}:${item.hasThumbnail}:${item.entityId ?? item.id}`;
}

export function useMediaThumbUrl(item: GalleryItem, visible: boolean, epoch: number) {
  const resources = useContext(ThumbnailResources);
  const itemRef = useRef(item);
  itemRef.current = item;
  const thumbnailIdentity = getGalleryItemThumbnailIdentity(item);
  const [thumb, setThumb] = useState<{
    resources: typeof resources;
    epoch: number;
    identity: string;
    url: string | null;
  } | null>(null);

  useEffect(() => {
    if (!visible) return;
    const publish = (url: string | null) =>
      setThumb({ resources, epoch, identity: thumbnailIdentity, url });
    if (!resources) return loadThumbUrl(itemRef.current, publish);
    const lease = resources.acquire(itemRef.current);
    let disposed = false;
    void lease.url.then((url) => {
      if (!disposed) publish(url);
    });
    return () => {
      disposed = true;
      lease.release();
    };
  }, [resources, thumbnailIdentity, visible, epoch]);

  const thumbUrl =
    visible &&
    thumb?.resources === resources &&
    thumb?.identity === thumbnailIdentity &&
    thumb.epoch === epoch
      ? thumb.url
      : null;
  return thumbUrl;
}

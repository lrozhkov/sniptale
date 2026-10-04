import type { GalleryItem } from '../items';

type Thumbnail = { blob: Blob; width: number; height: number };
type Entry = {
  controller: AbortController;
  consumers: number;
  retain: boolean;
  promise: Promise<string | null>;
  url: string | null;
  bytes: number;
  decodedBytes: number;
};

/** Disposable resources for one immutable Gallery snapshot, never a persistence authority. */
export function createGalleryThumbnailResources(
  load: (item: GalleryItem, signal: AbortSignal) => Promise<Thumbnail | undefined>,
  limits = { entries: 256, bytes: 16 * 1024 * 1024, decodedBytes: 64 * 1024 * 1024 }
) {
  const entries = new Map<GalleryItem, Entry>();
  const idle = new Map<GalleryItem, Entry>();
  const remove = (item: GalleryItem, entry: Entry) => {
    entry.controller.abort();
    if (entry.url) URL.revokeObjectURL(entry.url);
    if (entries.get(item) === entry) entries.delete(item);
    idle.delete(item);
  };
  const trim = () => {
    let bytes = 0;
    let decodedBytes = 0;
    for (const entry of idle.values()) {
      bytes += entry.bytes;
      decodedBytes += entry.decodedBytes;
    }
    for (const [item, entry] of idle) {
      if (
        idle.size <= limits.entries &&
        bytes <= limits.bytes &&
        decodedBytes <= limits.decodedBytes
      )
        break;
      bytes -= entry.bytes;
      decodedBytes -= entry.decodedBytes;
      remove(item, entry);
    }
  };
  return {
    acquire(item: GalleryItem) {
      let entry = entries.get(item);
      if (!entry) {
        const created: Entry = {
          controller: new AbortController(),
          consumers: 0,
          retain: true,
          promise: Promise.resolve(null),
          url: null,
          bytes: 0,
          decodedBytes: 0,
        };
        entries.set(item, created);
        created.promise = load(item, created.controller.signal)
          .then((thumbnail) => {
            if (!thumbnail || created.controller.signal.aborted || entries.get(item) !== created)
              return null;
            created.bytes = thumbnail.blob.size;
            created.decodedBytes = thumbnail.width * thumbnail.height * 4;
            created.url = URL.createObjectURL(thumbnail.blob);
            return created.url;
          })
          .catch(() => null);
        entry = created;
      }
      idle.delete(item);
      entry.consumers += 1;
      const acquired = entry;
      let released = false;
      return {
        url: acquired.promise,
        release() {
          if (released) return;
          released = true;
          acquired.consumers -= 1;
          if (acquired.consumers || entries.get(item) !== acquired) return;
          if (!acquired.url || !acquired.retain) remove(item, acquired);
          else {
            idle.set(item, acquired);
            trim();
          }
        },
      };
    },
    invalidate() {
      for (const [item, entry] of entries) {
        entry.retain = false;
        if (entry.consumers === 0) remove(item, entry);
      }
    },
    dispose() {
      for (const [item, entry] of entries) remove(item, entry);
    },
  };
}

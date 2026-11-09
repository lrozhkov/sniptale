/** A borrowed immutable raster value. Release it after the last GPU read completes. */
export interface RetainedRasterMaterialLease<T> {
  value: T;
  /** Present only when the value is retained by this owner. Tokens identify actual pixel content. */
  revision?: object;
  release(): void;
}

interface Entry<T> {
  identity: object;
  key: string;
  value: T;
  revision: object;
  readers: number;
  retired: boolean;
  released: boolean;
  release(): void;
}

/**
 * Own one completed raster and its readers. The allocator must roll back partial work on failure.
 * A different key during a borrow gets a temporary value; it cannot replace the borrowed pixels.
 */
export function createRetainedRasterMaterialOwner<T>() {
  let current: Entry<T> | null = null;
  let disposed = false;

  const releaseRetired = (entry: Entry<T>) => {
    if (!entry.retired || entry.readers > 0 || entry.released) return;
    entry.released = true;
    entry.release();
  };
  const retire = (entry: Entry<T>) => {
    entry.retired = true;
    releaseRetired(entry);
  };
  const borrow = (entry: Entry<T>, cached: boolean): RetainedRasterMaterialLease<T> => {
    entry.readers++;
    let released = false;
    return {
      value: entry.value,
      ...(cached ? { revision: entry.revision } : {}),
      release() {
        if (released) return;
        released = true;
        entry.readers--;
        releaseRetired(entry);
      },
    };
  };
  return {
    borrow(
      identity: object,
      key: string,
      allocate: () => { value: T; release(): void }
    ): RetainedRasterMaterialLease<T> {
      if (disposed) throw new Error('Raster material owner is disposed.');
      if (current && current.identity === identity && current.key === key)
        return borrow(current, true);
      const allocated = allocate();
      if (disposed) {
        allocated.release();
        throw new Error('Raster material owner is disposed.');
      }
      const next: Entry<T> = {
        value: allocated.value,
        release: () => allocated.release(),
        identity,
        key,
        revision: {},
        readers: 0,
        retired: false,
        released: false,
      };
      if (current && current.readers > 0) {
        next.retired = true;
        return borrow(next, false);
      }
      const previous = current;
      current = next;
      if (previous) retire(previous);
      return borrow(next, true);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const previous = current;
      current = null;
      if (previous) retire(previous);
    },
  };
}

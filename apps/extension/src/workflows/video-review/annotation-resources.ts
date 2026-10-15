/** Disposable publication lease; only the annotation acquisition workflow constructs these handles. */
export interface ReviewPreparedAnnotationResource {
  readonly assetId: string;
  readonly physicalAssetId: string;
  publish(): Promise<void>;
  cancel(): Promise<void>;
  release(): Promise<void>;
  /** Owner-scoped physical read; never a catalog or in-memory fallback after erasure. */
  read?(signal: AbortSignal): Promise<Blob>;
}

/** Owns prepared bytes until durable graph adoption or proven non-adoption; it owns no writer queue. */
export function createReviewAnnotationResourceRetention(deps: {
  readDurableReferences(): Promise<ReadonlySet<string>>;
}) {
  const pending = new Map<string, ReviewPreparedAnnotationResource>();
  let disposal: Promise<void> | undefined;

  const release = async (resource: ReviewPreparedAnnotationResource) => {
    await resource.release();
    if (pending.get(resource.assetId) === resource) pending.delete(resource.assetId);
  };

  return {
    /** Transfer is atomic and follows successful local source/history admission. */
    admit(resources: readonly ReviewPreparedAnnotationResource[], permitted: ReadonlySet<string>) {
      if (disposal) throw new Error('Annotation resource retention is closed.');
      const ids = new Set<string>();
      for (const resource of resources) {
        if (
          !permitted.has(resource.assetId) ||
          ids.has(resource.assetId) ||
          (pending.has(resource.assetId) && pending.get(resource.assetId) !== resource)
        )
          throw new Error('Annotation resource ownership changed.');
        ids.add(resource.assetId);
      }
      for (const resource of resources) pending.set(resource.assetId, resource);
    },
    has: (resource: ReviewPreparedAnnotationResource) => pending.get(resource.assetId) === resource,
    hasPending: () => pending.size > 0,
    /** A completed read cannot revive a released or disposed logical resource. */
    async read(reference: string, signal: AbortSignal): Promise<Blob | null> {
      signal.throwIfAborted();
      const resource = pending.get(reference);
      if (disposal || !resource?.read) return null;
      let blob: Blob;
      try {
        blob = await resource.read(signal);
      } catch {
        signal.throwIfAborted();
        return null;
      }
      signal.throwIfAborted();
      return !disposal && pending.get(reference) === resource ? blob : null;
    },
    /** Local Undo keeps redo references; branch/reset cancellation first reads complete durable history. */
    async reconcile(local: ReadonlySet<string>, adopt: boolean) {
      const candidates = [...pending.values()].filter(
        (resource) => adopt || !local.has(resource.assetId)
      );
      if (!candidates.length) return;
      const durable = await deps.readDurableReferences();
      for (const resource of candidates) {
        if (durable.has(resource.assetId)) await resource.publish();
        else if (!local.has(resource.assetId)) await resource.cancel();
        else throw new Error('Annotation resource adoption is unavailable.');
        await release(resource);
      }
    },
    /** Unknown save acknowledgement leaves its ready journal for recovery and releases the page lease. */
    dispose(): Promise<void> {
      disposal ??= (async () => {
        if (!pending.size) return;
        let durable: ReadonlySet<string> | undefined;
        const failures: unknown[] = [];
        try {
          durable = await deps.readDurableReferences();
        } catch (error) {
          failures.push(error);
        }
        for (const resource of pending.values()) {
          try {
            if (durable?.has(resource.assetId)) await resource.publish();
            else if (durable) await resource.cancel();
          } catch (error) {
            failures.push(error);
          }
          try {
            await release(resource);
          } catch (error) {
            failures.push(error);
          }
        }
        if (failures.length)
          throw new AggregateError(failures, 'Annotation resource cleanup is deferred.');
      })();
      return disposal;
    },
  };
}

import type { LibraryLifecycle } from '../../../composition/persistence/library-lifecycle/contracts';

export function rebaseTemporaryLifecycle<T extends { lifecycle?: LibraryLifecycle }>(
  entry: T,
  now = Date.now()
): T {
  if (entry.lifecycle?.storageClass !== 'temporary') return entry;
  return {
    ...entry,
    lifecycle: { savedAt: null, storageClass: 'temporary', updatedAt: now },
  };
}

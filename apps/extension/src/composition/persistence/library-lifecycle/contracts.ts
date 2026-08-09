import type {
  LibraryLifecycle,
  LibraryLifecycleScope,
  LibraryStorageClass,
} from '../../../contracts/settings/library-lifecycle';

export {
  LIBRARY_STORAGE_CLASSES,
  type LibraryLifecycle,
  type LibraryLifecycleScope,
  type LibraryStorageClass,
} from '../../../contracts/settings/library-lifecycle';

export function createLibraryLifecycle(
  storageClass: LibraryStorageClass,
  updatedAt = Date.now()
): LibraryLifecycle {
  return {
    storageClass,
    updatedAt,
    savedAt: storageClass === 'library' ? updatedAt : null,
  };
}

export function updateLibraryLifecycle(
  lifecycle: LibraryLifecycle,
  updatedAt = Date.now()
): LibraryLifecycle {
  return { ...lifecycle, updatedAt };
}

export function promoteLibraryLifecycle(
  lifecycle: LibraryLifecycle,
  updatedAt = Date.now()
): LibraryLifecycle {
  if (lifecycle.storageClass === 'library') {
    return lifecycle;
  }
  return { storageClass: 'library', updatedAt, savedAt: updatedAt };
}

export function matchesLibraryLifecycleScope(
  lifecycle: LibraryLifecycle,
  scope: LibraryLifecycleScope
): boolean {
  return scope === 'all' || lifecycle.storageClass === scope;
}

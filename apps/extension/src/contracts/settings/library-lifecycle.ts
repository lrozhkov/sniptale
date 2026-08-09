export const LIBRARY_STORAGE_CLASSES = ['temporary', 'library'] as const;

export type LibraryStorageClass = (typeof LIBRARY_STORAGE_CLASSES)[number];

export interface LibraryLifecycle {
  storageClass: LibraryStorageClass;
  updatedAt: number;
  savedAt: number | null;
}

export type LibraryLifecycleScope = LibraryStorageClass | 'all';

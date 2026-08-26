import { getMediaAssetBlob } from '../../../composition/persistence/media-library/index.library.ts';
import { isGalleryMediaItem, type GalleryItem } from '../items';
import { resolveGalleryMediaImportMimeType } from '../media-import-profile';
import type { MediaFileImportConflict } from '../import-types';

const BLOB_COMPARE_CHUNK_BYTES = 1024 * 1024;

function normalizeImportFilename(filename: string): string {
  return filename.normalize('NFC').toLowerCase();
}

function readBlobSlice(blob: Blob, start: number, end: number): Promise<ArrayBuffer> {
  const slice = blob.slice(start, end);
  if (typeof slice.arrayBuffer === 'function') return slice.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Could not compare media files.'));
    reader.onload = () =>
      reader.result instanceof ArrayBuffer
        ? resolve(reader.result)
        : reject(new Error('Could not compare media files.'));
    reader.readAsArrayBuffer(slice);
  });
}

async function blobsHaveSameContent(left: Blob, right: Blob): Promise<boolean> {
  if (left.size !== right.size) return false;
  for (let offset = 0; offset < left.size; offset += BLOB_COMPARE_CHUNK_BYTES) {
    const end = Math.min(left.size, offset + BLOB_COMPARE_CHUNK_BYTES);
    const [leftBytes, rightBytes] = await Promise.all([
      readBlobSlice(left, offset, end),
      readBlobSlice(right, offset, end),
    ]);
    const rightView = new Uint8Array(rightBytes);
    if (new Uint8Array(leftBytes).some((value, index) => value !== rightView[index])) return false;
  }
  return true;
}

function findPotentialCandidates(file: File, items: GalleryItem[]) {
  const normalizedFilename = normalizeImportFilename(file.name);
  return items.filter(
    (item) =>
      isGalleryMediaItem(item) &&
      item.size === file.size &&
      normalizeImportFilename(item.filename) === normalizedFilename
  );
}

export function hasPotentialMediaFileConflicts(files: File[], items: GalleryItem[]): boolean {
  return files.some((file) => findPotentialCandidates(file, items).length > 0);
}

export async function inspectMediaFileConflicts(files: File[], items: GalleryItem[]) {
  const conflicts: MediaFileImportConflict[] = [];
  const conflictingIndexes = new Set<number>();

  for (const [index, file] of files.entries()) {
    if (!resolveGalleryMediaImportMimeType(file)) continue;
    for (const candidate of findPotentialCandidates(file, items)) {
      const existingBlob = await getMediaAssetBlob(candidate.entityId ?? candidate.id);
      if (existingBlob && (await blobsHaveSameContent(file, existingBlob))) {
        conflicts.push({ filename: file.name, size: file.size });
        conflictingIndexes.add(index);
        break;
      }
    }
  }

  return { conflicts, conflictingIndexes };
}

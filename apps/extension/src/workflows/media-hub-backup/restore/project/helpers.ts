import { remapId } from './ids';

export function remapDescriptorId(entry: object, ids: ReadonlyMap<string, string>) {
  return 'id' in entry && typeof entry.id === 'string' ? remapId(ids, entry.id) : undefined;
}

export function readRestoredBlob(restoredBlobs: ReadonlyMap<string, Blob>, blobPath: string): Blob {
  const blob = restoredBlobs.get(blobPath);
  if (!blob) throw new Error(`Backup blob preflight is incomplete: ${blobPath}`);
  return blob;
}

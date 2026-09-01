import JSZip from 'jszip';

import { inspectZipCentralDirectory } from './central-directory.js';
import type { InspectZipCentralDirectoryOptions } from './types.js';

type VerifiedZipInput = ArrayBuffer | Blob | Uint8Array;

async function readZipInputBytes(input: VerifiedZipInput): Promise<Uint8Array> {
  if (input instanceof Uint8Array) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(await input.arrayBuffer());
}

/** Validates hostile ZIP structure and inflation bounds before JSZip parses the same bytes. */
export async function loadVerifiedZip(
  input: VerifiedZipInput,
  options: InspectZipCentralDirectoryOptions
): Promise<JSZip> {
  const bytes = await readZipInputBytes(input);
  inspectZipCentralDirectory(bytes, options);
  return JSZip.loadAsync(bytes);
}

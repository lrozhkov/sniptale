import { createEffectBundleFailure, type EffectBundleFailure } from '../diagnostics';
import {
  importEffectBundleZip,
  importRawEffectDocument,
  type ImportedEffectBundle,
  type ImportedRawEffectDocument,
} from './zip';

export type EffectArtifactKind = 'bundle-zip' | 'raw-json';

export type ImportedEffectArtifact =
  | { bundle: ImportedEffectBundle; kind: 'bundle-zip' }
  | { document: ImportedRawEffectDocument; kind: 'raw-json' };

export type ImportEffectArtifactResult =
  | { artifact: ImportedEffectArtifact; ok: true }
  | EffectBundleFailure;

export async function importEffectArtifactInCurrentThread(
  kind: EffectArtifactKind,
  bytes: Uint8Array
): Promise<ImportEffectArtifactResult> {
  if (kind === 'bundle-zip') {
    const result = await importEffectBundleZip(bytes);
    return result.ok
      ? { artifact: { bundle: result.bundle, kind: 'bundle-zip' }, ok: true }
      : result;
  }
  const result = await importRawEffectDocument(bytes);
  return result.ok
    ? { artifact: { document: result.artifact, kind: 'raw-json' }, ok: true }
    : result;
}

export function classifyEffectArtifactBytes(bytes: Uint8Array): EffectArtifactKind | null {
  if (isZipMagic(bytes)) return 'bundle-zip';
  const firstContentByte = bytes.find((byte) => !isJsonWhitespace(byte));
  return firstContentByte === 0x7b ? 'raw-json' : null;
}

function isZipMagic(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return false;
  const marker = (bytes[2]! << 8) | bytes[3]!;
  return marker === 0x0304 || marker === 0x0506 || marker === 0x0708;
}

function isJsonWhitespace(byte: number): boolean {
  return byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d;
}

export function createUnrecognizedArtifactFailure(): EffectBundleFailure {
  return createEffectBundleFailure('BUNDLE_ARCHIVE_INVALID', '$artifact');
}

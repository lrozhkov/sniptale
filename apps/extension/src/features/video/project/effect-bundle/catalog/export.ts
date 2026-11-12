import JSZip from 'jszip';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { parseAnimationTemplateJson } from '@sniptale/runtime-contracts/animation-template';
import { parseAnimationPackManifest } from '../manifest';
import { EFFECT_BUNDLE_LIMITS } from '../limits';
import { assertEffectBundleZipLimits } from '../import/zip/archive';
import type { EffectBundleCatalogEntry } from './index';

/** Export complete authored packages; project references and catalogue preferences stay local. */
export async function exportEffectCatalog(
  catalog: EffectBundleCatalogEntry
): Promise<{ blob: Blob; filename: string }> {
  if (
    catalog.source === 'builtin' ||
    catalog.assets.length ||
    !catalog.documents.length ||
    catalog.documents.length > EFFECT_BUNDLE_LIMITS.maxDocuments
  )
    throw new Error('Animation pack is unavailable.');
  const zip = new JSZip(),
    documents = [];
  let retained = 0;
  for (const [index, entry] of catalog.documents.entries()) {
    if (
      !entry.source ||
      entry.schemaVersion !== 'sniptale.animation.v1' ||
      entry.kind !== 'standalone' ||
      entry.assets.length
    )
      throw new Error('Animation pack is unavailable.');
    const bytes = new TextEncoder().encode(entry.source);
    retained += bytes.byteLength;
    if (
      retained > EFFECT_BUNDLE_LIMITS.maxInflatedBytes ||
      bytes.byteLength > EFFECT_BUNDLE_LIMITS.maxJsonBytes ||
      bytesToHex(sha256(bytes)) !== entry.sha256
    )
      throw new Error('Animation pack integrity failed.');
    const parsed = await parseAnimationTemplateJson(entry.source);
    if (!parsed.ok || parsed.template.id !== entry.id)
      throw new Error('Animation pack integrity failed.');
    const path = `animations/${index}.sniptale-animation.json`;
    documents.push({ id: entry.id, path, byteLength: bytes.byteLength, sha256: entry.sha256 });
    zip.file(path, bytes, { createFolders: false });
  }
  const manifest = parseAnimationPackManifest({
    format: 'sniptale-animation-pack',
    version: 1,
    metadata: {
      packId: catalog.packId,
      label: catalog.label,
      description: catalog.description,
    },
    documents,
  });
  if (!manifest) throw new Error('Animation pack metadata is invalid.');
  zip.file('manifest.json', JSON.stringify(manifest));
  let bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  try {
    assertEffectBundleZipLimits(bytes);
  } catch {
    // Repetitive keyframes can exceed the import ratio limit. Retry without compression,
    // and apply the same size/path/ratio limits to the replacement archive.
    bytes = await zip.generateAsync({ type: 'uint8array', compression: 'STORE' });
    assertEffectBundleZipLimits(bytes);
  }
  return {
    blob: new Blob([bytes.slice().buffer], { type: 'application/zip' }),
    filename: `${manifest.metadata.packId}.sniptale-animations.zip`,
  };
}

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  assertEffectV1AssetSignature,
  parseEffectV1Source,
  sha256EffectV1Bytes,
} from '@sniptale/runtime-contracts/effect-v1';
import {
  parseEffectBundleManifest,
  type EffectBundleAssetManifestEntry,
} from '../src/features/video/project/effect-bundle/manifest';
import { materializeDocumentAssets } from '../src/features/video/project/effect-bundle/import/assets';
import { projectCatalogPresentation } from '../src/features/video/project/effect-bundle/catalog/presentation';

/** Validate product-owned artifacts without consulting SDK sources or any network. */
export async function buildVideoEffectIndex(root: string) {
  const manifestBytes = await readFile(join(root, 'collection.json'));
  const input: unknown = JSON.parse(manifestBytes.toString('utf8'));
  const parsed = parseEffectBundleManifest(input);
  if (!parsed.ok) throw new Error('Invalid built-in effect collection');
  const manifest = parsed.manifest;
  const paths = new Map<string, Uint8Array>();
  for (const entry of [...manifest.effectDocuments, ...manifest.assets]) {
    const bytes = new Uint8Array(await readFile(join(root, entry.path)));
    if (
      bytes.byteLength !== entry.byteLength ||
      (await sha256EffectV1Bytes(bytes)) !== entry.sha256
    )
      throw new Error(`Built-in effect hash/size mismatch: ${entry.path}`);
    if ('mimeType' in entry) assertEffectV1AssetSignature(bytes, entry.mimeType, 'builtin-package');
    paths.set(entry.path, bytes);
  }
  const actual = await readdir(root, { recursive: true, withFileTypes: true });
  if (actual.some((entry) => entry.isSymbolicLink()))
    throw new Error('Symlink in effect collection');
  const expected = new Set(['collection.json', ...paths.keys()]);
  for (const entry of actual.filter((entry) => entry.isFile())) {
    const name = join(entry.parentPath, entry.name)
      .slice(root.length + 1)
      .replaceAll('\\', '/');
    if (!expected.has(name)) throw new Error(`Undeclared effect resource: ${name}`);
  }
  const used = new Map<string, EffectBundleAssetManifestEntry>();
  const documents = [];
  for (const entry of manifest.effectDocuments) {
    const parsed = parseEffectV1Source(new TextDecoder().decode(paths.get(entry.path)!));
    if (!parsed.document || parsed.document.id !== entry.id)
      throw new Error(`Invalid effect: ${entry.path}`);
    const assets = await materializeDocumentAssets(parsed.document, manifest.assets, paths, used);
    if (!assets.ok) throw new Error(`Invalid effect assets: ${entry.path}`);
    documents.push({
      id: entry.id,
      kind: parsed.document.kind,
      presentation: projectCatalogPresentation(parsed.document),
    });
  }
  if (used.size !== manifest.assets.length) throw new Error('Unused effect asset');
  return { manifest, sourceSha256: await sha256EffectV1Bytes(manifestBytes), documents };
}

import { BlobReader, BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js';
import {
  parseEffectV1Source,
  sha256EffectV1Bytes,
  validateEffectV1Document,
} from '@sniptale/runtime-contracts/effect-v1';
import type { EffectBundleCatalogEntry } from './index';
import type { EffectBundleManifest } from '../manifest';

/** Export the portable bundle contract, including asset bytes; catalog UI state stays local. */
export async function exportEffectCatalog(
  catalog: EffectBundleCatalogEntry
): Promise<{ blob: Blob; filename: string }> {
  const files = catalog.assets.map((asset) => ({ asset, path: `assets/${asset.sha256}` }));
  const documents = await Promise.all(
    catalog.documents.map(async (entry, index) => {
      const document = parseEffectV1Source(entry.source).document;
      if (!document) throw new Error('Invalid catalog document');
      for (const declaration of document.assets) {
        const reference = entry.assets.find((asset) => asset.id === declaration.id);
        const file = files.find((item) => item.asset.sha256 === reference?.sha256);
        if (!file) throw new Error('Missing catalog asset');
        delete declaration.dataUrl;
        delete declaration.svgText;
        declaration.path = file.path;
      }
      if (!validateEffectV1Document(document).ok) throw new Error('Invalid exported document');
      const source = JSON.stringify(document);
      const bytes = new TextEncoder().encode(source);
      return {
        source,
        id: document.id,
        path: `effects/effect-${index}.sniptale-effect.json`,
        schemaVersion: document.schemaVersion,
        byteLength: bytes.byteLength,
        sha256: await sha256EffectV1Bytes(bytes),
      };
    })
  );
  const basename = catalog.packId.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 100);
  if (documents.length === 1 && !files.length && catalog.source === 'raw-json')
    return {
      blob: new Blob([documents[0]!.source], { type: 'application/json' }),
      filename: `${basename}.sniptale-effect.json`,
    };
  const manifest: EffectBundleManifest = {
    manifestVersion: 'sniptale.bundle.v1',
    engineVersion: '2.0',
    packId: catalog.packId,
    version: catalog.version,
    label: catalog.label,
    ...(catalog.description.en || catalog.description.ru
      ? { description: catalog.description }
      : {}),
    effectDocuments: documents.map(({ source: _source, ...entry }) => entry),
    assets: files.map(({ asset, path }) => ({
      path,
      byteLength: asset.byteLength,
      sha256: asset.sha256,
      kind: asset.kind,
      mimeType: asset.mimeType,
    })),
  };
  const writer = new ZipWriter(new BlobWriter('application/zip'), {
    level: 0,
    bufferedWrite: true,
  });
  await writer.add('manifest.json', new TextReader(JSON.stringify(manifest)));
  for (const document of documents)
    await writer.add(document.path, new TextReader(document.source));
  for (const { asset, path } of files) await writer.add(path, new BlobReader(asset.blob));
  return { blob: await writer.close(), filename: `${basename}.sniptale-bundle.zip` };
}

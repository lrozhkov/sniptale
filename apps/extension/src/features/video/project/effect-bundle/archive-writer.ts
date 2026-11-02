import { BlobReader, BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js';
import type { EffectBundleAssetManifestEntry, EffectBundleManifest } from './manifest';

/** Write caller-prepared documents and assets through the portable bundle contract. */
export async function writeEffectBundleArchive(args: {
  manifest: Omit<EffectBundleManifest, 'assets'>;
  documents: readonly { path: string; source: string }[];
  files: readonly {
    asset: Omit<EffectBundleAssetManifestEntry, 'path'> & { blob: Blob };
    path: string;
  }[];
}): Promise<Blob> {
  const manifest: EffectBundleManifest = {
    ...args.manifest,
    assets: args.files.map(({ asset, path }) => ({
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
  for (const document of args.documents)
    await writer.add(document.path, new TextReader(document.source));
  for (const { asset, path } of args.files) await writer.add(path, new BlobReader(asset.blob));
  return writer.close();
}

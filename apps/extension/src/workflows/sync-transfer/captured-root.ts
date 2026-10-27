import { createArchivePathAllocator } from '../../composition/archive-transfer';
import { readAssetFile, type AssetRef } from '../../composition/persistence/assets';
import type { CapturedMediaDependency } from '../../composition/persistence/sync-capture/contracts';
import { parseSyncCaptureRecord } from '../../composition/persistence/sync-capture/guards';
import { assertPortableJson, parseRootEnvelope } from '../media-hub-backup/v6/codec';
import type { ArchiveRootObjectSource } from '../media-hub-backup/v6/contracts';
import {
  createObjectCollector,
  createReadableAssetFilename,
} from '../media-hub-backup/v6/inventory/helpers';
import { encodePortableMediaOriginal } from '../media-hub-backup/v6/root-codecs/media';
import {
  encodePortableVideoProjectAsset,
  encodePortableVideoProjectAssetRefs,
  encodePortableVideoProjectExport,
} from '../media-hub-backup/v6/root-codecs/projects';
import { parsePortableSyncRoot } from './prepared-root';

/** Encodes an admitted frozen capture without reading live native rows or creating an archive. */
export async function encodeCapturedPortableRoot(value: unknown): Promise<{
  envelope: Awaited<ReturnType<typeof parsePortableSyncRoot>>['envelope'];
  objects: ArchiveRootObjectSource[];
  dependencies: CapturedMediaDependency[];
  bindings: { objectId: string; ref: AssetRef }[];
}> {
  const parsed = parseSyncCaptureRecord(value);
  if (
    !parsed ||
    parsed.kind !== 'sync-operation' ||
    parsed.phase !== 'native' ||
    parsed.change.kind === 'tombstone'
  )
    throw new Error('Unsupported portable capture.');
  // Parsers can retain nested values. Detach the entire accepted snapshot before the first read.
  const capture = structuredClone(parsed);
  const collector = createObjectCollector('sync', createArchivePathAllocator());
  const bindings: { objectId: string; ref: AssetRef }[] = [];
  const add = async (ref: AssetRef, filename: string) => {
    const file = await readAssetFile(ref, filename);
    if (file.size !== ref.size || file.type !== ref.mimeType)
      throw new Error('Captured source size or MIME differs from its reference.');
    const objectId = collector.addObject(file, filename, ref.mimeType);
    bindings.push({ objectId, ref });
    return objectId;
  };
  let metadata: unknown;
  let dependencies: CapturedMediaDependency[] = [];
  if (capture.change.kind === 'media') {
    const rows = capture.change.rows;
    metadata = {
      entry: rows.media,
      ...encodePortableMediaOriginal({
        projectAsset: rows.projectAsset,
        originalObjectId: await add(rows.ref, rows.media.filename),
      }),
    };
  } else if (capture.change.kind === 'video-project') {
    const rows = capture.change.rows;
    if (!rows.mediaDependencies) throw new Error('Captured dependency evidence is missing.');
    dependencies = rows.mediaDependencies;
    const refs = new Map(rows.refs.map((ref) => [ref.assetId, ref]));
    const projectAssets = [];
    const ids = new Set(
      rows.project.project.assets.flatMap((asset) =>
        asset.source.kind === 'project-asset' ? [asset.source.projectAssetId] : []
      )
    );
    for (const [index, asset] of rows.assets.filter((asset) => ids.has(asset.id)).entries()) {
      const media = rows.media.find((entry) => entry.id === `project-asset:${asset.id}`);
      const filename = media?.filename ?? createReadableAssetFilename(index, asset.mimeType);
      const ref = refs.get(asset.assetId);
      if (!ref) throw new Error('Captured asset reference is missing.');
      projectAssets.push({
        entry: encodePortableVideoProjectAsset(asset),
        filename,
        objectId: await add(ref, filename),
        ...(media ? { libraryMediaId: media.id } : { publishToLibrary: false }),
      });
    }
    const projectExports = [];
    for (const entry of rows.exports) {
      const ref = refs.get(entry.assetId);
      if (!ref) throw new Error('Captured export reference is missing.');
      projectExports.push({
        entry: encodePortableVideoProjectExport(entry),
        objectId: await add(ref, entry.filename),
        ...(rows.media.some((media) => media.id === `export:${entry.id}`)
          ? { libraryMediaId: `export:${entry.id}` }
          : {}),
      });
    }
    metadata = {
      entry: {
        ...rows.project,
        project: encodePortableVideoProjectAssetRefs(rows.project.project),
      },
      projectAssets,
      projectExports,
    };
  } else throw new Error('Unsupported portable capture.');
  // The portable boundary accepts JSON without optional native undefined properties.
  const json: unknown = JSON.parse(JSON.stringify(metadata));
  assertPortableJson(json);
  const envelope = parseRootEnvelope({
    descriptor: {
      rootKind: capture.rootKind,
      rootId: capture.rootId,
      ...(capture.rootKind === 'media' ? { mediaSubtype: 'library-item' } : {}),
      metadataPath: 'Metadata/sync-root.json',
      objectCount: collector.objects.length,
      totalBytes: collector.objects.reduce((sum, object) => sum + object.ref.size, 0),
    },
    metadata: json,
    objects: collector.objects.map((object) => object.ref),
  });
  await parsePortableSyncRoot(envelope);
  return { envelope, objects: collector.objects, dependencies, bindings };
}

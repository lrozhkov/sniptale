import { isImageDataUrl } from '@sniptale/runtime-contracts/validation/data-url';
import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  parseEditorImageHistoryCheckpoint,
  type EditorImageHistoryCheckpoint,
  type EditorImageHistoryValue,
} from '../../../features/editor-history/image-checkpoint';
import {
  IMAGE_EDITOR_HISTORY_LIMITS,
  IMAGE_HISTORY_MAX_JSON_BYTES,
  type ImageEditorHistoryLimits,
} from '../../../features/editor-history/policy';
import { blobToDataUrl, dataUrlToBlob } from '../../../platform/media-utils/data-url';
import {
  collectPreparedAssetCleanupFailures,
  parseAssetRef,
  readAssetFile,
  writeBlobToAsset,
  type AssetRef,
  type PreparedAssetObject,
} from '../assets';
import {
  parsePersistedImageHistory,
  encodeImageHistoryMetadata,
  parseImageHistoryMetadata,
  imageHistoryAssetBindings,
  type PersistedImageHistory,
} from './history-contracts';

interface PreparedImageHistory {
  history: PersistedImageHistory;
  objects: PreparedAssetObject[];
  refs: AssetRef[];
  assetsByValue: ReadonlyMap<string, AssetRef>;
}

function imageRepresentation(value: string) {
  const comma = value.indexOf(',');
  const header = value.slice(0, comma + 1);
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const lastCharacter = value.at(-padding - 1);
  if (
    comma < 0 ||
    !isImageDataUrl(`${header}QUJDRA==`) ||
    !lastCharacter ||
    !/^[A-Za-z0-9+/]$/.test(lastCharacter)
  )
    throw new Error('Image history bitmap representation is invalid.');
  return {
    header,
    lastCharacter,
    padding,
  };
}

function imageMime(header: string): string {
  return header.slice(5).split(';', 1)[0]!.trim().toLowerCase();
}

/**
 * Stages an owner-captured graph. Exact immutable strings reuse byte refs; this index grants no
 * native revision authority. External/recovered graphs require complete hydration admission.
 */
export async function preparePersistedImageHistory(
  checkpoint: EditorImageHistoryCheckpoint,
  options: {
    formatVersion?: 1 | 2;
    reusableAssetsByValue?: ReadonlyMap<string, AssetRef>;
    reusableImagesByRuntimeUrl?: ReadonlyMap<string, AssetRef>;
  } = {}
): Promise<PreparedImageHistory> {
  const formatVersion = options.formatVersion ?? 2;
  const objects: PreparedAssetObject[] = [];
  const refs = new Map<string, AssetRef>();
  const assetsByValue = new Map<string, AssetRef>();
  const stage = async (value: string, kind: 'image' | 'json'): Promise<AssetRef> => {
    const previous =
      assetsByValue.get(value) ??
      options.reusableAssetsByValue?.get(value) ??
      (kind === 'image' ? options.reusableImagesByRuntimeUrl?.get(value) : undefined);
    const mime =
      kind === 'json' ? 'application/json' : imageMime(imageRepresentation(value).header);
    let ref: AssetRef;
    if (previous) {
      const parsed = parseAssetRef(previous);
      if (!parsed || parsed.mimeType.split(';', 1)[0]!.toLowerCase() !== mime)
        throw new Error('Reusable image history asset metadata is inconsistent.');
      ref = parsed;
    } else {
      if (kind === 'image' && !isImageDataUrl(value))
        throw new Error('Image history bitmap is invalid.');
      if (kind === 'json' && !isPlainRecord(JSON.parse(value) as unknown))
        throw new Error('Image history metadata must be an object.');
      const prepared = await writeBlobToAsset(
        kind === 'image' ? await dataUrlToBlob(value) : new Blob([value], { type: mime })
      );
      objects.push(prepared);
      ref = prepared.ref;
    }
    assetsByValue.set(value, ref);
    refs.set(ref.assetId, ref);
    return ref;
  };
  try {
    const jsonValues = checkpoint.values.filter(
      (unit): unit is EditorImageHistoryValue & { kind: 'json' } => unit.kind === 'json'
    );
    const packed =
      formatVersion === 2 ? encodeImageHistoryMetadata(checkpoint.snapshots, jsonValues) : null;
    if (packed && !options.reusableAssetsByValue?.has(packed))
      for (const text of [...checkpoint.snapshots, ...jsonValues.map((unit) => unit.value)])
        if (!isPlainRecord(JSON.parse(text) as unknown))
          throw new Error('Image history metadata must be an object.');
    const bundle = packed ? await stage(packed, 'json') : null;
    const values: PersistedImageHistory['values'][number][] = [];
    for (const unit of checkpoint.values) {
      const ref = unit.kind === 'json' && bundle ? bundle : await stage(unit.value, unit.kind);
      values.push(
        unit.kind === 'image'
          ? {
              id: unit.id,
              assetId: ref.assetId,
              kind: 'image',
              dataUrl: imageRepresentation(unit.value),
            }
          : { id: unit.id, assetId: ref.assetId, kind: 'json' }
      );
    }
    const snapshots: { assetId: string }[] = [];
    for (const snapshot of checkpoint.snapshots)
      snapshots.push({ assetId: (bundle ?? (await stage(snapshot, 'json'))).assetId });
    const history = parsePersistedImageHistory({
      version: formatVersion,
      epoch: checkpoint.epoch,
      cursor: checkpoint.cursor,
      snapshots,
      values,
      actions: checkpoint.actions,
    });
    if (!history) throw new Error('Image history reference envelope is invalid.');
    return { history, objects, refs: [...refs.values()], assetsByValue };
  } catch (error) {
    const failures = await collectPreparedAssetCleanupFailures(
      objects.map(({ ref }) => ref.assetId)
    );
    if (failures.length)
      throw new AggregateError([error, ...failures], 'Image history preparation cleanup failed.', {
        cause: error,
      });
    throw error;
  }
}

/** Reads immutable bytes once per asset and admits the complete retained graph before adoption. */
export async function hydratePersistedImageHistory(args: {
  history: unknown;
  refs: readonly unknown[];
  limits?: ImageEditorHistoryLimits;
}): Promise<{
  checkpoint: EditorImageHistoryCheckpoint;
  assetsByValue: ReadonlyMap<string, AssetRef>;
}> {
  const limits = args.limits ?? IMAGE_EDITOR_HISTORY_LIMITS;
  const history = parsePersistedImageHistory(args.history, limits);
  if (!history) throw new Error('Stored image history reference envelope is invalid.');
  const refs = new Map<string, AssetRef>();
  for (const raw of args.refs) {
    const ref = parseAssetRef(raw);
    if (!ref || refs.has(ref.assetId))
      throw new Error('Stored image history asset refs are invalid.');
    refs.set(ref.assetId, ref);
  }
  let metadataBytes = 0;
  for (const id of new Set(imageHistoryAssetBindings(history).map(({ assetId }) => assetId))) {
    const ref = refs.get(id);
    if (ref?.mimeType.split(';', 1)[0]!.toLowerCase() !== 'application/json') continue;
    metadataBytes += ref.size;
    if (metadataBytes > IMAGE_HISTORY_MAX_JSON_BYTES)
      throw new Error('Stored image history exceeds its metadata budget.');
  }
  const files = new Map<string, File>();
  const texts = new Map<string, string>();
  const images = new Map<string, string>();
  const assetsByValue = new Map<string, AssetRef>();
  const read = async (id: string, mime: string) => {
    const ref = refs.get(id);
    if (!ref || ref.mimeType.split(';', 1)[0]!.toLowerCase() !== mime)
      throw new Error('Stored image history resource is missing or has the wrong MIME type.');
    if (
      mime === 'application/json' &&
      ref.size > (history.version === 2 ? IMAGE_HISTORY_MAX_JSON_BYTES : 64 * 1024 * 1024)
    )
      throw new Error('Stored image history JSON exceeds its metadata bound.');
    let file = files.get(id);
    if (!file) {
      file = await readAssetFile(ref, `history-${id}`);
      if (file.size !== ref.size || file.type.split(';', 1)[0]!.toLowerCase() !== mime)
        throw new Error('Stored image history bytes do not match their reference.');
      files.set(id, file);
    }
    return { file, ref };
  };
  const readJson = async (id: string) => {
    const { file, ref } = await read(id, 'application/json');
    let value = texts.get(id);
    if (value === undefined) {
      value = await file.text();
      texts.set(id, value);
    }
    assetsByValue.set(value, ref);
    return value;
  };
  const packed =
    history.version === 2
      ? parseImageHistoryMetadata(
          JSON.parse(await readJson(history.snapshots[0]!.assetId)) as unknown,
          history
        )
      : null;
  const packedValues = new Map(packed?.values.map((entry) => [entry.id, entry.value]));
  const values: EditorImageHistoryValue[] = [];
  for (const unit of history.values) {
    if (unit.kind === 'json') {
      values.push({
        id: unit.id,
        kind: 'json',
        value: packed ? packedValues.get(unit.id)! : await readJson(unit.assetId),
      });
      continue;
    }
    const { file, ref } = await read(unit.assetId, imageMime(unit.dataUrl.header));
    let payload = images.get(unit.assetId);
    if (payload === undefined) {
      const dataUrl = await blobToDataUrl(file);
      payload = dataUrl.slice(dataUrl.indexOf(',') + 1).replace(/=+$/, '');
      images.set(unit.assetId, payload);
    }
    // Preserve spelling aliases only in unused base64 bits; metadata cannot alter immutable bytes.
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const remainder = payload.length % 4;
    const unusedBits = remainder === 2 ? 4 : remainder === 3 ? 2 : 0;
    if (
      !payload.length ||
      remainder === 1 ||
      (unit.dataUrl.padding !== 0 && unit.dataUrl.padding !== (4 - remainder) % 4) ||
      alphabet.indexOf(payload.at(-1)!) >> unusedBits !==
        alphabet.indexOf(unit.dataUrl.lastCharacter) >> unusedBits
    )
      throw new Error('Stored image history representation changes its immutable bytes.');
    const value =
      unit.dataUrl.header +
      payload.slice(0, -1) +
      unit.dataUrl.lastCharacter +
      '='.repeat(unit.dataUrl.padding);
    if (!isImageDataUrl(value)) throw new Error('Stored image history bitmap is invalid.');
    assetsByValue.set(value, ref);
    values.push({ id: unit.id, kind: 'image', value });
  }
  const snapshots: string[] = [];
  if (packed) snapshots.push(...packed.snapshots);
  else for (const { assetId } of history.snapshots) snapshots.push(await readJson(assetId));
  const admitted = parseEditorImageHistoryCheckpoint(
    { ...history, version: 1, snapshots, values },
    limits
  );
  if (!admitted) throw new Error('Stored image history graph is invalid.');
  return { checkpoint: admitted.checkpoint, assetsByValue };
}

import {
  IMAGE_EDITOR_HISTORY_LIMITS,
  IMAGE_HISTORY_MAX_VALUES,
} from '../../../../features/editor-history/policy';
import { isImageDataUrl } from '@sniptale/runtime-contracts/validation/data-url';
import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  parsePersistedImageHistory,
  encodeImageHistoryMetadata,
  parseImageHistoryMetadata,
  type PersistedImageHistory,
} from '../../../../composition/persistence/image-workspaces/history-contracts';
import {
  decodeEditorImageHistorySnapshot,
  IMAGE_HISTORY_VALUE_TOKEN_PREFIX,
  IMAGE_HISTORY_VALUE_INLINE_LIMIT,
} from '../../../../features/editor-history/image-snapshot';
import {
  EDITOR_IMAGE_HISTORY_DECODE_BOUNDS,
  EDITOR_IMAGE_HISTORY_PNG_METADATA_WITNESS,
} from '../../../../features/editor-history/image-checkpoint';
import { isEditorDocument } from '../../../../features/editor/document/public';

type NativeValue = PersistedImageHistory['values'][number];
type PortableValue =
  | { id: string; kind: 'json'; objectId: string }
  | {
      id: string;
      kind: 'image';
      objectId: string;
      /** MIME and encoding parameters only; the native data URL scheme is not portable content. */
      dataUrl: Extract<NativeValue, { kind: 'image' }>['dataUrl'];
    };

/** Archive references identify declared shared objects, never local asset rows or journal receipts. */
export interface PortableImageHistory extends Omit<PersistedImageHistory, 'snapshots' | 'values'> {
  snapshots: readonly { objectId: string }[];
  values: readonly PortableValue[];
}

function requireReference(references: ReadonlyMap<string, string>, id: string): string {
  const reference = references.get(id);
  if (!reference) throw new Error('Image history resource is missing from the archive inventory.');
  return reference;
}

export function encodePortableImageHistory(args: {
  history: PersistedImageHistory;
  objectsByAssetId: ReadonlyMap<string, string>;
  values?: readonly NativeValue[];
  snapshotObjectIds?: readonly string[];
}): PortableImageHistory {
  if (args.snapshotObjectIds && args.snapshotObjectIds.length !== args.history.snapshots.length)
    throw new Error('Image history snapshot inventory is incomplete.');
  return {
    ...args.history,
    snapshots: args.history.snapshots.map(({ assetId }, index) => {
      const objectId = args.snapshotObjectIds
        ? args.snapshotObjectIds[index]
        : requireReference(args.objectsByAssetId, assetId);
      if (!objectId) throw new Error('Image history snapshot inventory is incomplete.');
      return { objectId };
    }),
    values: (args.values ?? args.history.values).map(({ assetId, ...value }) => ({
      ...value,
      ...(value.kind === 'image'
        ? { dataUrl: { ...value.dataUrl, header: value.dataUrl.header.slice(5) } }
        : {}),
      objectId: requireReference(args.objectsByAssetId, assetId),
    })),
  };
}

function nativeValuePointer(value: unknown): Record<string, unknown> | null {
  const pointer = nativePointer(value);
  if (!pointer || pointer['kind'] !== 'image') return pointer;
  const dataUrl = pointer['dataUrl'];
  if (
    !isPlainRecord(dataUrl) ||
    typeof dataUrl['header'] !== 'string' ||
    dataUrl['header'].startsWith('data:')
  )
    return null;
  return { ...pointer, dataUrl: { ...dataUrl, header: `data:${dataUrl['header']}` } };
}

function nativePointer(value: unknown): Record<string, unknown> | null {
  if (
    !isPlainRecord(value) ||
    Object.hasOwn(value, 'assetId') ||
    typeof value['objectId'] !== 'string' ||
    !value['objectId']
  )
    return null;
  const { objectId, ...metadata } = value;
  return { ...metadata, assetId: objectId };
}

/** Uses the native envelope parser after validating the portable reference boundary. */
export function parsePortableImageHistory(value: unknown): PortableImageHistory | null {
  if (
    !isPlainRecord(value) ||
    !Array.isArray(value['snapshots']) ||
    !Array.isArray(value['values']) ||
    value['snapshots'].length > IMAGE_EDITOR_HISTORY_LIMITS.maxActions + 1 ||
    value['values'].length > IMAGE_HISTORY_MAX_VALUES
  )
    return null;
  const snapshots = value['snapshots'].map(nativePointer);
  const values = value['values'].map(nativeValuePointer);
  if (snapshots.some((entry) => !entry) || values.some((entry) => !entry)) return null;
  const native = parsePersistedImageHistory({ ...value, snapshots, values });
  if (!native) return null;
  const references = new Map([
    ...native.snapshots.map(({ assetId }) => [assetId, assetId] as const),
    ...native.values.map(({ assetId }) => [assetId, assetId] as const),
  ]);
  return encodePortableImageHistory({ history: native, objectsByAssetId: references });
}

export function decodePortableImageHistory(args: {
  history: unknown;
  assetsByObjectId: ReadonlyMap<string, string>;
}): PersistedImageHistory {
  const history = parsePortableImageHistory(args.history);
  if (!history) throw new Error('Portable image history is invalid.');
  return {
    ...history,
    snapshots: history.snapshots.map(({ objectId }) => ({
      assetId: requireReference(args.assetsByObjectId, objectId),
    })),
    values: history.values.map(({ objectId, ...value }) => ({
      ...value,
      ...(value.kind === 'image'
        ? { dataUrl: { ...value.dataUrl, header: `data:${value.dataUrl.header}` } }
        : {}),
      assetId: requireReference(args.assetsByObjectId, objectId),
    })),
  };
}

/** Projects compact metadata and discovers real token uses without reading bitmap payloads. */
export async function projectImageHistoryMetadata(args: {
  history: PersistedImageHistory;
  readJson(assetId: string): Promise<string>;
  projectSnapshot(snapshot: string): string;
}): Promise<{
  snapshots: readonly { assetId: string; json: string }[];
  values: readonly NativeValue[];
  packed?: string;
}> {
  const json = new Map<string, Promise<string>>();
  const readJson = (assetId: string) => {
    let pending = json.get(assetId);
    if (!pending) {
      pending = args.readJson(assetId);
      json.set(assetId, pending);
    }
    return pending;
  };
  const packed =
    args.history.version === 2
      ? parseImageHistoryMetadata(
          JSON.parse(await readJson(args.history.snapshots[0]!.assetId)) as unknown,
          args.history
        )
      : null;
  const packedValues = new Map(packed?.values.map((entry) => [entry.id, entry.value]));
  const units = new Map(args.history.values.map((unit) => [unit.id, unit]));
  const jsonValues = new Map<string, string>();
  for (const unit of args.history.values)
    if (unit.kind === 'json')
      jsonValues.set(unit.id, packed ? packedValues.get(unit.id)! : await readJson(unit.assetId));
  const used = new Set<string>();
  const snapshots: { assetId: string; json: string }[] = [];
  for (const [index, { assetId }] of args.history.snapshots.entries()) {
    const snapshot = args.projectSnapshot(
      packed ? packed.snapshots[index]! : await readJson(assetId)
    );
    const document = decodeEditorImageHistorySnapshot(
      snapshot,
      (token, kind) => {
        const unit = units.get(token);
        if (!unit) {
          if (
            token.startsWith(IMAGE_HISTORY_VALUE_TOKEN_PREFIX) ||
            (kind === 'image' && !isImageDataUrl(token)) ||
            token.length >= IMAGE_HISTORY_VALUE_INLINE_LIMIT
          )
            throw new Error('Image history resource reference is invalid.');
          return undefined;
        }
        if (unit.kind !== kind) throw new Error('Image history resource kind is invalid.');
        used.add(token);
        // The native checkpoint parser uses the same MIME witness for metadata admission.
        return unit.kind === 'image'
          ? unit.dataUrl.header === 'data:image/png;base64,'
            ? EDITOR_IMAGE_HISTORY_PNG_METADATA_WITNESS
            : `${unit.dataUrl.header}QUJDRA==`
          : jsonValues.get(token);
      },
      { bounds: EDITOR_IMAGE_HISTORY_DECODE_BOUNDS, requirePooledObjects: true }
    );
    if (!isEditorDocument(document)) throw new Error('Image history snapshot metadata is invalid.');
    snapshots.push({ assetId, json: snapshot });
  }
  const values = args.history.values.filter((unit) => used.has(unit.id));
  return {
    snapshots,
    values,
    ...(packed
      ? {
          packed: encodeImageHistoryMetadata(
            snapshots.map((entry) => entry.json),
            values
              .filter((entry) => entry.kind === 'json')
              .map((entry) => ({ id: entry.id, kind: 'json', value: jsonValues.get(entry.id)! }))
          ),
        }
      : {}),
  };
}

import { isWindowHeaderFavicon } from '@sniptale/runtime-contracts/window-header';
import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { isImageDataUrl } from '@sniptale/runtime-contracts/validation/data-url';
import { isEditorDocument } from '../editor/document/public';
import { parseEditorHistoryAction, type EditorHistoryAction } from './action';
import {
  IMAGE_EDITOR_HISTORY_LIMITS,
  IMAGE_HISTORY_MAX_VALUES,
  type ImageEditorHistoryLimits,
} from './policy';
import {
  decodeEditorImageHistorySnapshot,
  IMAGE_HISTORY_VALUE_TOKEN_PREFIX,
  IMAGE_HISTORY_VALUE_INLINE_LIMIT,
  type EditorImageHistoryValueKind,
} from './image-snapshot';

/** Shared traversal bounds for native and portable metadata admission. */
export const EDITOR_IMAGE_HISTORY_DECODE_BOUNDS = Object.freeze({
  maxDepth: 64,
  maxNodes: 100_000,
  maxObjectCharacters: 64 * 1024 * 1024,
});

/** Valid bounded PNG used only for metadata checks; never replaces persisted image bytes. */
export const EDITOR_IMAGE_HISTORY_PNG_METADATA_WITNESS =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlH0H8AAAAASUVORK5CYII=';

export interface EditorImageHistoryValue {
  id: string;
  kind: EditorImageHistoryValueKind;
  value: string;
}

/** Immutable runtime capture for the existing persistence adapter; binary values occur once. */
export interface EditorImageHistoryCheckpoint {
  version: 1;
  epoch: string;
  cursor: number;
  snapshots: readonly string[];
  values: readonly EditorImageHistoryValue[];
  actions: readonly (EditorHistoryAction | null)[];
}

interface AdmittedEditorImageHistory {
  privateFaviconsBySnapshot: (string | undefined)[];
  checkpoint: EditorImageHistoryCheckpoint;
  /** Resource closures and lengths are disposable admission indexes, not stored trust evidence. */
  tokensBySnapshot: readonly ReadonlySet<string>[];
  bytesByToken: ReadonlyMap<string, number>;
}

function parseValues(value: unknown): {
  values: EditorImageHistoryValue[];
  bytes: Map<string, number>;
  imageWitnesses: Map<string, string>;
} | null {
  if (!Array.isArray(value) || value.length > IMAGE_HISTORY_MAX_VALUES) return null;
  const values: EditorImageHistoryValue[] = [];
  const ids = new Set<string>();
  const contents = new Set<string>();
  const bytes = new Map<string, number>();
  const imageWitnesses = new Map<string, string>();
  const encoder = new TextEncoder();
  for (const raw of value) {
    if (
      !isPlainRecord(raw) ||
      Object.keys(raw).length !== 3 ||
      typeof raw['id'] !== 'string' ||
      !raw['id'].startsWith(IMAGE_HISTORY_VALUE_TOKEN_PREFIX) ||
      raw['id'].length <= IMAGE_HISTORY_VALUE_TOKEN_PREFIX.length ||
      raw['id'].length > 200 ||
      ids.has(raw['id']) ||
      typeof raw['value'] !== 'string' ||
      contents.has(raw['value']) ||
      (raw['kind'] !== 'image' && raw['kind'] !== 'json')
    )
      return null;
    if (
      raw['kind'] === 'image'
        ? !isImageDataUrl(raw['value'])
        : !isPlainRecord(JSON.parse(raw['value']) as unknown)
    )
      return null;
    if (raw['kind'] === 'image') {
      const mimeWitness = `${raw['value'].slice(0, raw['value'].indexOf(',') + 1)}QUJDRA==`;
      imageWitnesses.set(
        raw['id'],
        isWindowHeaderFavicon(raw['value'])
          ? EDITOR_IMAGE_HISTORY_PNG_METADATA_WITNESS
          : mimeWitness
      );
    }
    ids.add(raw['id']);
    contents.add(raw['value']);
    bytes.set(raw['id'], encoder.encode(raw['value']).byteLength);
    values.push({ id: raw['id'], kind: raw['kind'], value: raw['value'] });
  }
  return { values, bytes, imageWitnesses };
}

/** Strictly admits a detached retained graph without materializing the same image per state. */
export function parseEditorImageHistoryCheckpoint(
  value: unknown,
  limits: ImageEditorHistoryLimits = IMAGE_EDITOR_HISTORY_LIMITS
): AdmittedEditorImageHistory | null {
  try {
    if (
      !isPlainRecord(value) ||
      Object.keys(value).some(
        (key) => !['version', 'epoch', 'cursor', 'snapshots', 'values', 'actions'].includes(key)
      ) ||
      value['version'] !== 1 ||
      typeof value['epoch'] !== 'string' ||
      !value['epoch'].length ||
      value['epoch'].length > 200 ||
      !Array.isArray(value['snapshots']) ||
      !value['snapshots'].length ||
      value['snapshots'].length > limits.maxActions + 1 ||
      !value['snapshots'].every(
        (snapshot: unknown): snapshot is string => typeof snapshot === 'string'
      ) ||
      typeof value['cursor'] !== 'number' ||
      !Number.isSafeInteger(value['cursor']) ||
      value['cursor'] < 0 ||
      value['cursor'] >= value['snapshots'].length ||
      !Array.isArray(value['actions']) ||
      value['actions'].length !== value['snapshots'].length
    )
      return null;
    const parsed = parseValues(value['values']);
    if (!parsed) return null;
    const actions: (EditorHistoryAction | null)[] = [];
    for (const [index, raw] of value['actions'].entries()) {
      const action = parseEditorHistoryAction(raw);
      if (action === undefined || (index === 0 ? action !== null : action === null)) return null;
      actions.push(action);
    }
    const units = new Map(parsed.values.map((unit) => [unit.id, unit]));
    const tokensBySnapshot: Set<string>[] = [];
    const privateFaviconsBySnapshot: (string | undefined)[] = [];
    const reachable = new Set<string>();
    const encoder = new TextEncoder();
    let metadataBytes = 0;
    let minimumBaseline = Number.POSITIVE_INFINITY;
    let newestImages = 0;
    const separateImages = limits.maxAssetBytes !== undefined;
    for (const snapshot of value['snapshots']) {
      const tokens = new Set<string>();
      let favicon: string | undefined;
      let faviconUses = 0;
      const document = decodeEditorImageHistorySnapshot(
        snapshot,
        (token, kind) => {
          if (!token.startsWith(IMAGE_HISTORY_VALUE_TOKEN_PREFIX)) {
            if (
              (kind === 'image' && !isImageDataUrl(token)) ||
              token.length >= IMAGE_HISTORY_VALUE_INLINE_LIMIT
            )
              throw new Error('Image history resources must use canonical pooled values.');
            return undefined;
          }
          const unit = units.get(token);
          if (!unit || unit.kind !== kind)
            throw new Error('Invalid image history resource reference.');
          tokens.add(token);
          reachable.add(token);
          if (token === favicon) faviconUses++;
          // Preserve the MIME contract (retained masks require PNG), after validating the real value once.
          return kind === 'image' ? parsed.imageWitnesses.get(unit.id)! : unit.value;
        },
        {
          bounds: EDITOR_IMAGE_HISTORY_DECODE_BOUNDS,
          requirePooledObjects: true,
          visitFaviconReference: (token) => {
            favicon = token;
          },
        }
      );
      if (!isEditorDocument(document)) return null;
      const bytes = encoder.encode(snapshot).byteLength;
      metadataBytes += bytes;
      let baseline = bytes;
      newestImages = 0;
      for (const token of tokens) {
        if (separateImages && units.get(token)!.kind === 'image')
          newestImages += parsed.bytes.get(token)!;
        else baseline += parsed.bytes.get(token)!;
      }
      minimumBaseline = Math.min(minimumBaseline, baseline);
      tokensBySnapshot.push(tokens);
      privateFaviconsBySnapshot.push(faviconUses === 1 ? favicon : undefined);
    }
    if (reachable.size !== parsed.values.length) return null;
    let total = metadataBytes;
    let images = 0;
    for (const token of reachable) {
      if (separateImages && units.get(token)!.kind === 'image') images += parsed.bytes.get(token)!;
      else total += parsed.bytes.get(token)!;
    }
    if (total - minimumBaseline > limits.maxBytes) return null;
    if (limits.maxAssetBytes !== undefined) {
      const favicon = privateFaviconsBySnapshot.at(-1);
      // A redacted favicon counts only when another layer will still need its bytes.
      const sharedFaviconBytes =
        favicon &&
        tokensBySnapshot.some(
          (tokens, index) => privateFaviconsBySnapshot[index] !== favicon && tokens.has(favicon)
        )
          ? (parsed.bytes.get(favicon) ?? 0)
          : 0;
      if (images - newestImages + sharedFaviconBytes > limits.maxAssetBytes) return null;
    }
    return {
      checkpoint: {
        version: 1,
        epoch: value['epoch'],
        cursor: value['cursor'],
        snapshots: [...value['snapshots']],
        values: parsed.values,
        actions,
      },
      tokensBySnapshot,
      privateFaviconsBySnapshot,
      bytesByToken: parsed.bytes,
    };
  } catch {
    return null;
  }
}

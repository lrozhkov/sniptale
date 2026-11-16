import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { isImageDataUrl } from '@sniptale/runtime-contracts/validation/data-url';
import {
  parseEditorHistoryAction,
  type EditorHistoryAction,
} from '../../../features/editor-history/action';
import {
  IMAGE_EDITOR_HISTORY_LIMITS,
  IMAGE_HISTORY_MAX_VALUES,
} from '../../../features/editor-history/policy';
import { IMAGE_HISTORY_VALUE_TOKEN_PREFIX } from '../../../features/editor-history/image-snapshot';

interface ImageHistoryDataUrl {
  header: string;
  lastCharacter: string;
  padding: number;
}

type PersistedImageHistoryValue =
  | { id: string; assetId: string; kind: 'json' }
  | { id: string; assetId: string; kind: 'image'; dataUrl: ImageHistoryDataUrl };

/** Native history owns immutable bytes through ordinary asset references, not embedded payloads. */
export interface PersistedImageHistory {
  version: 1;
  epoch: string;
  cursor: number;
  snapshots: readonly { assetId: string }[];
  values: readonly PersistedImageHistoryValue[];
  actions: readonly (EditorHistoryAction | null)[];
}

function assetId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function parseValue(value: unknown): PersistedImageHistoryValue | null {
  if (
    !isPlainRecord(value) ||
    typeof value['id'] !== 'string' ||
    !value['id'].startsWith(IMAGE_HISTORY_VALUE_TOKEN_PREFIX) ||
    value['id'].length <= IMAGE_HISTORY_VALUE_TOKEN_PREFIX.length ||
    value['id'].length > 200 ||
    !assetId(value['assetId'])
  )
    return null;
  const { id, assetId: reference } = value;
  if (value['kind'] === 'json' && Object.keys(value).length === 3)
    return { id, assetId: reference, kind: 'json' };
  const dataUrl = value['dataUrl'];
  if (
    value['kind'] !== 'image' ||
    Object.keys(value).length !== 4 ||
    !isPlainRecord(dataUrl) ||
    Object.keys(dataUrl).length !== 3 ||
    typeof dataUrl['header'] !== 'string' ||
    !dataUrl['header'].endsWith(',') ||
    dataUrl['header'].indexOf(',') !== dataUrl['header'].length - 1 ||
    !isImageDataUrl(`${dataUrl['header']}QUJDRA==`) ||
    typeof dataUrl['lastCharacter'] !== 'string' ||
    !/^[A-Za-z0-9+/]$/.test(dataUrl['lastCharacter']) ||
    typeof dataUrl['padding'] !== 'number' ||
    !Number.isInteger(dataUrl['padding']) ||
    dataUrl['padding'] < 0 ||
    dataUrl['padding'] > 2
  )
    return null;
  return {
    id,
    assetId: reference,
    kind: 'image',
    dataUrl: {
      header: dataUrl['header'],
      lastCharacter: dataUrl['lastCharacter'],
      padding: dataUrl['padding'],
    },
  };
}

/** Parses the native reference envelope. Hydration separately admits the actual immutable bytes. */
export function parsePersistedImageHistory(
  value: unknown,
  limits: Readonly<{ maxActions: number }> = IMAGE_EDITOR_HISTORY_LIMITS
): PersistedImageHistory | null {
  if (
    !isPlainRecord(value) ||
    Object.keys(value).length !== 6 ||
    value['version'] !== 1 ||
    typeof value['epoch'] !== 'string' ||
    !value['epoch'].length ||
    value['epoch'].length > 200 ||
    !Array.isArray(value['snapshots']) ||
    !value['snapshots'].length ||
    value['snapshots'].length > limits.maxActions + 1 ||
    typeof value['cursor'] !== 'number' ||
    !Number.isSafeInteger(value['cursor']) ||
    value['cursor'] < 0 ||
    value['cursor'] >= value['snapshots'].length ||
    !Array.isArray(value['actions']) ||
    value['actions'].length !== value['snapshots'].length ||
    !Array.isArray(value['values']) ||
    value['values'].length > IMAGE_HISTORY_MAX_VALUES
  )
    return null;
  const snapshots: { assetId: string }[] = [];
  for (const raw of value['snapshots']) {
    if (!isPlainRecord(raw) || Object.keys(raw).length !== 1 || !assetId(raw['assetId']))
      return null;
    snapshots.push({ assetId: raw['assetId'] });
  }
  const values: PersistedImageHistoryValue[] = [];
  const ids = new Set<string>();
  for (const raw of value['values']) {
    const parsed = parseValue(raw);
    if (!parsed || ids.has(parsed.id)) return null;
    ids.add(parsed.id);
    values.push(parsed);
  }
  const actions: (EditorHistoryAction | null)[] = [];
  for (const [index, raw] of value['actions'].entries()) {
    const action = parseEditorHistoryAction(raw);
    if (action === undefined || (index === 0 ? action !== null : action === null)) return null;
    actions.push(action);
  }
  return { version: 1, epoch: value['epoch'], cursor: value['cursor'], snapshots, values, actions };
}

/** Stable byte roles are shared by publication, deletion, backup, sync and physical retention. */
export function imageHistoryAssetBindings(
  history: PersistedImageHistory | null | undefined
): { assetId: string; role: string }[] {
  if (!history) return [];
  return [
    ...[...new Set(history.snapshots.map(({ assetId }) => assetId))].map((assetId) => ({
      assetId,
      role: `history:snapshot:${assetId}`,
    })),
    ...history.values.map(({ id, assetId }) => ({ assetId, role: `history:value:${id}` })),
  ];
}

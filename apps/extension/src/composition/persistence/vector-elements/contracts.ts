import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  isEditorVectorSourceToken,
  type EditorVectorSourceToken,
} from '../../../features/editor/vector-catalog';

/** Stable backing identity is separate from visible local-library membership. */
export interface EditorVectorBacking {
  key: string;
  kind: 'definition';
  definitionId: string;
  assetId: string;
  incarnation: string;
  retained: boolean;
}

export const EDITOR_VECTOR_OWNER_KIND = 'editor-vector-definition';
export const EDITOR_VECTOR_PUBLICATION_DOMAIN = 'editor-vector-definition';

/** Invalid authoritative evidence cannot authorize retirement or publication replacement. */
export function parseEditorVectorBacking(value: unknown): EditorVectorBacking | null {
  if (
    !isRecord(value) ||
    value['kind'] !== 'definition' ||
    typeof value['definitionId'] !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(value['definitionId']) ||
    value['key'] !== `definition:${value['definitionId']}` ||
    typeof value['assetId'] !== 'string' ||
    !value['assetId'] ||
    typeof value['incarnation'] !== 'string' ||
    !value['incarnation'] ||
    typeof value['retained'] !== 'boolean'
  )
    return null;
  return {
    key: value['key'],
    kind: 'definition',
    definitionId: value['definitionId'],
    assetId: value['assetId'],
    incarnation: value['incarnation'],
    retained: value['retained'],
  };
}

import {
  isEditorVectorColor,
  isEditorVectorInstance,
} from '../../../features/editor/document/vector-element';

export interface EditorVectorItem {
  key: string;
  kind: 'item';
  definitionId: string;
  incarnation: string;
  revision: number;
  imported: boolean;
  favorite: boolean;
  usedAt: number | null;
  deleted: boolean;
  name: string | null;
  prefix: string | null;
  receivedAt: number;
}
export interface EditorVectorCollection {
  key: string;
  kind: 'collection';
  id: string;
  incarnation: string;
  revision: number;
  name: string;
  deleted: boolean;
}
export interface EditorVectorMember {
  key: string;
  kind: 'member';
  definitionId: string;
  collectionId: string;
  collectionIncarnation: string;
  name: string | null;
}
export interface EditorVectorSettings {
  key: 'settings';
  kind: 'settings';
  incarnation: string;
  revision: number;
  baseUrl: string;
  networkEnabled: boolean;
  disclosureAccepted: boolean;
  sourceGeneration: number;
}
export interface EditorVectorCollectionToken {
  id: string;
  incarnation: string;
}
export interface EditorVectorItemToken {
  incarnation: string;
  revision: number;
}
export interface EditorVectorDownloadToken {
  collection: EditorVectorCollectionToken;
  source: EditorVectorSourceToken | null;
  incarnation: string;
  generation: number;
}
export interface EditorVectorDownload {
  /** Explicit provider prefix; older metadata without this field remains readable. */
  prefix?: string;
  key: string;
  kind: 'download';
  collectionId: string;
  collectionIncarnation: string;
  incarnation: string;
  generation: number;
  source: EditorVectorSourceToken | null;
  manifest: string[];
  accepted: Record<string, string>;
  status: 'downloading' | 'partial' | 'ready' | 'error';
  error: string | null;
}
export interface EditorVectorPreset {
  key: string;
  kind: 'preset';
  id: string;
  name: string;
  incarnation: string;
  revision: number;
  deleted: boolean;
  style:
    | { kind: 'monochrome'; color: string }
    | {
        kind: 'definition';
        definitionId: string;
        colors: Record<string, string>;
        strokeScale: number;
      };
}
export interface EditorVectorCacheRow {
  key: string;
  kind: 'cache';
  cacheKind: 'search' | 'collections' | 'definition';
  sourceId: string;
  createdAt: number;
  touchedAt: number;
  expiresAt: number;
  size: number;
  payload: unknown;
}
export interface EditorVectorPublicationIntent {
  kind: 'used' | 'import' | 'favorite' | 'download';
  collection?: EditorVectorCollectionToken;
  source?: EditorVectorSourceToken;
  expectedItem?: EditorVectorItemToken | null;
  download?: EditorVectorDownloadToken;
  name?: string;
}
export type EditorVectorLibraryRow =
  | EditorVectorBacking
  | EditorVectorItem
  | EditorVectorCollection
  | EditorVectorMember
  | EditorVectorSettings
  | EditorVectorDownload
  | EditorVectorPreset
  | EditorVectorCacheRow;

export const DEFAULT_EDITOR_VECTOR_SOURCE = 'https://api.iconify.design/';
const digest = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const text = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 2048 &&
  Array.from(value).every((character) => character.charCodeAt(0) >= 32);
const revision = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const time = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
export function isEditorVectorCollectionToken(
  value: unknown
): value is EditorVectorCollectionToken {
  return isRecord(value) && text(value['id']) && text(value['incarnation']);
}
export function isEditorVectorItemToken(value: unknown): value is EditorVectorItemToken {
  return isRecord(value) && text(value['incarnation']) && revision(value['revision']);
}
export function isEditorVectorDownloadToken(value: unknown): value is EditorVectorDownloadToken {
  return (
    isRecord(value) &&
    isEditorVectorCollectionToken(value['collection']) &&
    (value['source'] === null || isEditorVectorSourceToken(value['source'])) &&
    text(value['incarnation']) &&
    revision(value['generation'])
  );
}
export function isEditorVectorPublicationIntent(
  value: unknown
): value is EditorVectorPublicationIntent {
  return (
    isRecord(value) &&
    ['used', 'import', 'favorite', 'download'].includes(
      typeof value['kind'] === 'string' ? value['kind'] : ''
    ) &&
    (value['collection'] === undefined || isEditorVectorCollectionToken(value['collection'])) &&
    (value['source'] === undefined || isEditorVectorSourceToken(value['source'])) &&
    (value['expectedItem'] === undefined ||
      value['expectedItem'] === null ||
      isEditorVectorItemToken(value['expectedItem'])) &&
    (value['download'] === undefined || isEditorVectorDownloadToken(value['download'])) &&
    (value['name'] === undefined || text(value['name'])) &&
    (value['kind'] !== 'download' ||
      (isEditorVectorDownloadToken(value['download']) &&
        text(value['name']) &&
        isEditorVectorCollectionToken(value['collection']) &&
        value['collection'].id === value['download'].collection.id &&
        value['collection'].incarnation === value['download'].collection.incarnation &&
        (value['download'].source === null
          ? value['source'] === undefined
          : isEditorVectorSourceToken(value['source']) &&
            value['source'].sourceId === value['download'].source.sourceId &&
            value['source'].incarnation === value['download'].source.incarnation &&
            value['source'].generation === value['download'].source.generation)))
  );
}
export function isEditorVectorItem(value: unknown): value is EditorVectorItem {
  return (
    isRecord(value) &&
    value['kind'] === 'item' &&
    digest(value['definitionId']) &&
    value['key'] === `item:${value['definitionId']}` &&
    text(value['incarnation']) &&
    revision(value['revision']) &&
    typeof value['favorite'] === 'boolean' &&
    typeof value['imported'] === 'boolean' &&
    typeof value['deleted'] === 'boolean' &&
    (value['usedAt'] === null || time(value['usedAt'])) &&
    (value['name'] === null || text(value['name'])) &&
    (value['prefix'] === null || text(value['prefix'])) &&
    time(value['receivedAt'])
  );
}
export function isEditorVectorCollection(value: unknown): value is EditorVectorCollection {
  return (
    isRecord(value) &&
    value['kind'] === 'collection' &&
    text(value['id']) &&
    /^[a-zA-Z0-9_-]{1,128}$/u.test(value['id']) &&
    value['key'] === `collection:${value['id']}` &&
    text(value['incarnation']) &&
    revision(value['revision']) &&
    text(value['name']) &&
    value['name'].length <= 120 &&
    typeof value['deleted'] === 'boolean'
  );
}
export function isEditorVectorMember(value: unknown): value is EditorVectorMember {
  return (
    isRecord(value) &&
    value['kind'] === 'member' &&
    digest(value['definitionId']) &&
    text(value['collectionId']) &&
    value['key'] === `member:${value['collectionId']}:${value['definitionId']}` &&
    text(value['collectionIncarnation']) &&
    (value['name'] === null || text(value['name']))
  );
}
export function isEditorVectorSettings(value: unknown): value is EditorVectorSettings {
  return (
    isRecord(value) &&
    value['kind'] === 'settings' &&
    value['key'] === 'settings' &&
    text(value['incarnation']) &&
    revision(value['revision']) &&
    text(value['baseUrl']) &&
    typeof value['networkEnabled'] === 'boolean' &&
    typeof value['disclosureAccepted'] === 'boolean' &&
    revision(value['sourceGeneration'])
  );
}
export const isEditorVectorDownloadPrefix = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= 128 &&
  value.split('-').every((part) => /^[a-z0-9]+$/u.test(part));

export function isEditorVectorDownload(value: unknown): value is EditorVectorDownload {
  if (!isRecord(value)) return false;
  const manifest = value['manifest'];
  if (
    !Array.isArray(manifest) ||
    !manifest.every(text) ||
    new Set(manifest).size !== manifest.length ||
    !isRecord(value['accepted'])
  )
    return false;
  return (
    value['kind'] === 'download' &&
    (value['prefix'] === undefined || isEditorVectorDownloadPrefix(value['prefix'])) &&
    text(value['collectionId']) &&
    value['key'] === `download:${value['collectionId']}` &&
    text(value['collectionIncarnation']) &&
    text(value['incarnation']) &&
    revision(value['generation']) &&
    (value['source'] === null || isEditorVectorSourceToken(value['source'])) &&
    Object.entries(value['accepted']).every(
      ([name, id]) => manifest.includes(name) && digest(id)
    ) &&
    ['downloading', 'partial', 'ready', 'error'].includes(
      typeof value['status'] === 'string' ? value['status'] : ''
    ) &&
    (value['error'] === null || text(value['error'])) &&
    (value['status'] !== 'ready' ||
      manifest.every((name) => Object.hasOwn(value['accepted'] ?? {}, name)))
  );
}
export function isEditorVectorPreset(value: unknown): value is EditorVectorPreset {
  if (
    !isRecord(value) ||
    value['kind'] !== 'preset' ||
    !text(value['id']) ||
    value['key'] !== `preset:${value['id']}` ||
    !text(value['name']) ||
    value['name'].length > 120 ||
    !text(value['incarnation']) ||
    !revision(value['revision']) ||
    typeof value['deleted'] !== 'boolean' ||
    !isRecord(value['style'])
  )
    return false;
  const style = value['style'];
  return style['kind'] === 'monochrome'
    ? isEditorVectorColor(style['color'])
    : style['kind'] === 'definition' &&
        isEditorVectorInstance({
          version: 1,
          definitionId: style['definitionId'],
          overrides: { colors: style['colors'], strokeScale: style['strokeScale'] },
        });
}
export function isEditorVectorCacheRow(value: unknown): value is EditorVectorCacheRow {
  return (
    isRecord(value) &&
    value['kind'] === 'cache' &&
    text(value['key']) &&
    value['key'].startsWith('cache:') &&
    ['search', 'collections', 'definition'].includes(
      typeof value['cacheKind'] === 'string' ? value['cacheKind'] : ''
    ) &&
    text(value['sourceId']) &&
    time(value['createdAt']) &&
    time(value['touchedAt']) &&
    time(value['expiresAt']) &&
    revision(value['size']) &&
    Object.hasOwn(value, 'payload')
  );
}
export function isEditorVectorLibraryRow(value: unknown): value is EditorVectorLibraryRow {
  return (
    parseEditorVectorBacking(value) !== null ||
    isEditorVectorItem(value) ||
    isEditorVectorCollection(value) ||
    isEditorVectorMember(value) ||
    isEditorVectorSettings(value) ||
    isEditorVectorDownload(value) ||
    isEditorVectorPreset(value) ||
    isEditorVectorCacheRow(value)
  );
}
export function editorVectorItemHasMembership(item: EditorVectorItem): boolean {
  return !item.deleted && (item.favorite || item.imported || item.usedAt !== null);
}

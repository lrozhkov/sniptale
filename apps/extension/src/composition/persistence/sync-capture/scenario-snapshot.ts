import type { IDBPTransaction } from 'idb';
import { sha256 } from '@noble/hashes/sha2.js';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { getScenarioResourceReferences } from '../../../features/scenario/project/public';
import { parseAssetRef } from '../assets/guards';
import type { AssetRef } from '../assets/contracts';
import type {
  ScenarioProjectEntry,
  ScenarioAssetEntry,
  ScenarioExportEntry,
  StoredScenarioStepEditorDocumentEntry,
} from '../scenario/contracts';
import {
  parseScenarioProjectEntry,
  parseScenarioAssetEntry,
  parseScenarioExportEntry,
} from '../scenario/read-guards';
import { parseScenarioStepEditorDocumentEntry } from '../scenario/editor-documents/index.guards';
import { readScenarioStorage } from '../scenario/storage';
import { SCENARIO_HISTORY_BYTE_LIMIT, SCENARIO_HISTORY_LIMIT } from '../scenario/history-model';
import { parseMediaLibraryEntry, parseMediaThumbnailEntry } from '../media-library/read-guards';
import type { MediaLibraryEntry, MediaThumbnailEntry } from '../media-library/contracts';
import type { AggregatePresentationEntry } from '../aggregate-presentations/contracts';
import { parseAggregatePresentationEntry } from '../aggregate-presentations/parser';
import * as stores from '../infrastructure/indexed-db/core.stores';
import { captureProfileBounds, type CapturedMediaDependency } from './contracts';
import { describeImageMetadata } from './image-snapshot';

export const MAX_NATIVE_SCENARIO_HISTORY_BYTES =
  SCENARIO_HISTORY_BYTE_LIMIT + SCENARIO_HISTORY_LIMIT + 1;

/** One native writer snapshot; large retained versions remain immutable inline bytes until preparation. */
export interface CapturedScenarioRows {
  entry: Omit<ScenarioProjectEntry, 'history'>;
  history?: { blob: Blob; sha256: string };
  assets: ScenarioAssetEntry[];
  documents: StoredScenarioStepEditorDocumentEntry[];
  exports: ScenarioExportEntry[];
  refs: AssetRef[];
  media: MediaLibraryEntry[];
  thumbnails: MediaThumbnailEntry[];
  presentation: AggregatePresentationEntry | null;
  mediaDependencies?: CapturedMediaDependency[];
}

/** Stores required for a complete native Scenario after-image, including borrowed source admission. */
export const SCENARIO_CAPTURE_STORES = [
  stores.SYNC_CAPTURE_STORE,
  stores.SCENARIO_PROJECTS_STORE,
  stores.SCENARIO_PROJECT_HISTORY_STORE,
  stores.SCENARIO_PROJECT_UNITS_STORE,
  stores.SCENARIO_ASSETS_STORE,
  stores.SCENARIO_EXPORTS_STORE,
  stores.SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
  stores.MEDIA_LIBRARY_STORE,
  stores.ASSET_REFS_STORE,
  stores.ASSET_OWNERS_STORE,
  stores.PROJECT_ASSETS_STORE,
  stores.PROJECT_EXPORTS_STORE,
  stores.STORE_NAME,
  stores.RECORDING_TELEMETRY_STORE,
  stores.IMAGE_WORKSPACES_STORE,
  stores.VIDEO_WORKSPACES_STORE,
  stores.VIDEO_WORKSPACE_HISTORY_STORE,
  stores.VIDEO_WORKSPACE_DRAFTS_STORE,
  stores.THUMBNAILS_STORE,
  stores.AGGREGATE_PRESENTATIONS_STORE,
];

function invalid(): never {
  throw new Error('Invalid native Scenario sync snapshot.');
}

/** Bound the Scenario archive profile without counting immutable inline binary bytes as JSON. */
export function isBoundedScenarioMetadata(value: unknown, allowBlobs = true): boolean {
  const limit = captureProfileBounds('scenario-project').metadataBytes;
  const active = new WeakSet<object>();
  let visits = 0;
  let characters = 0;
  function visit(item: unknown, depth: number): boolean {
    if (++visits > limit || depth > 64) return false;
    if (item instanceof Blob) return allowBlobs && Number.isSafeInteger(item.size);
    if (typeof item === 'string') {
      characters += item.length;
      return characters <= limit;
    }
    if (item === null || item === undefined || typeof item === 'boolean') return true;
    if (typeof item === 'number') return Number.isFinite(item);
    if (
      typeof item !== 'object' ||
      active.has(item) ||
      (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype)
    )
      return false;
    active.add(item);
    const valid = Object.entries(item).every(([key, child]) => {
      characters += key.length;
      return characters <= limit && visit(child, depth + 1);
    });
    active.delete(item);
    return valid;
  }
  return (
    visit(value, 0) &&
    new TextEncoder().encode(JSON.stringify(describeImageMetadata(value))).byteLength <= limit
  );
}

function rows<T>(value: unknown, parser: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(value) || value.length > captureProfileBounds('scenario-project').rows)
    return null;
  const parsed = value.map(parser);
  return parsed.some((item) => item === null) ? null : parsed.filter((item) => item !== null);
}

function parseHistoryDescriptor(value: unknown): CapturedScenarioRows['history'] | null {
  if (value === undefined) return undefined;
  if (
    !isRecord(value) ||
    !(value['blob'] instanceof Blob) ||
    value['blob'].type !== 'application/json' ||
    value['blob'].size > MAX_NATIVE_SCENARIO_HISTORY_BYTES ||
    typeof value['sha256'] !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(value['sha256'])
  )
    return null;
  return { blob: value['blob'], sha256: value['sha256'] };
}

function parseScenarioMediaDependencies(
  value: unknown,
  media: readonly MediaLibraryEntry[]
): CapturedMediaDependency[] | undefined | null {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length !== media.length) return null;
  const dependencies: CapturedMediaDependency[] = [];
  const entries: unknown[] = value;
  for (const raw of entries) {
    if (
      !isRecord(raw) ||
      typeof raw['mediaId'] !== 'string' ||
      !media.some((item) => item.id === raw['mediaId']) ||
      typeof raw['generation'] !== 'number' ||
      !Number.isSafeInteger(raw['generation']) ||
      raw['generation'] < 1 ||
      !Array.isArray(raw['basis']) ||
      raw['basis'].length !== 1 ||
      typeof raw['basis'][0] !== 'string'
    )
      return null;
    dependencies.push({
      mediaId: raw['mediaId'],
      generation: raw['generation'],
      basis: [raw['basis'][0]],
    });
  }
  return new Set(dependencies.map((item) => item.mediaId)).size === dependencies.length
    ? dependencies
    : null;
}

function matchesScenarioResources(snapshot: CapturedScenarioRows): boolean {
  const { entry, assets, documents, exports, refs, media, thumbnails } = snapshot;
  const identities = [
    assets.map((item) => item.id),
    documents.map((item) => item.stepId),
    exports.map((item) => item.id),
    refs.map((item) => item.assetId),
    media.map((item) => item.id),
    thumbnails.map((item) => item.assetId),
  ];
  if (
    identities.some((ids) => new Set(ids).size !== ids.length) ||
    [...assets, ...documents, ...exports].some((item) => item.projectId !== entry.id)
  )
    return false;
  const declared = new Map(refs.map((ref) => [ref.assetId, ref]));
  const required = new Set<string>();
  for (const asset of assets) {
    const ref = declared.get(asset.assetId);
    if (!ref || ref.size !== asset.size || ref.mimeType !== asset.mimeType) return false;
    required.add(asset.assetId);
  }
  for (const document of documents)
    for (const asset of document.document.assets) required.add(asset.assetId);
  for (const item of exports) if (item.html) required.add(item.html.assetId);
  if (required.size !== declared.size || [...required].some((id) => !declared.has(id)))
    return false;
  const current = getScenarioResourceReferences(entry.project);
  return (
    ![...current.assets].some((id) => !assets.some((asset) => asset.id === id)) &&
    ![...current.documents].some((id) => !documents.some((document) => document.stepId === id))
  );
}

function matchesScenarioPresentation(snapshot: CapturedScenarioRows): boolean {
  const { entry, presentation, thumbnails, exports } = snapshot;
  if (
    presentation &&
    (presentation.aggregateKind !== 'scenario' ||
      presentation.aggregateId !== entry.id ||
      presentation.presentationRevision > entry.workspaceRevision)
  )
    return false;
  return !thumbnails.some(
    (item) =>
      item.assetId !== `scenario:${entry.id}` &&
      !exports.some((output) => item.assetId === `scenario-export:${output.id}`)
  );
}

/** Native parsers own document/history semantics; this parser binds the exact frozen resource table. */
export function parseCapturedScenarioRows(value: unknown): CapturedScenarioRows | null {
  if (!isRecord(value) || !isBoundedScenarioMetadata(value)) return null;
  if (
    Object.keys(value).some(
      (key) =>
        ![
          'entry',
          'history',
          'assets',
          'documents',
          'exports',
          'refs',
          'media',
          'thumbnails',
          'presentation',
          'mediaDependencies',
        ].includes(key)
    )
  )
    return null;
  const entry = parseScenarioProjectEntry(value['entry']);
  const assets = rows(value['assets'], parseScenarioAssetEntry);
  const documents = rows(value['documents'], parseScenarioStepEditorDocumentEntry);
  const exports = rows(value['exports'], parseScenarioExportEntry);
  const refs = rows(value['refs'], parseAssetRef);
  const media = rows(value['media'], parseMediaLibraryEntry);
  const thumbnails = rows(value['thumbnails'], parseMediaThumbnailEntry);
  const presentation =
    value['presentation'] === null ? null : parseAggregatePresentationEntry(value['presentation']);
  const history = parseHistoryDescriptor(value['history']);
  if (
    !entry ||
    entry.history?.length ||
    !assets ||
    !documents ||
    !exports ||
    !refs ||
    !media ||
    !thumbnails ||
    (value['presentation'] !== null && !presentation) ||
    history === null
  )
    return null;
  const dependencies = parseScenarioMediaDependencies(value['mediaDependencies'], media);
  if (dependencies === null) return null;
  const snapshot: CapturedScenarioRows = {
    entry,
    assets,
    documents,
    exports,
    refs,
    media,
    thumbnails,
    presentation,
    ...(history === undefined ? {} : { history }),
    ...(dependencies === undefined ? {} : { mediaDependencies: dependencies }),
  };
  return matchesScenarioResources(snapshot) && matchesScenarioPresentation(snapshot)
    ? snapshot
    : null;
}

type ScenarioReadTransaction = IDBPTransaction<unknown, string[], 'readonly' | 'readwrite'>;

async function readScenarioChildRows<T>(
  tx: ScenarioReadTransaction,
  store: string,
  id: string,
  parse: (raw: unknown) => T | null
): Promise<T[]> {
  const raw: unknown = await tx.objectStore(store).index('projectId').getAll(id);
  return rows(raw, parse) ?? invalid();
}

async function readScenarioResourceRefs(
  tx: ScenarioReadTransaction,
  assets: readonly ScenarioAssetEntry[],
  documents: readonly StoredScenarioStepEditorDocumentEntry[],
  exports: readonly ScenarioExportEntry[]
): Promise<unknown[]> {
  const ids = new Set(assets.map((asset) => asset.assetId));
  for (const document of documents)
    for (const asset of document.document.assets) ids.add(asset.assetId);
  for (const output of exports) if (output.html) ids.add(output.html.assetId);
  const refs: unknown[] = [];
  for (const id of ids) refs.push(await tx.objectStore(stores.ASSET_REFS_STORE).get(id));
  return refs;
}

async function readScenarioLibraryMedia(
  tx: ScenarioReadTransaction,
  assets: readonly ScenarioAssetEntry[]
) {
  const media = new Map<string, unknown>();
  for (const asset of assets) {
    const id = asset.borrowedMediaId ?? asset.galleryAssetId ?? `scenario-asset:${asset.id}`;
    const source: unknown = await tx.objectStore(stores.MEDIA_LIBRARY_STORE).get(id);
    if (source !== undefined) media.set(id, source);
    else if (asset.borrowedMediaId || asset.galleryAssetId) invalid();
  }
  return [...media.values()];
}

async function readScenarioThumbnails(
  tx: ScenarioReadTransaction,
  id: string,
  exports: readonly ScenarioExportEntry[]
) {
  const thumbnails: unknown[] = [];
  for (const key of [`scenario:${id}`, ...exports.map((item) => `scenario-export:${item.id}`)]) {
    const raw: unknown = await tx.objectStore(stores.THUMBNAILS_STORE).get(key);
    if (raw !== undefined) thumbnails.push(raw);
  }
  return thumbnails;
}

/** Materialize compact head/history/units exclusively through the accepted writer transaction. */
export async function freezeScenarioInTransaction(
  tx: ScenarioReadTransaction,
  id: string
): Promise<CapturedScenarioRows> {
  const entry = parseScenarioProjectEntry((await readScenarioStorage(tx, id)).logical);
  if (!entry || entry.id !== id) invalid();
  const { history, ...current } = entry;
  const historyBytes = history?.length ? new TextEncoder().encode(JSON.stringify(history)) : null;
  const assets = await readScenarioChildRows(
    tx,
    stores.SCENARIO_ASSETS_STORE,
    id,
    parseScenarioAssetEntry
  );
  const documents = await readScenarioChildRows(
    tx,
    stores.SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
    id,
    parseScenarioStepEditorDocumentEntry
  );
  const exports = await readScenarioChildRows(
    tx,
    stores.SCENARIO_EXPORTS_STORE,
    id,
    parseScenarioExportEntry
  );
  const refs = await readScenarioResourceRefs(tx, assets, documents, exports);
  const media = await readScenarioLibraryMedia(tx, assets);
  const thumbnails = await readScenarioThumbnails(tx, id, exports);
  const presentation: unknown = await tx
    .objectStore(stores.AGGREGATE_PRESENTATIONS_STORE)
    .get(['scenario', id]);
  const snapshot = parseCapturedScenarioRows({
    entry: current,
    assets,
    documents,
    exports,
    refs,
    media,
    thumbnails,
    presentation: presentation ?? null,
    ...(historyBytes
      ? {
          history: {
            blob: new Blob([historyBytes], { type: 'application/json' }),
            sha256: Array.from(sha256(historyBytes), (byte) =>
              byte.toString(16).padStart(2, '0')
            ).join(''),
          },
        }
      : {}),
  });
  if (!snapshot) invalid();
  return structuredClone(snapshot);
}

/** Stable native digest includes the canonical history byte hash without duplicating its metadata. */
export function digestCapturedScenarioRows(rows: CapturedScenarioRows): string {
  const { mediaDependencies: _dependencies, media: _media, ...native } = rows;
  return Array.from(
    sha256(new TextEncoder().encode(JSON.stringify(describeImageMetadata(native)))),
    (byte) => byte.toString(16).padStart(2, '0')
  ).join('');
}

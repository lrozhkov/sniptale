import { preparedPresentationRefs } from './prepared-project';
import { sha256 } from '@noble/hashes/sha2.js';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { parseAssetRef, readAssetFile, type AssetRef } from '../assets';
import type { PreparedScenarioProjectArchiveRoot } from '../scenario/backup-restore';
import {
  parseScenarioProjectEntry,
  parseScenarioAssetEntry,
  parseScenarioExportEntry,
} from '../scenario/read-guards';
import { parseScenarioStepEditorDocumentEntry } from '../scenario/editor-documents/index.guards';
import { parseMediaThumbnailEntry } from '../media-library/read-guards';
import type { MediaThumbnailEntry } from '../media-library/contracts';
import { parseAggregatePresentationEntry } from '../aggregate-presentations/parser';
import type { AggregatePresentationEntry } from '../aggregate-presentations/contracts';
import { isBoundedScenarioMetadata, MAX_NATIVE_SCENARIO_HISTORY_BYTES } from './scenario-snapshot';
import { captureProfileBounds } from './contracts';

/** Durable JSON stage for an existing native Scenario publisher, with metadata bytes held by claimed refs. */
export interface PreparedScenarioReplicaRoot {
  entry: Omit<PreparedScenarioProjectArchiveRoot['entry'], 'history'>;
  historyRef?: AssetRef;
  assets: PreparedScenarioProjectArchiveRoot['assets'];
  exports: PreparedScenarioProjectArchiveRoot['exports'];
  exportRefs: AssetRef[];
  stepDocuments: PreparedScenarioProjectArchiveRoot['stepDocuments'];
  thumbnails: { entry: Omit<MediaThumbnailEntry, 'blob'>; ref: AssetRef }[];
  presentation?: {
    entry: Omit<AggregatePresentationEntry, 'thumbnailBlob' | 'previewBlob'>;
    thumbnailRef: AssetRef;
    previewRef?: AssetRef;
  };
}
function invalid(): never {
  throw new Error('Invalid prepared Scenario replica.');
}
function ref(value: unknown): AssetRef {
  return parseAssetRef(value) ?? invalid();
}
function list<T>(value: unknown, parse: (raw: unknown) => T): T[] {
  if (!Array.isArray(value) || value.length > captureProfileBounds('scenario-project').rows)
    invalid();
  return value.map(parse);
}
function parseScenarioAssetBinding(raw: unknown): PreparedScenarioReplicaRoot['assets'][number] {
  if (!isRecord(raw)) invalid();
  const entry = parseScenarioAssetEntry(raw['entry']);
  const source = ref(raw['ref']);
  if (
    !entry ||
    entry.assetId !== source.assetId ||
    entry.size !== source.size ||
    entry.mimeType !== source.mimeType
  )
    invalid();
  return { entry, ref: source };
}

function parseScenarioDocumentBinding(
  raw: unknown
): PreparedScenarioReplicaRoot['stepDocuments'][number] {
  if (!isRecord(raw)) invalid();
  const entry = parseScenarioStepEditorDocumentEntry(raw['entry']);
  const refs = list(raw['refs'], ref);
  if (!entry) invalid();
  const required = new Set(entry.document.assets.map((asset) => asset.assetId));
  if (
    refs.length !== required.size ||
    new Set(refs.map((source) => source.assetId)).size !== required.size ||
    refs.some((source) => !required.has(source.assetId))
  )
    invalid();
  return { entry, refs };
}

function parseScenarioThumbnailBinding(
  raw: unknown
): PreparedScenarioReplicaRoot['thumbnails'][number] {
  if (!isRecord(raw) || !isRecord(raw['entry'])) invalid();
  const parsed = parseMediaThumbnailEntry({ ...raw['entry'], blob: new Blob([]) });
  if (!parsed) invalid();
  const { blob: _blob, ...entry } = parsed;
  const source = ref(raw['ref']);
  if (!source.mimeType.startsWith('image/')) invalid();
  return { entry, ref: source };
}

function parseScenarioHistoryRef(value: unknown): AssetRef | undefined {
  if (value === undefined) return undefined;
  const source = ref(value);
  if (
    source.size > MAX_NATIVE_SCENARIO_HISTORY_BYTES ||
    source.mimeType !== 'application/json' ||
    source.sha256 === null
  )
    invalid();
  return source;
}

function parseScenarioPresentationBinding(
  value: unknown,
  entry: PreparedScenarioReplicaRoot['entry']
): PreparedScenarioReplicaRoot['presentation'] {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !isRecord(value['entry'])) invalid();
  const parsed = parseAggregatePresentationEntry({
    ...value['entry'],
    thumbnailBlob: new Blob([]),
  });
  if (
    !parsed ||
    parsed.aggregateKind !== 'scenario' ||
    parsed.aggregateId !== entry.id ||
    parsed.presentationRevision > entry.workspaceRevision
  )
    invalid();
  const { thumbnailBlob: _thumbnail, previewBlob: _preview, ...metadata } = parsed;
  return {
    entry: metadata,
    thumbnailRef: ref(value['thumbnailRef']),
    ...(value['previewRef'] === undefined ? {} : { previewRef: ref(value['previewRef']) }),
  };
}

function assertPreparedScenarioAssociations(root: PreparedScenarioReplicaRoot): void {
  const { entry, assets, exports, stepDocuments, thumbnails, exportRefs } = root;
  if (
    [
      ...assets.map((item) => item.entry),
      ...exports,
      ...stepDocuments.map((item) => item.entry),
    ].some((item) => item.projectId !== entry.id)
  )
    invalid();
  for (const ids of [
    assets.map((item) => item.entry.id),
    exports.map((item) => item.id),
    stepDocuments.map((item) => item.entry.stepId),
    thumbnails.map((item) => item.entry.assetId),
  ])
    if (new Set(ids).size !== ids.length) invalid();
  const requiredExports = new Set(
    exports.flatMap((item) => (item.html ? [item.html.assetId] : []))
  );
  if (
    new Set(exportRefs.map((source) => source.assetId)).size !== exportRefs.length ||
    exportRefs.length !== requiredExports.size ||
    exportRefs.some((source) => !requiredExports.has(source.assetId))
  )
    invalid();
  if (
    thumbnails.some(
      (item) =>
        item.entry.assetId !== `scenario:${entry.id}` &&
        !exports.some((output) => item.entry.assetId === `scenario-export:${output.id}`)
    )
  )
    invalid();
  for (const output of exports)
    if (
      output.html &&
      !exportRefs.some(
        (source) =>
          source.assetId === output.html?.assetId &&
          source.size === output.size &&
          /^text\/html(?:;charset=utf-8)?$/iu.test(source.mimeType)
      )
    )
      invalid();
}

/** Admit exact native identities and resource associations before the journal can claim bytes. */
export function parsePreparedScenarioReplicaRoot(value: unknown): PreparedScenarioReplicaRoot {
  if (!isRecord(value) || !isBoundedScenarioMetadata(value, false)) invalid();
  const entry = parseScenarioProjectEntry(value['entry']);
  if (!entry || entry.history?.length) invalid();
  const historyRef = parseScenarioHistoryRef(value['historyRef']);
  const presentation = parseScenarioPresentationBinding(value['presentation'], entry);
  const root: PreparedScenarioReplicaRoot = {
    entry,
    assets: list(value['assets'], parseScenarioAssetBinding),
    exports: list(value['exports'], (raw) => parseScenarioExportEntry(raw) ?? invalid()),
    exportRefs: list(value['exportRefs'], ref),
    stepDocuments: list(value['stepDocuments'], parseScenarioDocumentBinding),
    thumbnails: list(value['thumbnails'], parseScenarioThumbnailBinding),
    ...(historyRef ? { historyRef } : {}),
    ...(presentation ? { presentation } : {}),
  };
  assertPreparedScenarioAssociations(root);
  return root;
}

/** Exact immutable claims include the canonical history sidecar and all retained document resources. */
export function collectPreparedScenarioReplicaRefs(value: PreparedScenarioReplicaRoot): AssetRef[] {
  const root = parsePreparedScenarioReplicaRoot(value);
  const refs = [
    ...root.assets.map((item) => item.ref),
    ...root.exportRefs,
    ...root.stepDocuments.flatMap((item) => item.refs),
    ...root.thumbnails.map((item) => item.ref),
    ...(root.historyRef ? [root.historyRef] : []),
    ...preparedPresentationRefs(root.presentation),
  ];
  const unique = new Map<string, AssetRef>();
  for (const source of refs) {
    const previous = unique.get(source.assetId);
    if (previous && JSON.stringify(previous) !== JSON.stringify(source)) invalid();
    unique.set(source.assetId, source);
  }
  return [...unique.values()];
}
async function blob(source: AssetRef, filename: string): Promise<Blob> {
  const file = await readAssetFile(source, filename);
  if (file.size !== source.size || file.type !== source.mimeType) invalid();
  return new Blob([await file.arrayBuffer()], { type: source.mimeType });
}
/** Hydrate and canonically parse all detached metadata before the caller opens its native transaction. */
export async function hydratePreparedScenarioReplicaRoot(
  input: PreparedScenarioReplicaRoot
): Promise<PreparedScenarioProjectArchiveRoot> {
  const root = structuredClone(parsePreparedScenarioReplicaRoot(input));
  let history: unknown;
  if (root.historyRef) {
    const bytes = new Uint8Array(
      await (await blob(root.historyRef, 'saved-versions.json')).arrayBuffer()
    );
    const digest = Array.from(sha256(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
    if (digest !== root.historyRef.sha256) invalid();
    history = JSON.parse(new TextDecoder().decode(bytes));
  }
  const entry = parseScenarioProjectEntry({
    ...root.entry,
    ...(history === undefined ? {} : { history }),
  });
  if (!entry) invalid();
  const thumbnails = await Promise.all(
    root.thumbnails.map(
      async (item) =>
        parseMediaThumbnailEntry({ ...item.entry, blob: await blob(item.ref, 'thumbnail') }) ??
        invalid()
    )
  );
  const presentation = root.presentation
    ? parseAggregatePresentationEntry({
        ...root.presentation.entry,
        thumbnailBlob: await blob(root.presentation.thumbnailRef, 'presentation-thumbnail'),
        ...(root.presentation.previewRef
          ? { previewBlob: await blob(root.presentation.previewRef, 'presentation-preview') }
          : {}),
      })
    : undefined;
  if (presentation === null) invalid();
  const thumbnail = thumbnails.find((item) => item.assetId === `scenario:${entry.id}`);
  return {
    entry,
    assets: root.assets,
    exports: root.exports,
    exportRefs: root.exportRefs,
    stepDocuments: root.stepDocuments,
    exportThumbnails: thumbnails.filter((item) => item.assetId !== `scenario:${entry.id}`),
    ...(thumbnail ? { thumbnail } : {}),
    ...(presentation ? { presentation } : {}),
  };
}

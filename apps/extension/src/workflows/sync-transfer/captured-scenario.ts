import { sha256 } from '@noble/hashes/sha2.js';
import {
  createArchivePathAllocator,
  sanitizeArchivePathSegment,
} from '../../composition/archive-transfer';
import { parseScenarioProjectEntry } from '../../composition/persistence/scenario/read-guards';
import { getScenarioResourceReferences } from '../../features/scenario/project/public';
import {
  parseCapturedScenarioRows,
  type CapturedScenarioRows,
} from '../../composition/persistence/sync-capture/scenario-snapshot';
import * as stores from '../../composition/persistence/infrastructure/indexed-db/core.stores';
import { assertPortableJson, parseRootEnvelope } from '../media-hub-backup/v6/codec';
import { createMediaHubBackupExportOptions } from '../media-hub-backup/v6/options';
import { buildScenarioProjectRootInventory } from '../media-hub-backup/v6/inventory/scenario-projects';
import type { AssetRef } from '../../composition/persistence/assets/contracts';

/** Reuse the existing backup inventory with one immutable, canonically admitted native snapshot. */
export async function encodeCapturedScenarioRoot(value: CapturedScenarioRows) {
  const parsed = parseCapturedScenarioRows(value);
  if (!parsed || !parsed.mediaDependencies) throw new Error('Invalid captured Scenario root.');
  const rows = structuredClone(parsed);
  let history: unknown;
  if (rows.history) {
    const bytes = new Uint8Array(await rows.history.blob.arrayBuffer());
    const digest = Array.from(sha256(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
    if (digest !== rows.history.sha256)
      throw new Error('Captured Scenario history bytes differ from their fingerprint.');
    history = JSON.parse(new TextDecoder().decode(bytes));
  }
  const entry = parseScenarioProjectEntry({
    ...rows.entry,
    ...(history === undefined ? {} : { history }),
  });
  if (!entry) throw new Error('Captured Scenario history is invalid.');
  for (const project of [
    entry.project,
    ...(entry.history ?? []).map((version) => version.project),
  ]) {
    const refs = getScenarioResourceReferences(project);
    if (
      [...refs.assets].some((id) => !rows.assets.some((asset) => asset.id === id)) ||
      [...refs.documents].some((id) => !rows.documents.some((document) => document.stepId === id))
    )
      throw new Error('Captured Scenario history resource is unavailable.');
  }
  const table = new Map<string, unknown[]>([
    [stores.SCENARIO_PROJECTS_STORE, [entry]],
    [stores.SCENARIO_PROJECT_HISTORY_STORE, []],
    [stores.SCENARIO_PROJECT_UNITS_STORE, []],
    [stores.SCENARIO_ASSETS_STORE, rows.assets],
    [stores.SCENARIO_EXPORTS_STORE, rows.exports],
    [stores.SCENARIO_STEP_EDITOR_DOCUMENTS_STORE, rows.documents],
    [stores.ASSET_REFS_STORE, rows.refs],
    [stores.MEDIA_LIBRARY_STORE, rows.media],
    [stores.THUMBNAILS_STORE, rows.thumbnails],
    [stores.AGGREGATE_PRESENTATIONS_STORE, rows.presentation ? [rows.presentation] : []],
  ]);
  function all(name: string): unknown[] {
    const result = table.get(name);
    if (!result) throw new Error('Unsupported frozen Scenario store.');
    return structuredClone(result);
  }
  const db = {
    getAll: async (name: string) => all(name),
    get: async (name: string, key: unknown) => {
      if (name === stores.ASSET_REFS_STORE)
        return structuredClone(rows.refs.find((ref) => ref.assetId === key));
      if (name === stores.MEDIA_LIBRARY_STORE)
        return structuredClone(rows.media.find((media) => media.id === key));
      if (name === stores.THUMBNAILS_STORE)
        return structuredClone(rows.thumbnails.find((thumbnail) => thumbnail.assetId === key));
      if (name === stores.AGGREGATE_PRESENTATIONS_STORE)
        return Array.isArray(key) && key[0] === 'scenario' && key[1] === entry.id
          ? structuredClone(rows.presentation ?? undefined)
          : undefined;
      throw new Error('Unsupported frozen Scenario key.');
    },
    getAllFromIndex: async (name: string, index: string, key: unknown) => {
      if (index !== 'projectId' || key !== entry.id)
        throw new Error('Unsupported frozen Scenario index.');
      return all(name);
    },
    transaction: (_names: string[], _mode: 'readonly') => ({
      objectStore: (name: string) => ({ getAll: async () => all(name) }),
      done: Promise.resolve(),
    }),
  };
  const roots = await buildScenarioProjectRootInventory({
    db,
    options: createMediaHubBackupExportOptions({
      includeDrafts: entry.lifecycle?.storageClass === 'temporary',
      includeSourceMetadata: true,
      includeTelemetry: true,
      includeWebSnapshots: false,
    }),
    paths: createArchivePathAllocator(),
  });
  if (roots.length !== 1 || roots[0]!.descriptor.rootId !== entry.id)
    throw new Error('Captured Scenario differs from its inventory.');
  const loaded = await roots[0]!.load();
  const objects = loaded.objects.map((object) => ({
    ...object,
    ref: { ...object.ref, filename: sanitizeArchivePathSegment(object.ref.filename) },
  }));
  const metadata: unknown = JSON.parse(JSON.stringify(loaded.metadata));
  assertPortableJson(metadata);
  const envelope = parseRootEnvelope({
    descriptor: { ...roots[0]!.descriptor, metadataPath: 'Metadata/sync-root.json' },
    metadata,
    objects: objects.map((object) => object.ref),
  });
  const bindings: { objectId: string; ref: AssetRef }[] = [];
  return { envelope, objects, dependencies: rows.mediaDependencies ?? [], bindings };
}

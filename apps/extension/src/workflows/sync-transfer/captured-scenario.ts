import {
  matchesCapturedObjectBinding,
  loadCapturedInventory,
  createCapturedAssetInventory,
} from './captured-inventory';
import { parseRootEnvelope } from '../media-hub-backup/v6/codec';
import { type AssetResidencyCopy } from '../../composition/persistence/assets/residency-records';
import { sha256 } from '@noble/hashes/sha2.js';
import { createArchivePathAllocator } from '../../composition/archive-transfer';
import { parseScenarioProjectEntry } from '../../composition/persistence/scenario/read-guards';
import { getScenarioResourceReferences } from '../../features/scenario/project/public';
import {
  parseCapturedScenarioRows,
  type CapturedScenarioRows,
} from '../../composition/persistence/sync-capture/scenario-snapshot';
import * as stores from '../../composition/persistence/infrastructure/indexed-db/core.stores';
import { createMediaHubBackupExportOptions } from '../media-hub-backup/v6/options';
import { buildScenarioProjectRootInventory } from '../media-hub-backup/v6/inventory/scenario-projects';
import { parsePortableScenarioProjectMetadata } from '../media-hub-backup/v6/root-codecs/projects';
import type { AssetRef } from '../../composition/persistence/assets/contracts';

/** Reuse the existing backup inventory with one immutable, canonically admitted native snapshot. */
export async function encodeCapturedScenarioRoot(
  value: CapturedScenarioRows,
  deferredExports: ReadonlyMap<string, AssetResidencyCopy> = new Map()
) {
  const parsed = parseCapturedScenarioRows(value);
  if (!parsed || !parsed.mediaDependencies) throw new Error('Invalid captured Scenario root.');
  const rows = structuredClone(parsed);
  const refs = new Map(rows.refs.map((ref) => [ref.assetId, ref]));
  const deferred = createCapturedAssetInventory(rows.refs, deferredExports);
  const deferredObjects = deferred.objects;
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
    deferredAssets: deferred.port,
  });
  if (roots.length !== 1 || roots[0]!.descriptor.rootId !== entry.id)
    throw new Error('Captured Scenario differs from its inventory.');
  deferred.assertUsed();
  const { objects, metadata } = await loadCapturedInventory(roots[0]!);
  const descriptors = [...objects.map((object) => object.ref), ...deferred.descriptors()].sort(
    (a, b) => a.objectId.localeCompare(b.objectId)
  );
  const envelope = parseRootEnvelope({
    descriptor: { ...roots[0]!.descriptor, metadataPath: 'Metadata/sync-root.json' },
    metadata,
    objects: descriptors,
  });
  const portable = parsePortableScenarioProjectMetadata(metadata);
  const bindings: { objectId: string; ref: AssetRef }[] = [];
  const bind = (objectId: string, assetId: string | undefined) => {
    const ref = assetId ? refs.get(assetId) : undefined;
    const object = objects.find((item) => item.ref.objectId === objectId);
    const retained = deferredObjects.get(objectId);
    if (!matchesCapturedObjectBinding(ref, object, retained))
      throw new Error('Captured Scenario object differs from its native reference.');
    const previous = bindings.find((item) => item.objectId === objectId);
    if (previous && previous.ref.assetId !== ref.assetId)
      throw new Error('Captured Scenario object has conflicting native references.');
    if (!previous) bindings.push({ objectId, ref });
  };
  for (const asset of portable.assets)
    bind(asset.objectId, rows.assets.find((item) => item.id === asset.entry.id)?.assetId);
  for (const document of portable.stepDocuments) {
    const native = rows.documents.find((item) => item.stepId === document.stepId);
    for (const [index, asset] of document.document.assets.entries()) {
      const source = native?.document.assets[index];
      if (!source || source.role !== asset.role)
        throw new Error('Captured Scenario document resource differs from its native slot.');
      bind(asset.objectId, source.assetId);
    }
  }
  for (const output of portable.exports)
    if (output.html)
      bind(output.html.objectId, rows.exports.find((item) => item.id === output.id)?.html?.assetId);
  return {
    envelope,
    objects,
    dependencies: rows.mediaDependencies ?? [],
    bindings,
    ...(deferredObjects.size ? { retainedObjects: deferred.retainedObjects() } : {}),
  };
}

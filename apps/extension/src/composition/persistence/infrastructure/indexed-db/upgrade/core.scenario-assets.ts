import {
  AGGREGATE_PRESENTATIONS_STORE,
  SCENARIO_ASSETS_STORE,
  SCENARIO_PROJECTS_STORE,
  SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
  THUMBNAILS_STORE,
} from '../core.stores.ts';
import type { UpgradeObjectStore, UpgradeTransaction } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readId(value: unknown): string | null {
  return isRecord(value) ? readString(value['id']) : null;
}

function collectReferencedScenarioAssetIds(entry: unknown): Set<string> {
  const ids = new Set<string>();
  if (!isRecord(entry) || !isRecord(entry['project'])) return ids;
  const project = entry['project'];
  const steps = project['steps'];
  if (Array.isArray(steps)) {
    for (const step of steps) {
      if (!isRecord(step) || step['kind'] !== 'capture') continue;
      const assetId = readString(step['assetId']);
      if (assetId) ids.add(assetId);
    }
  }
  const collectSlide = (slide: unknown) => {
    if (!isRecord(slide)) return;
    if (isRecord(slide['source']) && slide['source']['kind'] === 'capture') {
      const assetId = readString(slide['source']['assetId']);
      if (assetId) ids.add(assetId);
    }
    collectNestedAssetRefs(slide['elements'], ids);
  };
  const slides = project['slides'];
  if (Array.isArray(slides)) slides.forEach(collectSlide);
  const trash = project['trash'];
  if (Array.isArray(trash)) {
    for (const item of trash) collectSlide(isRecord(item) ? item['slide'] : null);
  }
  return ids;
}

function collectNestedAssetRefs(value: unknown, ids: Set<string>): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectNestedAssetRefs(item, ids));
    return;
  }
  if (!isRecord(value)) return;
  if (isRecord(value['assetRef'])) {
    const assetId = readString(value['assetRef']['assetId']);
    if (assetId) ids.add(assetId);
  }
  for (const nested of Object.values(value)) collectNestedAssetRefs(nested, ids);
}

async function deleteKeys(store: UpgradeObjectStore, keys: Iterable<IDBValidKey>): Promise<void> {
  for (const key of keys) await store.delete(key);
}

export async function applyScenarioAssetsV28Upgrade(
  oldVersion: number,
  transaction?: UpgradeTransaction
): Promise<void> {
  if (oldVersion >= 28 || oldVersion === 0) return;
  if (!transaction) throw new Error('Scenario asset upgrade transaction is unavailable.');
  const assetStore = transaction.objectStore(SCENARIO_ASSETS_STORE);
  const [assets, projects, documents] = await Promise.all([
    assetStore.getAll(),
    transaction.objectStore(SCENARIO_PROJECTS_STORE).getAll(),
    transaction.objectStore(SCENARIO_STEP_EDITOR_DOCUMENTS_STORE).getAll(),
  ]);
  const legacyAssetIds = new Set(assets.map(readId).filter((id): id is string => id !== null));
  const invalidProjectIds = new Set<string>();
  for (const project of projects) {
    const projectId = readId(project);
    if (
      projectId &&
      [...collectReferencedScenarioAssetIds(project)].some((id) => legacyAssetIds.has(id))
    ) {
      invalidProjectIds.add(projectId);
    }
  }
  const invalidDocumentIds = documents.flatMap((document) => {
    if (!isRecord(document) || !invalidProjectIds.has(readString(document['projectId']) ?? '')) {
      return [];
    }
    const stepId = readString(document['stepId']);
    return stepId ? [stepId] : [];
  });
  await assetStore.clear();
  await deleteKeys(transaction.objectStore(SCENARIO_PROJECTS_STORE), invalidProjectIds);
  await deleteKeys(
    transaction.objectStore(SCENARIO_STEP_EDITOR_DOCUMENTS_STORE),
    invalidDocumentIds
  );
  await deleteKeys(
    transaction.objectStore(AGGREGATE_PRESENTATIONS_STORE),
    [...invalidProjectIds].map((id) => ['scenario', id])
  );
  await deleteKeys(
    transaction.objectStore(THUMBNAILS_STORE),
    [...invalidProjectIds].map((id) => `scenario:${id}`)
  );
}

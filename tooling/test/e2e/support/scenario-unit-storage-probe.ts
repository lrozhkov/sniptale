import { openDB, type IDBPDatabase } from 'idb';
import { handleDatabaseUpgrade } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/upgrade/core';
import { DB_VERSION } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/core.stores';
import { betaV19Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v19';
import {
  createGuideProject,
  createGuideStep,
  createTourDocument,
  createTourImageSlide,
} from '../../../../apps/extension/src/features/scenario/project/factories';
import { createScenarioProjectEntry } from '../../../../apps/extension/src/composition/persistence/scenario/projects/entry';
import {
  scenarioStorageHead,
  scenarioStorageRows,
} from '../../../../apps/extension/src/composition/persistence/scenario/storage-format';
import { commitScenarioAggregateMutation } from '../../../../apps/extension/src/composition/persistence/scenario/aggregate-mutations';
import {
  deleteOrphanedScenarioAggregateChild,
  deleteScenarioAggregate,
} from '../../../../apps/extension/src/composition/persistence/scenario/aggregate-cleanup';
import { clearScenarioSavedHistory } from '../../../../apps/extension/src/composition/persistence/scenario/retention';
import { getScenarioProjectEntry } from '../../../../apps/extension/src/composition/persistence/scenario/projects/project';
import { readAssetFile } from '../../../../apps/extension/src/composition/persistence/assets';

const unitStore = 'scenario_project_units';
const headStore = 'scenario_projects';
const historyStore = 'scenario_project_history';

async function snapshot(db: IDBPDatabase) {
  const names = [...db.objectStoreNames];
  const tx = db.transaction(names);
  const rows = await Promise.all(names.map((name) => tx.objectStore(name).getAll()));
  await tx.done;
  return JSON.stringify(rows);
}

/** Released19→20 interruption uses the actual production versionchange owner. */
export async function probeScenarioUnitAdmission() {
  const name = 'scenario-unit-schema-proof';
  const source = await openDB(name, 19, {
    upgrade(db, old, next, tx) {
      handleDatabaseUpgrade(db, old, next, tx);
      db.deleteObjectStore(unitStore);
      for (const [domainId, schemaVersion] of Object.entries(betaV19Fixture.domainVersions))
        tx.objectStore('schema_contracts').put({ domainId, schemaVersion });
    },
  });
  const first = createScenarioProjectEntry({
    existing: undefined,
    project: createGuideProject('Retained19', 'released19', 1),
    updatedAt: 2,
  });
  const entry = createScenarioProjectEntry({
    existing: first,
    project: { ...first.project, name: 'Current19' },
    updatedAt: 3,
  });
  await source.put(headStore, scenarioStorageHead(entry));
  for (const row of scenarioStorageRows(entry)) await source.put(historyStore, row);
  const before = await snapshot(source);
  source.close();
  let aborted = false;
  try {
    await openDB(name, DB_VERSION, {
      upgrade(db, old, next, tx) {
        handleDatabaseUpgrade(db, old, next, tx);
        tx.abort();
      },
    });
  } catch {
    aborted = true;
  }
  const previous = await openDB(name);
  const rollback =
    previous.version === 19 &&
    !previous.objectStoreNames.contains(unitStore) &&
    before === (await snapshot(previous));
  previous.close();
  const admitted = await openDB(name, DB_VERSION, { upgrade: handleDatabaseUpgrade });
  const emptyUnits = await admitted.count(unitStore);
  const unchangedHead =
    JSON.stringify(await admitted.get(headStore, entry.id)) ===
    JSON.stringify(scenarioStorageHead(entry));
  const unchangedHistory =
    JSON.stringify(await admitted.getAll(historyStore)) ===
    JSON.stringify(scenarioStorageRows(entry));
  admitted.close();
  return { aborted, rollback, emptyUnits, unchangedHead, unchangedHistory };
}

/** Native request counts cross the real aggregate writer and coherent logical readback. */
export async function probeScenarioUnitWrites(
  db: IDBPDatabase,
  observed: {
    writes: { store: string; bytes: number }[];
    deletes: { store: string }[];
    reset(): void;
  },
  ref: Parameters<typeof readAssetFile>[0],
  canary: string
) {
  const project = createGuideProject('Units', 'native-unit-guide', 1);
  project.items = [
    createGuideStep('Unchanged A', 'unit-a'),
    createGuideStep('Unchanged B', 'unit-b'),
  ];
  project.tour = createTourDocument('native-unit-tour');
  project.tour.slides = [
    createTourImageSlide('unit-slide-a'),
    createTourImageSlide('unit-slide-b'),
  ];
  let published = await commitScenarioAggregateMutation(project);
  const initial = await db.getAllFromIndex(unitStore, 'projectId', project.id);
  observed.reset();
  const input = { ...published.project, name: 'Metadata only' };
  let nameHistoryClones = 0;
  const originalClone = globalThis.structuredClone;
  globalThis.structuredClone = function <T>(value: T, options?: StructuredSerializeOptions): T {
    if (
      Array.isArray(value) &&
      value.some(
        (row: unknown) =>
          row !== null &&
          typeof row === 'object' &&
          Object.hasOwn(row, 'project') &&
          Object.hasOwn(row, 'savedAt')
      )
    )
      nameHistoryClones += 1;
    return originalClone(value, options);
  };
  try {
    published = await commitScenarioAggregateMutation(input, {
      expectedRevision: published.workspaceRevision,
    });
  } finally {
    globalThis.structuredClone = originalClone;
  }
  const nameUnitWrites = observed.writes.filter((row) => row.store === unitStore).length;
  const nameRequests = [...observed.writes];
  const nameRetained =
    JSON.stringify(initial) ===
    JSON.stringify(await db.getAllFromIndex(unitStore, 'projectId', project.id));
  const beforeMutation = await getScenarioProjectEntry(project.id);
  if (!beforeMutation) throw new Error('Missing admitted native snapshot.');
  input.items[0]!.title = 'Mutated input step';
  input.tour!.slides[0]!.title = 'Mutated input slide';
  published.project.items[0]!.title = 'Mutated returned step';
  published.project.tour!.slides[0]!.title = 'Mutated returned slide';
  published.project.name = 'Mutated returned root';
  const detachedSnapshots =
    JSON.stringify(beforeMutation) === JSON.stringify(await getScenarioProjectEntry(project.id));
  published = { ...published, project: beforeMutation.project };
  const edit = structuredClone(published.project);
  edit.items[0]!.title = 'Changed A';
  observed.reset();
  published = await commitScenarioAggregateMutation(edit, {
    expectedRevision: published.workspaceRevision,
  });
  const guideUnitWrites = observed.writes.filter((row) => row.store === unitStore).length;
  const guideRequests = [...observed.writes];
  const tour = structuredClone(published.project);
  tour.tour!.slides[0]!.title = 'Changed slide';
  observed.reset();
  published = await commitScenarioAggregateMutation(tour, {
    expectedRevision: published.workspaceRevision,
  });
  const tourUnitWrites = observed.writes.filter((row) => row.store === unitStore).length;
  const beforeReorder = JSON.stringify(
    await db.getAllFromIndex(unitStore, 'projectId', project.id)
  );
  const reordered = { ...published.project, items: published.project.items.toReversed() };
  observed.reset();
  published = await commitScenarioAggregateMutation(reordered, {
    expectedRevision: published.workspaceRevision,
  });
  const reorderUnitWrites = observed.writes.filter((row) => row.store === unitStore).length;
  const reorderRetained =
    beforeReorder === JSON.stringify(await db.getAllFromIndex(unitStore, 'projectId', project.id));
  const current = await getScenarioProjectEntry(project.id);
  const logical =
    JSON.stringify(current?.project) === JSON.stringify(published.project) &&
    current?.history?.length === 4;
  await clearScenarioSavedHistory(project.id, published.project.updatedAt);
  const clearedUnits = (await db.getAllFromIndex(unitStore, 'projectId', project.id)).length;
  const clearedLogical = !(await getScenarioProjectEntry(project.id))?.history?.length;
  await deleteScenarioAggregate(project.id);
  const deleted =
    !(await db.get(headStore, project.id)) &&
    (await db.getAllFromIndex(unitStore, 'projectId', project.id)).length === 0 &&
    (await db.getAllFromIndex(historyStore, 'projectId', project.id)).length === 0;

  const seed = db.transaction([unitStore, 'scenario_assets', 'asset_owners'], 'readwrite');
  await seed.objectStore(unitStore).put({
    projectId: 'unit-only-orphan',
    unitId: 'guide:retained',
    revision: 1,
    value: createGuideStep('Retained', 'retained'),
  });
  await seed.objectStore('scenario_assets').put({
    id: 'unit-only-child',
    projectId: 'unit-only-orphan',
    assetId: ref.assetId,
    galleryAssetId: null,
    mimeType: ref.mimeType,
    size: ref.size,
    width: 10,
    height: 10,
    createdAt: 1,
  });
  await seed.objectStore('asset_owners').put({
    ownerKind: 'scenario-asset',
    ownerId: 'unit-only-child',
    role: 'body',
    assetId: ref.assetId,
  });
  await seed.done;
  const beforeOrphan = await snapshot(db);
  observed.reset();
  let refused = false;
  try {
    await deleteOrphanedScenarioAggregateChild({ id: 'unit-only-child', kind: 'asset' });
  } catch {
    refused = true;
  }
  const orphan = {
    refused,
    zeroWrites: observed.writes.length === 0 && observed.deletes.length === 0,
    graphUnchanged: beforeOrphan === (await snapshot(db)),
    bytesUnchanged: (await (await readAssetFile(ref, 'unit-canary.png')).text()) === canary,
  };
  return {
    initialUnits: initial.length,
    nameUnitWrites,
    nameHistoryClones,
    detachedSnapshots,
    nameRequests,
    nameRetained,
    guideUnitWrites,
    guideRequests,
    tourUnitWrites,
    reorderUnitWrites,
    reorderRetained,
    logical,
    clearedUnits,
    clearedLogical,
    deleted,
    orphan,
  };
}

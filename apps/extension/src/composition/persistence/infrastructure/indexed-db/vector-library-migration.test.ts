import { expect, it } from 'vitest';
import { DATABASE_MIGRATIONS } from './schema-contracts';
import { DB_VERSION } from './core.stores';
import { betaV60Fixture } from './fixtures/beta-v60';
import {
  createNativeUpgradeFixture,
  expectedVectorLibraryCreation,
} from './schema-contracts.test-support';

function registeredVectorMigration() {
  const matches = DATABASE_MIGRATIONS.filter((migration) => migration.toDatabaseVersion === 61);
  expect(matches).toHaveLength(1);
  const migration = matches[0];
  if (!migration) throw new Error('Registered vector migration is missing.');
  return migration;
}

it('registers the additive vector migration at database61 with exact stores and indexes', async () => {
  const migration = registeredVectorMigration();
  expect(DB_VERSION).toBe(62);
  expect(migration).toMatchObject({
    fromDatabaseVersion: 60,
    toDatabaseVersion: 61,
    risk: 'additive',
    backupCoverage: 'none',
    stores: ['editor_vector_library', 'image_workspaces', 'scenario_step_editor_documents'],
    domainVersions: [
      { domainId: 'editorVectorLibrary', from: 0, to: 1 },
      { domainId: 'mediaLibrary', from: 38, to: 39 },
      { domainId: 'scenarioProjects', from: 11, to: 12 },
    ],
  });
  await expect(migration.estimateAdditionalBytes()).resolves.toBe(64 * 1024);
  const { db, transaction, createIndex, put } = createNativeUpgradeFixture(betaV60Fixture.stores);
  expect(migration.migrate(db, transaction)).toBeUndefined();
  expect(migration.validate(db, transaction)).toBeUndefined();
  expect(db.createObjectStore).toHaveBeenCalledExactlyOnceWith(...expectedVectorLibraryCreation);
  expect(createIndex.mock.calls).toEqual([
    ['kind', 'kind'],
    ['definitionId', 'definitionId'],
    ['retentionReferenceKeys', '__sniptaleRetentionIndexV1', { multiEntry: true }],
  ]);
  expect(db.deleteObjectStore).not.toHaveBeenCalled();
  expect(transaction.objectStore).not.toHaveBeenCalled();
  expect(put).not.toHaveBeenCalled();
});

it.each(['editor_vector_library', 'image_workspaces', 'scenario_step_editor_documents'])(
  'refuses missing vector migration store %s before admission',
  (missing) => {
    const migration = registeredVectorMigration();
    const { db, names, transaction, put } = createNativeUpgradeFixture([
      ...betaV60Fixture.stores,
      'editor_vector_library',
    ]);
    names.delete(missing);
    expect(() => migration.validate(db, transaction)).toThrow(
      'Vector definition stores are unavailable.'
    );
    expect(put).not.toHaveBeenCalled();
    expect(db.deleteObjectStore).not.toHaveBeenCalled();
  }
);

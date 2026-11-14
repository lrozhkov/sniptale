import type { DatabaseMigrationDescriptor } from './schema-contract-types';
import {
  EDITOR_VECTOR_LIBRARY_STORE,
  IMAGE_WORKSPACES_STORE,
  SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
} from './core.stores';
import { ROW_REFERENCE_INDEX, ROW_REFERENCE_FIELD } from './row-index-contract';
import { requireMigrationStores } from './migration-validation';

export const editorVectorLibraryMigration: DatabaseMigrationDescriptor = {
  backupCoverage: 'none',
  domainVersions: [
    { domainId: 'editorVectorLibrary', from: 0, to: 1 },
    { domainId: 'mediaLibrary', from: 38, to: 39 },
    { domainId: 'scenarioProjects', from: 11, to: 12 },
  ],
  estimateAdditionalBytes: async () => 64 * 1024,
  fromDatabaseVersion: 60,
  toDatabaseVersion: 61,
  risk: 'additive',
  stores: [
    EDITOR_VECTOR_LIBRARY_STORE,
    IMAGE_WORKSPACES_STORE,
    SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
  ],
  migrate(db) {
    if (db.objectStoreNames.contains(EDITOR_VECTOR_LIBRARY_STORE)) return undefined;
    const store = db.createObjectStore(EDITOR_VECTOR_LIBRARY_STORE, { keyPath: 'key' });
    store.createIndex('kind', 'kind');
    store.createIndex('definitionId', 'definitionId');
    store.createIndex(ROW_REFERENCE_INDEX, ROW_REFERENCE_FIELD, { multiEntry: true });
    return undefined;
  },
  validate(db) {
    return requireMigrationStores(
      db,
      [EDITOR_VECTOR_LIBRARY_STORE, IMAGE_WORKSPACES_STORE, SCENARIO_STEP_EDITOR_DOCUMENTS_STORE],
      'Vector definition stores are unavailable.'
    );
  },
};

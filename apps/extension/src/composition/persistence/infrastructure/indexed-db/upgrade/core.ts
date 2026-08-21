import {
  AGGREGATE_PRESENTATIONS_STORE,
  ASSET_OPERATIONS_STORE,
  ASSET_OWNERS_STORE,
  ASSET_REFS_STORE,
  DIAGNOSTICS_EVENTS_STORE,
  DIAGNOSTICS_META_STORE,
  EDITOR_CUSTOM_SHAPES_STORE,
  FRAME_ANNOTATION_RASTER_JOBS_STORE,
  IMAGE_WORKSPACES_STORE,
  MEDIA_LIBRARY_STORE,
  NATIVE_TRANSFER_CHUNKS_STORE,
  NATIVE_TRANSFER_SESSIONS_STORE,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORT_INPUTS_STORE,
  PROJECT_EXPORTS_STORE,
  RECORDING_TELEMETRY_STORE,
  SCENARIO_ASSETS_STORE,
  SCENARIO_EXPORTS_STORE,
  SCENARIO_PENDING_ASSETS_STORE,
  SCENARIO_PROJECTS_STORE,
  SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
  SCHEMA_CONTRACTS_STORE,
  STATE_MANAGER_STORE,
  STORE_NAME,
  THUMBNAILS_STORE,
  VIDEO_EFFECT_BUNDLES_STORE,
  VIDEO_PROJECTS_STORE,
  WEB_SNAPSHOTS_STORE,
} from '../core.stores.ts';
import {
  CURRENT_SCHEMA_CONTRACTS,
  DATABASE_MIGRATIONS,
  buildDatabaseMigrationPlan,
  type DatabaseMigrationDescriptor,
} from '../schema-contracts.ts';
import type { UpgradeDatabase, UpgradeTransaction } from './types.ts';

function createStore(
  db: UpgradeDatabase,
  name: string,
  keyPath: string | string[],
  indexes: readonly string[] = []
): void {
  const store = db.createObjectStore(name, { keyPath });
  for (const index of indexes) store.createIndex(index, index);
}

export function handleDatabaseUpgrade(
  db: UpgradeDatabase,
  oldVersion: number,
  _newVersion: number | null,
  transaction: UpgradeTransaction
): void {
  executeDatabaseUpgrade(db, oldVersion, _newVersion, transaction, DATABASE_MIGRATIONS);
}

export function executeDatabaseUpgrade(
  db: UpgradeDatabase,
  oldVersion: number,
  _newVersion: number | null,
  transaction: UpgradeTransaction,
  migrations: readonly DatabaseMigrationDescriptor[]
): void {
  if (oldVersion === 0) {
    createBetaBaseline(db);
    return;
  }
  const targetVersion = _newVersion ?? oldVersion;
  const plan = buildDatabaseMigrationPlan(oldVersion, targetVersion, migrations);
  if (!plan) {
    transaction.abort();
    throw new Error(`Unsupported beta database migration source: ${oldVersion}`);
  }

  try {
    for (const migration of plan) {
      assertSynchronousMigrationStep(migration.migrate(db, transaction), 'migrate');
      assertSynchronousMigrationStep(migration.validate(db, transaction), 'validate');
    }
    const contracts = transaction.objectStore(SCHEMA_CONTRACTS_STORE);
    for (const contract of CURRENT_SCHEMA_CONTRACTS) contracts.put(contract);
  } catch (error) {
    transaction.abort();
    throw error;
  }
}

function assertSynchronousMigrationStep(result: unknown, step: 'migrate' | 'validate'): void {
  if (result === undefined) return;
  if (result instanceof Promise) void result.catch(() => undefined);
  throw new Error(`Database migration ${step} must synchronously enqueue transaction work`);
}

function createBetaBaseline(db: UpgradeDatabase): void {
  createStore(db, STORE_NAME, 'id', ['createdAt']);
  createStore(db, RECORDING_TELEMETRY_STORE, 'recordingId', ['updatedAt']);
  createStore(db, DIAGNOSTICS_META_STORE, 'recordingId');
  createStore(db, DIAGNOSTICS_EVENTS_STORE, ['recordingId', 'chunkIndex'], ['recordingId']);
  createStore(db, VIDEO_PROJECTS_STORE, 'id', ['updatedAt']);
  createStore(db, SCENARIO_PROJECTS_STORE, 'id', ['updatedAt']);
  createStore(db, PROJECT_ASSETS_STORE, 'id', ['createdAt']);
  createStore(db, SCENARIO_ASSETS_STORE, 'id', ['projectId', 'createdAt']);
  createStore(db, SCENARIO_PENDING_ASSETS_STORE, 'id', ['tabId', 'createdAt']);
  createStore(db, PROJECT_EXPORTS_STORE, 'id', ['projectId', 'createdAt']);
  createStore(db, SCENARIO_EXPORTS_STORE, 'id', ['projectId', 'createdAt']);
  createStore(db, SCENARIO_STEP_EDITOR_DOCUMENTS_STORE, 'stepId', ['projectId', 'updatedAt']);
  createStore(db, MEDIA_LIBRARY_STORE, 'id', ['createdAt', 'kind']);
  createStore(db, THUMBNAILS_STORE, 'assetId');
  createStore(db, IMAGE_WORKSPACES_STORE, 'aggregateId', ['updatedAt']);
  createStore(db, AGGREGATE_PRESENTATIONS_STORE, ['aggregateKind', 'aggregateId'], ['updatedAt']);
  createStore(db, WEB_SNAPSHOTS_STORE, 'id', ['createdAt']);
  createStore(db, VIDEO_EFFECT_BUNDLES_STORE, 'packId', ['enabled', 'updatedAt']);
  createStore(db, PROJECT_EXPORT_INPUTS_STORE, 'jobId', ['createdAt']);
  createStore(db, FRAME_ANNOTATION_RASTER_JOBS_STORE, 'jobId', ['createdAt']);
  createStore(db, EDITOR_CUSTOM_SHAPES_STORE, 'id', ['enabled', 'updatedAt']);
  createStore(db, STATE_MANAGER_STORE, ['domain', 'key'], ['domain', 'updatedAtEpochMs']);
  createStore(db, NATIVE_TRANSFER_SESSIONS_STORE, 'id', ['createdAt', 'updatedAt']);
  createStore(db, NATIVE_TRANSFER_CHUNKS_STORE, ['sessionId', 'chunkIndex'], ['sessionId']);
  createStore(db, ASSET_REFS_STORE, 'assetId', ['createdAt']);
  createStore(db, ASSET_OWNERS_STORE, ['ownerKind', 'ownerId', 'role'], ['assetId']);
  createStore(db, ASSET_OPERATIONS_STORE, 'operationId', ['status', 'updatedAt']);
  const contracts = db.createObjectStore(SCHEMA_CONTRACTS_STORE, { keyPath: 'domainId' });
  for (const contract of CURRENT_SCHEMA_CONTRACTS) contracts.put(contract);
}

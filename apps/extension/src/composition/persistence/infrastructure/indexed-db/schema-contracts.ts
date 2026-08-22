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
  STATE_MANAGER_STORE,
  STORE_NAME,
  THUMBNAILS_STORE,
  VIDEO_EFFECT_BUNDLES_STORE,
  VIDEO_PROJECTS_STORE,
  WEB_SNAPSHOTS_STORE,
  type EXPECTED_STORES,
} from './core.stores.ts';
import type { UpgradeDatabase, UpgradeTransaction } from './upgrade/types.ts';

type PersistenceDomainId =
  | 'assetGraph'
  | 'diagnostics'
  | 'editorAssets'
  | 'effects'
  | 'mediaLibrary'
  | 'recordings'
  | 'runtimeRecovery'
  | 'scenarioProjects'
  | 'snapshots'
  | 'videoProjects';

type PersistenceDataClass = 'derived-rebuildable' | 'durable-authority' | 'operational-recoverable';

interface PersistenceStoreContract {
  dataClass: PersistenceDataClass;
  storeName: Exclude<(typeof EXPECTED_STORES)[number], 'schema_contracts'>;
}

interface PersistenceDomainContract {
  domainId: PersistenceDomainId;
  schemaVersion: number;
  stores: readonly PersistenceStoreContract[];
}

interface StoredSchemaContract {
  domainId: PersistenceDomainId;
  schemaVersion: number;
}

export const PERSISTENCE_DOMAIN_REGISTRY = [
  {
    domainId: 'recordings',
    schemaVersion: 1,
    stores: [
      { storeName: STORE_NAME, dataClass: 'durable-authority' },
      { storeName: RECORDING_TELEMETRY_STORE, dataClass: 'durable-authority' },
    ],
  },
  {
    domainId: 'mediaLibrary',
    schemaVersion: 1,
    stores: [
      { storeName: MEDIA_LIBRARY_STORE, dataClass: 'durable-authority' },
      { storeName: THUMBNAILS_STORE, dataClass: 'derived-rebuildable' },
      { storeName: IMAGE_WORKSPACES_STORE, dataClass: 'durable-authority' },
      { storeName: AGGREGATE_PRESENTATIONS_STORE, dataClass: 'derived-rebuildable' },
    ],
  },
  {
    domainId: 'assetGraph',
    schemaVersion: 1,
    stores: [
      { storeName: ASSET_REFS_STORE, dataClass: 'durable-authority' },
      { storeName: ASSET_OWNERS_STORE, dataClass: 'durable-authority' },
      { storeName: ASSET_OPERATIONS_STORE, dataClass: 'operational-recoverable' },
    ],
  },
  {
    domainId: 'videoProjects',
    schemaVersion: 1,
    stores: [
      { storeName: VIDEO_PROJECTS_STORE, dataClass: 'durable-authority' },
      { storeName: PROJECT_ASSETS_STORE, dataClass: 'durable-authority' },
      { storeName: PROJECT_EXPORTS_STORE, dataClass: 'durable-authority' },
      { storeName: PROJECT_EXPORT_INPUTS_STORE, dataClass: 'operational-recoverable' },
    ],
  },
  {
    domainId: 'scenarioProjects',
    schemaVersion: 1,
    stores: [
      { storeName: SCENARIO_PROJECTS_STORE, dataClass: 'durable-authority' },
      { storeName: SCENARIO_ASSETS_STORE, dataClass: 'durable-authority' },
      { storeName: SCENARIO_PENDING_ASSETS_STORE, dataClass: 'operational-recoverable' },
      { storeName: SCENARIO_EXPORTS_STORE, dataClass: 'durable-authority' },
      { storeName: SCENARIO_STEP_EDITOR_DOCUMENTS_STORE, dataClass: 'durable-authority' },
    ],
  },
  {
    domainId: 'snapshots',
    schemaVersion: 1,
    stores: [{ storeName: WEB_SNAPSHOTS_STORE, dataClass: 'durable-authority' }],
  },
  {
    domainId: 'diagnostics',
    schemaVersion: 1,
    stores: [
      { storeName: DIAGNOSTICS_META_STORE, dataClass: 'durable-authority' },
      { storeName: DIAGNOSTICS_EVENTS_STORE, dataClass: 'durable-authority' },
    ],
  },
  {
    domainId: 'effects',
    schemaVersion: 1,
    stores: [{ storeName: VIDEO_EFFECT_BUNDLES_STORE, dataClass: 'durable-authority' }],
  },
  {
    domainId: 'editorAssets',
    schemaVersion: 1,
    stores: [{ storeName: EDITOR_CUSTOM_SHAPES_STORE, dataClass: 'durable-authority' }],
  },
  {
    domainId: 'runtimeRecovery',
    schemaVersion: 1,
    stores: [
      { storeName: STATE_MANAGER_STORE, dataClass: 'operational-recoverable' },
      { storeName: NATIVE_TRANSFER_SESSIONS_STORE, dataClass: 'operational-recoverable' },
      { storeName: NATIVE_TRANSFER_CHUNKS_STORE, dataClass: 'operational-recoverable' },
      { storeName: FRAME_ANNOTATION_RASTER_JOBS_STORE, dataClass: 'operational-recoverable' },
    ],
  },
] as const satisfies readonly PersistenceDomainContract[];

export const CURRENT_SCHEMA_CONTRACTS: readonly StoredSchemaContract[] =
  PERSISTENCE_DOMAIN_REGISTRY.map(({ domainId, schemaVersion }) => ({
    domainId,
    schemaVersion,
  }));

type DatabaseMigrationRisk = 'additive' | 'destructive' | 'transforming';

export interface DatabaseMigrationDescriptor {
  backupCoverage: 'full' | 'none';
  domainVersions: readonly {
    domainId: PersistenceDomainId;
    from: number;
    to: number;
  }[];
  estimateAdditionalBytes(): Promise<number>;
  fromDatabaseVersion: number;
  migrate(db: UpgradeDatabase, transaction: UpgradeTransaction): undefined;
  risk: DatabaseMigrationRisk;
  stores: readonly Exclude<(typeof EXPECTED_STORES)[number], 'schema_contracts'>[];
  toDatabaseVersion: number;
  validate(db: UpgradeDatabase, transaction: UpgradeTransaction): undefined;
}

// The beta baseline has no predecessor. Every future database version must append a complete,
// contiguous descriptor and retain the fixtures for every released beta source version.
export const DATABASE_MIGRATIONS: readonly DatabaseMigrationDescriptor[] = [];

export function buildDatabaseMigrationPlan(
  fromDatabaseVersion: number,
  toDatabaseVersion: number,
  migrations: readonly DatabaseMigrationDescriptor[] = DATABASE_MIGRATIONS
): readonly DatabaseMigrationDescriptor[] | null {
  if (fromDatabaseVersion === toDatabaseVersion) return [];
  if (fromDatabaseVersion > toDatabaseVersion) return null;
  const plan: DatabaseMigrationDescriptor[] = [];
  let version = fromDatabaseVersion;
  while (version < toDatabaseVersion) {
    const migration = migrations.find((candidate) => candidate.fromDatabaseVersion === version);
    if (!migration || migration.toDatabaseVersion <= version) return null;
    plan.push(migration);
    version = migration.toDatabaseVersion;
  }
  return version === toDatabaseVersion ? plan : null;
}

export function parseStoredSchemaContracts(value: unknown): readonly StoredSchemaContract[] | null {
  if (!Array.isArray(value) || value.length !== CURRENT_SCHEMA_CONTRACTS.length) return null;
  const parsed = value.flatMap((entry) => {
    if (!isUnknownRecord(entry)) return [];
    const domainId = entry['domainId'];
    const schemaVersion = entry['schemaVersion'];
    if (
      typeof domainId !== 'string' ||
      !CURRENT_SCHEMA_CONTRACTS.some((contract) => contract.domainId === domainId) ||
      typeof schemaVersion !== 'number' ||
      !Number.isInteger(schemaVersion) ||
      schemaVersion < 1
    ) {
      return [];
    }
    return [{ domainId: domainId as PersistenceDomainId, schemaVersion }];
  });
  if (parsed.length !== value.length) return null;
  const byDomain = new Map(parsed.map((contract) => [contract.domainId, contract.schemaVersion]));
  if (byDomain.size !== CURRENT_SCHEMA_CONTRACTS.length) return null;
  return CURRENT_SCHEMA_CONTRACTS.every(
    (expected) => byDomain.get(expected.domainId) === expected.schemaVersion
  )
    ? parsed
    : null;
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

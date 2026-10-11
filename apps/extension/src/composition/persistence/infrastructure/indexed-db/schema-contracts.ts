import type { DatabaseMigrationSource } from './upgrade/types';
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
  VIDEO_WORKSPACES_STORE,
  VIDEO_WORKSPACE_HISTORY_STORE,
  VIDEO_WORKSPACE_DRAFTS_STORE,
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
  SCENARIO_PROJECT_HISTORY_STORE,
  SCENARIO_PROJECT_UNITS_STORE,
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
    schemaVersion: 18,
    stores: [
      { storeName: MEDIA_LIBRARY_STORE, dataClass: 'durable-authority' },
      { storeName: THUMBNAILS_STORE, dataClass: 'derived-rebuildable' },
      { storeName: IMAGE_WORKSPACES_STORE, dataClass: 'durable-authority' },
      { storeName: VIDEO_WORKSPACES_STORE, dataClass: 'durable-authority' },
      { storeName: VIDEO_WORKSPACE_HISTORY_STORE, dataClass: 'durable-authority' },
      { storeName: VIDEO_WORKSPACE_DRAFTS_STORE, dataClass: 'durable-authority' },
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
    schemaVersion: 3,
    stores: [
      { storeName: VIDEO_PROJECTS_STORE, dataClass: 'durable-authority' },
      { storeName: PROJECT_ASSETS_STORE, dataClass: 'durable-authority' },
      { storeName: PROJECT_EXPORTS_STORE, dataClass: 'durable-authority' },
      { storeName: PROJECT_EXPORT_INPUTS_STORE, dataClass: 'operational-recoverable' },
    ],
  },
  {
    domainId: 'scenarioProjects',
    schemaVersion: 6,
    stores: [
      { storeName: SCENARIO_PROJECTS_STORE, dataClass: 'durable-authority' },
      { storeName: SCENARIO_PROJECT_HISTORY_STORE, dataClass: 'durable-authority' },
      { storeName: SCENARIO_PROJECT_UNITS_STORE, dataClass: 'durable-authority' },
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
  estimateAdditionalBytes(source?: DatabaseMigrationSource): Promise<number>;
  fromDatabaseVersion: number;
  migrate(db: UpgradeDatabase, transaction: UpgradeTransaction): undefined;
  risk: DatabaseMigrationRisk;
  stores: readonly Exclude<(typeof EXPECTED_STORES)[number], 'schema_contracts'>[];
  toDatabaseVersion: number;
  validate(db: UpgradeDatabase, transaction: UpgradeTransaction): undefined;
}

// The beta baseline has no predecessor. Every future database version must append a complete,
// contiguous descriptor and retain the fixtures for every released beta source version.
export const DATABASE_MIGRATIONS: readonly DatabaseMigrationDescriptor[] = [
  {
    backupCoverage: 'none',
    domainVersions: [{ domainId: 'mediaLibrary', from: 1, to: 2 }],
    estimateAdditionalBytes: async () => 64 * 1024,
    fromDatabaseVersion: 1,
    toDatabaseVersion: 2,
    risk: 'additive',
    stores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    migrate(db) {
      for (const name of [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE]) {
        db.createObjectStore(name, { keyPath: 'aggregateId' }).createIndex(
          'updatedAt',
          'updatedAt'
        );
      }
      return undefined;
    },
    validate(db) {
      if (
        ![VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE].every((name) =>
          db.objectStoreNames.contains(name)
        )
      ) {
        throw new Error('Video workspace schema creation failed.');
      }
      return undefined;
    },
  },
  {
    backupCoverage: 'none',
    domainVersions: [{ domainId: 'scenarioProjects', from: 1, to: 2 }],
    estimateAdditionalBytes: async () => 64 * 1024,
    fromDatabaseVersion: 2,
    toDatabaseVersion: 3,
    risk: 'additive',
    stores: [SCENARIO_PROJECTS_STORE, SCENARIO_ASSETS_STORE],
    migrate() {
      return undefined;
    },
    validate(db) {
      if (
        ![SCENARIO_PROJECTS_STORE, SCENARIO_ASSETS_STORE].every((name) =>
          db.objectStoreNames.contains(name)
        )
      )
        throw new Error('Scenario tour stores are unavailable.');
      return undefined;
    },
  },
  {
    backupCoverage: 'none',
    domainVersions: [
      { domainId: 'mediaLibrary', from: 2, to: 3 },
      { domainId: 'scenarioProjects', from: 2, to: 3 },
      { domainId: 'videoProjects', from: 1, to: 2 },
    ],
    estimateAdditionalBytes: async () => 64 * 1024,
    fromDatabaseVersion: 3,
    toDatabaseVersion: 4,
    risk: 'additive',
    stores: [MEDIA_LIBRARY_STORE, SCENARIO_PROJECTS_STORE, VIDEO_PROJECTS_STORE],
    migrate() {
      return undefined;
    },
    validate(db) {
      if (
        ![MEDIA_LIBRARY_STORE, SCENARIO_PROJECTS_STORE, VIDEO_PROJECTS_STORE].every((name) =>
          db.objectStoreNames.contains(name)
        )
      )
        throw new Error('Library trash stores are unavailable.');
      return undefined;
    },
  },
  {
    backupCoverage: 'none',
    domainVersions: [{ domainId: 'mediaLibrary', from: 3, to: 4 }],
    estimateAdditionalBytes: async () => 64 * 1024,
    fromDatabaseVersion: 4,
    toDatabaseVersion: 5,
    risk: 'additive',
    stores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    migrate() {
      return undefined;
    },
    validate(db) {
      if (
        ![VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE].every((name) =>
          db.objectStoreNames.contains(name)
        )
      )
        throw new Error('Video speech workspace stores are unavailable.');
      return undefined;
    },
  },
  {
    backupCoverage: 'none',
    domainVersions: [{ domainId: 'mediaLibrary', from: 4, to: 5 }],
    estimateAdditionalBytes: async () => 64 * 1024,
    fromDatabaseVersion: 5,
    toDatabaseVersion: 6,
    risk: 'additive',
    stores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    migrate() {
      return undefined;
    },
    validate(db) {
      if (
        ![VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE].every((name) =>
          db.objectStoreNames.contains(name)
        )
      )
        throw new Error('Video watermark workspace stores are unavailable.');
      return undefined;
    },
  },
  {
    backupCoverage: 'none',
    domainVersions: [{ domainId: 'mediaLibrary', from: 5, to: 6 }],
    estimateAdditionalBytes: async () => 64 * 1024,
    fromDatabaseVersion: 6,
    toDatabaseVersion: 7,
    risk: 'additive',
    stores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    migrate() {
      return undefined;
    },
    validate(db) {
      if (
        ![VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE].every((name) =>
          db.objectStoreNames.contains(name)
        )
      )
        throw new Error('Video presentation workspace stores are unavailable.');
      return undefined;
    },
  },
  {
    backupCoverage: 'none',
    domainVersions: [{ domainId: 'mediaLibrary', from: 6, to: 7 }],
    estimateAdditionalBytes: async () => 64 * 1024,
    fromDatabaseVersion: 7,
    toDatabaseVersion: 8,
    risk: 'additive',
    stores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    migrate() {
      return undefined;
    },
    validate(db) {
      if (
        ![VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE].every((name) =>
          db.objectStoreNames.contains(name)
        )
      )
        throw new Error('Video original speech workspace stores are unavailable.');
      return undefined;
    },
  },
  {
    backupCoverage: 'none',
    domainVersions: [
      { domainId: 'mediaLibrary', from: 7, to: 8 },
      { domainId: 'videoProjects', from: 2, to: 3 },
      { domainId: 'scenarioProjects', from: 3, to: 4 },
    ],
    estimateAdditionalBytes: estimateUsageIndexBytes,
    fromDatabaseVersion: 8,
    toDatabaseVersion: 9,
    risk: 'additive',
    stores: [
      VIDEO_PROJECTS_STORE,
      VIDEO_WORKSPACES_STORE,
      PROJECT_ASSETS_STORE,
      SCENARIO_ASSETS_STORE,
    ],
    migrate(_db, transaction) {
      for (const [name, indexes] of [
        [VIDEO_PROJECTS_STORE, ['usageReferenceKeys']],
        [VIDEO_WORKSPACES_STORE, ['usageReferenceKeys']],
        [PROJECT_ASSETS_STORE, ['originMediaId']],
        [SCENARIO_ASSETS_STORE, ['borrowedMediaId', 'galleryAssetId']],
      ] as const) {
        const store = transaction.objectStore(name);
        if (!store.createIndex) throw new Error('Project usage index creation unavailable.');
        for (const index of indexes)
          store.createIndex(index, index, { multiEntry: index === 'usageReferenceKeys' });
      }
      return undefined;
    },
    validate(db) {
      if (
        ![
          VIDEO_PROJECTS_STORE,
          VIDEO_WORKSPACES_STORE,
          PROJECT_ASSETS_STORE,
          SCENARIO_ASSETS_STORE,
        ].every((name) => db.objectStoreNames.contains(name))
      )
        throw new Error('Project usage index stores are unavailable.');
      return undefined;
    },
  },
  {
    backupCoverage: 'none',
    domainVersions: [{ domainId: 'mediaLibrary', from: 8, to: 9 }],
    estimateAdditionalBytes: async () => 64 * 1024,
    fromDatabaseVersion: 9,
    toDatabaseVersion: 10,
    risk: 'additive',
    stores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    migrate() {
      return undefined;
    },
    validate(db) {
      if (
        ![VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE].every((name) =>
          db.objectStoreNames.contains(name)
        )
      )
        throw new Error('Presentation join workspace stores are unavailable.');
      return undefined;
    },
  },
  {
    backupCoverage: 'none',
    domainVersions: [{ domainId: 'mediaLibrary', from: 9, to: 10 }],
    estimateAdditionalBytes: async () => 64 * 1024,
    fromDatabaseVersion: 10,
    toDatabaseVersion: 11,
    risk: 'additive',
    stores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    migrate() {
      return undefined;
    },
    validate(db) {
      if (
        ![VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE].every((name) =>
          db.objectStoreNames.contains(name)
        )
      )
        throw new Error('Presentation edge workspace stores are unavailable.');
      return undefined;
    },
  },
  {
    backupCoverage: 'none',
    domainVersions: [{ domainId: 'mediaLibrary', from: 10, to: 11 }],
    estimateAdditionalBytes: async () => 64 * 1024,
    fromDatabaseVersion: 11,
    toDatabaseVersion: 12,
    risk: 'additive',
    stores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    migrate() {
      return undefined;
    },
    validate(db) {
      if (
        ![VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE].every((name) =>
          db.objectStoreNames.contains(name)
        )
      )
        throw new Error('Scene appearance workspace stores are unavailable.');
      return undefined;
    },
  },
  {
    backupCoverage: 'none',
    domainVersions: [{ domainId: 'mediaLibrary', from: 11, to: 12 }],
    estimateAdditionalBytes: async () => 64 * 1024,
    fromDatabaseVersion: 12,
    toDatabaseVersion: 13,
    risk: 'additive',
    stores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    migrate() {
      return undefined;
    },
    validate(db) {
      if (
        ![VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE].every((name) =>
          db.objectStoreNames.contains(name)
        )
      )
        throw new Error('Window zoom workspace stores are unavailable.');
      return undefined;
    },
  },
  {
    backupCoverage: 'none',
    domainVersions: [{ domainId: 'mediaLibrary', from: 12, to: 13 }],
    estimateAdditionalBytes: async () => 64 * 1024,
    fromDatabaseVersion: 13,
    toDatabaseVersion: 14,
    risk: 'additive',
    stores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    migrate() {
      return undefined;
    },
    validate(db) {
      if (
        ![VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE].every((name) =>
          db.objectStoreNames.contains(name)
        )
      )
        throw new Error('Text document workspace stores are unavailable.');
      return undefined;
    },
  },
  {
    backupCoverage: 'none',
    domainVersions: [{ domainId: 'mediaLibrary', from: 13, to: 14 }],
    estimateAdditionalBytes: async () => 64 * 1024,
    fromDatabaseVersion: 14,
    toDatabaseVersion: 15,
    risk: 'additive',
    stores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    migrate() {
      return undefined;
    },
    validate(db) {
      if (
        ![VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE].every((name) =>
          db.objectStoreNames.contains(name)
        )
      )
        throw new Error('Source mute workspace stores are unavailable.');
      return undefined;
    },
  },
  {
    backupCoverage: 'none',
    domainVersions: [{ domainId: 'mediaLibrary', from: 14, to: 15 }],
    estimateAdditionalBytes: async () => 64 * 1024,
    fromDatabaseVersion: 15,
    toDatabaseVersion: 16,
    risk: 'additive',
    stores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    migrate() {
      return undefined;
    },
    validate(db) {
      if (
        ![VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE].every((name) =>
          db.objectStoreNames.contains(name)
        )
      )
        throw new Error('Text provenance workspace stores are unavailable.');
      return undefined;
    },
  },
  {
    backupCoverage: 'none',
    domainVersions: [{ domainId: 'mediaLibrary', from: 15, to: 16 }],
    estimateAdditionalBytes: async () => 64 * 1024,
    fromDatabaseVersion: 16,
    toDatabaseVersion: 17,
    risk: 'additive',
    stores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    migrate() {
      return undefined;
    },
    validate(db) {
      if (
        ![VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE].every((name) =>
          db.objectStoreNames.contains(name)
        )
      )
        throw new Error('Source gain operation workspace stores are unavailable.');
      return undefined;
    },
  },
  {
    backupCoverage: 'none',
    domainVersions: [{ domainId: 'mediaLibrary', from: 16, to: 17 }],
    estimateAdditionalBytes: async () => 64 * 1024,
    fromDatabaseVersion: 17,
    toDatabaseVersion: 18,
    risk: 'additive',
    stores: [VIDEO_WORKSPACE_HISTORY_STORE],
    migrate(db) {
      const store = db.createObjectStore(VIDEO_WORKSPACE_HISTORY_STORE, {
        keyPath: ['aggregateId', 'ordinal'],
      });
      store.createIndex('aggregateId', 'aggregateId');
      return undefined;
    },
    validate(db) {
      if (!db.objectStoreNames.contains(VIDEO_WORKSPACE_HISTORY_STORE))
        throw new Error('Video workspace history store is unavailable.');
      return undefined;
    },
  },
  {
    backupCoverage: 'none',
    domainVersions: [{ domainId: 'scenarioProjects', from: 4, to: 5 }],
    estimateAdditionalBytes: async () => 64 * 1024,
    fromDatabaseVersion: 18,
    toDatabaseVersion: 19,
    risk: 'additive',
    stores: [SCENARIO_PROJECT_HISTORY_STORE],
    migrate(db) {
      const store = db.createObjectStore(SCENARIO_PROJECT_HISTORY_STORE, {
        keyPath: ['projectId', 'revision'],
      });
      store.createIndex('projectId', 'projectId');
      return undefined;
    },
    validate(db) {
      if (!db.objectStoreNames.contains(SCENARIO_PROJECT_HISTORY_STORE))
        throw new Error('Scenario project history store is unavailable.');
      return undefined;
    },
  },
  {
    backupCoverage: 'none',
    domainVersions: [{ domainId: 'scenarioProjects', from: 5, to: 6 }],
    estimateAdditionalBytes: async () => 64 * 1024,
    fromDatabaseVersion: 19,
    toDatabaseVersion: 20,
    risk: 'additive',
    stores: [SCENARIO_PROJECT_UNITS_STORE],
    migrate(db) {
      const store = db.createObjectStore(SCENARIO_PROJECT_UNITS_STORE, {
        keyPath: ['projectId', 'unitId', 'revision'],
      });
      store.createIndex('projectId', 'projectId');
      return undefined;
    },
    validate(db) {
      if (!db.objectStoreNames.contains(SCENARIO_PROJECT_UNITS_STORE))
        throw new Error('Scenario project units store is unavailable.');
      return undefined;
    },
  },
  {
    backupCoverage: 'none',
    domainVersions: [{ domainId: 'mediaLibrary', from: 17, to: 18 }],
    estimateAdditionalBytes: async () => 64 * 1024,
    fromDatabaseVersion: 20,
    toDatabaseVersion: 21,
    risk: 'additive',
    stores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_HISTORY_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    migrate() {
      return undefined;
    },
    validate(db) {
      if (
        ![
          VIDEO_WORKSPACES_STORE,
          VIDEO_WORKSPACE_HISTORY_STORE,
          VIDEO_WORKSPACE_DRAFTS_STORE,
          PROJECT_ASSETS_STORE,
        ].every((name) => db.objectStoreNames.contains(name))
      )
        throw new Error('Annotation effect workspace stores are unavailable.');
      return undefined;
    },
  },
];

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

/** Estimate the one-time native alias indexes before upgrade; derived document keys backfill later. */
async function estimateUsageIndexBytes(source?: DatabaseMigrationSource): Promise<number> {
  if (!source) throw new Error('Source database unavailable for usage index estimation.');
  let bytes = 64 * 1024;
  for (const name of [PROJECT_ASSETS_STORE, SCENARIO_ASSETS_STORE]) {
    let cursor = await source.transaction(name, 'readonly').store.openCursor();
    while (cursor) {
      bytes += aliasIndexRowBytes(name, cursor.value, cursor.primaryKey);
      cursor = await cursor.continue();
    }
  }
  return bytes;
}

function aliasIndexRowBytes(store: string, value: unknown, primaryKey: IDBValidKey): number {
  if (!isUnknownRecord(value)) return 0;
  const fields =
    store === PROJECT_ASSETS_STORE ? ['originMediaId'] : ['borrowedMediaId', 'galleryAssetId'];
  let bytes = 0;
  for (const field of fields) {
    const alias = value[field];
    if (typeof alias !== 'string') continue;
    if (typeof primaryKey !== 'string') throw new Error('Invalid project usage index key.');
    bytes += 1024 + 4 * (alias.length + primaryKey.length);
  }
  return bytes;
}

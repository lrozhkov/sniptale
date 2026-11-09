import {
  installSyncQueueSummaryIndexes,
  estimateSyncQueueSummaryIndexBytes,
} from './sync-queue-index-migration';
import {
  installDeletionReferenceIndexes,
  estimateDeletionReferenceIndexBytes,
} from './deletion-index-migration';
import { REFERENCE_INDEX_STORES } from './row-index-contract';
import type { UpgradeDatabase, UpgradeTransaction } from './upgrade/types';
import { ROW_REFERENCE_INDEX } from './row-index-contract';
import { estimateUsageIndexBytes } from './usage-index-migration';
import type { DatabaseMigrationDescriptor } from './schema-contract-types';
import {
  VOICE_INPUT_HISTORY_STORE,
  SYNC_CAPTURE_STORE,
  SYNC_OUTBOX_STORE,
  SYNC_CATALOG_CACHE_STORE,
  SYNC_CONNECTION_STORE,
  SECRET_PROTECTION_STORE,
  ASSET_OPERATIONS_STORE,
  ASSET_RESIDENCY_STORE,
  VIDEO_WORKSPACES_STORE,
  VIDEO_WORKSPACE_HISTORY_STORE,
  VIDEO_WORKSPACE_DRAFTS_STORE,
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  SCENARIO_ASSETS_STORE,
  SCENARIO_PROJECTS_STORE,
  SCENARIO_PROJECT_HISTORY_STORE,
  SCENARIO_PROJECT_UNITS_STORE,
  VIDEO_PROJECTS_STORE,
  VIDEO_PROJECT_REVISIONS_STORE,
  RECORDING_TELEMETRY_STORE,
  RECORDING_RECOVERY_SESSIONS_STORE,
  RECORDING_RECOVERY_BLOCKS_STORE,
  RECORDING_CURSOR_TRAJECTORIES_STORE,
  RECORDING_CURSOR_BLOCKS_STORE,
  RECORDING_EVENTS_STORE,
  STORE_NAME,
} from './core.stores.ts';

/** Checks this released descriptor's required stores without reading or changing source data. */
function requireMigrationStores(
  db: UpgradeDatabase,
  stores: readonly string[],
  diagnostic: string
): undefined {
  if (!stores.every((name) => db.objectStoreNames.contains(name))) throw new Error(diagnostic);
  return undefined;
}

/** Released contract-only revisions keep their exact metadata and validation stores. */
function contractOnlyMigration(
  input: Pick<
    DatabaseMigrationDescriptor,
    'domainVersions' | 'fromDatabaseVersion' | 'toDatabaseVersion' | 'stores'
  > & { validationStores: readonly string[]; diagnostic: string }
): DatabaseMigrationDescriptor {
  const { validationStores, diagnostic, ...descriptor } = input;
  return {
    ...descriptor,
    backupCoverage: 'none',
    risk: 'additive',
    estimateAdditionalBytes: async () => 64 * 1024,
    migrate() {
      return undefined;
    },
    validate(db) {
      return requireMigrationStores(db, validationStores, diagnostic);
    },
  };
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
  contractOnlyMigration({
    domainVersions: [{ domainId: 'scenarioProjects', from: 1, to: 2 }],
    fromDatabaseVersion: 2,
    toDatabaseVersion: 3,
    stores: [SCENARIO_PROJECTS_STORE, SCENARIO_ASSETS_STORE],
    validationStores: [SCENARIO_PROJECTS_STORE, SCENARIO_ASSETS_STORE],
    diagnostic: 'Scenario tour stores are unavailable.',
  }),
  contractOnlyMigration({
    domainVersions: [
      { domainId: 'mediaLibrary', from: 2, to: 3 },
      { domainId: 'scenarioProjects', from: 2, to: 3 },
      { domainId: 'videoProjects', from: 1, to: 2 },
    ],
    fromDatabaseVersion: 3,
    toDatabaseVersion: 4,
    stores: [MEDIA_LIBRARY_STORE, SCENARIO_PROJECTS_STORE, VIDEO_PROJECTS_STORE],
    validationStores: [MEDIA_LIBRARY_STORE, SCENARIO_PROJECTS_STORE, VIDEO_PROJECTS_STORE],
    diagnostic: 'Library trash stores are unavailable.',
  }),
  contractOnlyMigration({
    domainVersions: [{ domainId: 'mediaLibrary', from: 3, to: 4 }],
    fromDatabaseVersion: 4,
    toDatabaseVersion: 5,
    stores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    validationStores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    diagnostic: 'Video speech workspace stores are unavailable.',
  }),
  contractOnlyMigration({
    domainVersions: [{ domainId: 'mediaLibrary', from: 4, to: 5 }],
    fromDatabaseVersion: 5,
    toDatabaseVersion: 6,
    stores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    validationStores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    diagnostic: 'Video watermark workspace stores are unavailable.',
  }),
  contractOnlyMigration({
    domainVersions: [{ domainId: 'mediaLibrary', from: 5, to: 6 }],
    fromDatabaseVersion: 6,
    toDatabaseVersion: 7,
    stores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    validationStores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    diagnostic: 'Video presentation workspace stores are unavailable.',
  }),
  contractOnlyMigration({
    domainVersions: [{ domainId: 'mediaLibrary', from: 6, to: 7 }],
    fromDatabaseVersion: 7,
    toDatabaseVersion: 8,
    stores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    validationStores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    diagnostic: 'Video original speech workspace stores are unavailable.',
  }),
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
  contractOnlyMigration({
    domainVersions: [{ domainId: 'mediaLibrary', from: 8, to: 9 }],
    fromDatabaseVersion: 9,
    toDatabaseVersion: 10,
    stores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    validationStores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    diagnostic: 'Presentation join workspace stores are unavailable.',
  }),
  contractOnlyMigration({
    domainVersions: [{ domainId: 'mediaLibrary', from: 9, to: 10 }],
    fromDatabaseVersion: 10,
    toDatabaseVersion: 11,
    stores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    validationStores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    diagnostic: 'Presentation edge workspace stores are unavailable.',
  }),
  contractOnlyMigration({
    domainVersions: [{ domainId: 'mediaLibrary', from: 10, to: 11 }],
    fromDatabaseVersion: 11,
    toDatabaseVersion: 12,
    stores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    validationStores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    diagnostic: 'Scene appearance workspace stores are unavailable.',
  }),
  contractOnlyMigration({
    domainVersions: [{ domainId: 'mediaLibrary', from: 11, to: 12 }],
    fromDatabaseVersion: 12,
    toDatabaseVersion: 13,
    stores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    validationStores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    diagnostic: 'Window zoom workspace stores are unavailable.',
  }),
  contractOnlyMigration({
    domainVersions: [{ domainId: 'mediaLibrary', from: 12, to: 13 }],
    fromDatabaseVersion: 13,
    toDatabaseVersion: 14,
    stores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    validationStores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    diagnostic: 'Text document workspace stores are unavailable.',
  }),
  contractOnlyMigration({
    domainVersions: [{ domainId: 'mediaLibrary', from: 13, to: 14 }],
    fromDatabaseVersion: 14,
    toDatabaseVersion: 15,
    stores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    validationStores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    diagnostic: 'Source mute workspace stores are unavailable.',
  }),
  contractOnlyMigration({
    domainVersions: [{ domainId: 'mediaLibrary', from: 14, to: 15 }],
    fromDatabaseVersion: 15,
    toDatabaseVersion: 16,
    stores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    validationStores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    diagnostic: 'Text provenance workspace stores are unavailable.',
  }),
  contractOnlyMigration({
    domainVersions: [{ domainId: 'mediaLibrary', from: 15, to: 16 }],
    fromDatabaseVersion: 16,
    toDatabaseVersion: 17,
    stores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    validationStores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    diagnostic: 'Source gain operation workspace stores are unavailable.',
  }),
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
  contractOnlyMigration({
    domainVersions: [{ domainId: 'mediaLibrary', from: 17, to: 18 }],
    fromDatabaseVersion: 20,
    toDatabaseVersion: 21,
    stores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_HISTORY_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    validationStores: [
      VIDEO_WORKSPACES_STORE,
      VIDEO_WORKSPACE_HISTORY_STORE,
      VIDEO_WORKSPACE_DRAFTS_STORE,
      PROJECT_ASSETS_STORE,
    ],
    diagnostic: 'Annotation effect workspace stores are unavailable.',
  }),
  contractOnlyMigration({
    domainVersions: [{ domainId: 'mediaLibrary', from: 18, to: 19 }],
    fromDatabaseVersion: 21,
    toDatabaseVersion: 22,
    stores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_HISTORY_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    validationStores: [
      VIDEO_WORKSPACES_STORE,
      VIDEO_WORKSPACE_HISTORY_STORE,
      VIDEO_WORKSPACE_DRAFTS_STORE,
    ],
    diagnostic: 'PCM speech workspace stores are unavailable.',
  }),
  contractOnlyMigration({
    domainVersions: [{ domainId: 'mediaLibrary', from: 19, to: 20 }],
    fromDatabaseVersion: 22,
    toDatabaseVersion: 23,
    stores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_HISTORY_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    validationStores: [
      VIDEO_WORKSPACES_STORE,
      VIDEO_WORKSPACE_HISTORY_STORE,
      VIDEO_WORKSPACE_DRAFTS_STORE,
    ],
    diagnostic: 'Action audio workspace stores are unavailable.',
  }),
  contractOnlyMigration({
    domainVersions: [
      { domainId: 'mediaLibrary', from: 20, to: 21 },
      { domainId: 'scenarioProjects', from: 6, to: 7 },
    ],
    fromDatabaseVersion: 23,
    toDatabaseVersion: 24,
    stores: [
      VIDEO_WORKSPACES_STORE,
      VIDEO_WORKSPACE_HISTORY_STORE,
      VIDEO_WORKSPACE_DRAFTS_STORE,
      SCENARIO_PROJECTS_STORE,
      SCENARIO_PROJECT_HISTORY_STORE,
      SCENARIO_PROJECT_UNITS_STORE,
    ],
    validationStores: [
      VIDEO_WORKSPACES_STORE,
      VIDEO_WORKSPACE_HISTORY_STORE,
      VIDEO_WORKSPACE_DRAFTS_STORE,
      SCENARIO_PROJECTS_STORE,
      SCENARIO_PROJECT_HISTORY_STORE,
      SCENARIO_PROJECT_UNITS_STORE,
    ],
    diagnostic: 'Bounded editor history stores are unavailable.',
  }),
  contractOnlyMigration({
    domainVersions: [{ domainId: 'assetGraph', from: 1, to: 2 }],
    fromDatabaseVersion: 24,
    toDatabaseVersion: 25,
    stores: [ASSET_OPERATIONS_STORE],
    validationStores: [ASSET_OPERATIONS_STORE],
    diagnostic: 'Private source retirement outbox is unavailable.',
  }),
  contractOnlyMigration({
    domainVersions: [{ domainId: 'assetGraph', from: 2, to: 3 }],
    fromDatabaseVersion: 25,
    toDatabaseVersion: 26,
    stores: [ASSET_OPERATIONS_STORE],
    validationStores: [ASSET_OPERATIONS_STORE],
    diagnostic: 'Known-source publication recovery is unavailable.',
  }),
  contractOnlyMigration({
    domainVersions: [
      { domainId: 'recordings', from: 1, to: 2 },
      { domainId: 'mediaLibrary', from: 21, to: 22 },
      { domainId: 'videoProjects', from: 3, to: 4 },
    ],
    fromDatabaseVersion: 26,
    toDatabaseVersion: 27,
    stores: [
      RECORDING_TELEMETRY_STORE,
      VIDEO_WORKSPACES_STORE,
      VIDEO_WORKSPACE_HISTORY_STORE,
      VIDEO_WORKSPACE_DRAFTS_STORE,
      VIDEO_PROJECTS_STORE,
    ],
    validationStores: [
      RECORDING_TELEMETRY_STORE,
      VIDEO_WORKSPACES_STORE,
      VIDEO_WORKSPACE_HISTORY_STORE,
      VIDEO_WORKSPACE_DRAFTS_STORE,
      VIDEO_PROJECTS_STORE,
    ],
    diagnostic: 'Interaction authoring stores are unavailable.',
  }),
  contractOnlyMigration({
    domainVersions: [
      { domainId: 'mediaLibrary', from: 22, to: 23 },
      { domainId: 'videoProjects', from: 4, to: 5 },
    ],
    fromDatabaseVersion: 27,
    toDatabaseVersion: 28,
    stores: [
      VIDEO_WORKSPACES_STORE,
      VIDEO_WORKSPACE_HISTORY_STORE,
      VIDEO_WORKSPACE_DRAFTS_STORE,
      VIDEO_PROJECTS_STORE,
    ],
    validationStores: [
      VIDEO_WORKSPACES_STORE,
      VIDEO_WORKSPACE_HISTORY_STORE,
      VIDEO_WORKSPACE_DRAFTS_STORE,
      VIDEO_PROJECTS_STORE,
    ],
    diagnostic: 'Camera policy stores are unavailable.',
  }),
  contractOnlyMigration({
    domainVersions: [{ domainId: 'mediaLibrary', from: 23, to: 24 }],
    fromDatabaseVersion: 28,
    toDatabaseVersion: 29,
    stores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_HISTORY_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    validationStores: [
      VIDEO_WORKSPACES_STORE,
      VIDEO_WORKSPACE_HISTORY_STORE,
      VIDEO_WORKSPACE_DRAFTS_STORE,
    ],
    diagnostic: 'Review project metadata stores are unavailable.',
  }),
  contractOnlyMigration({
    domainVersions: [{ domainId: 'mediaLibrary', from: 24, to: 25 }],
    fromDatabaseVersion: 29,
    toDatabaseVersion: 30,
    stores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_HISTORY_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    validationStores: [
      VIDEO_WORKSPACES_STORE,
      VIDEO_WORKSPACE_HISTORY_STORE,
      VIDEO_WORKSPACE_DRAFTS_STORE,
    ],
    diagnostic: 'Source crop workspace stores are unavailable.',
  }),
  contractOnlyMigration({
    domainVersions: [{ domainId: 'mediaLibrary', from: 25, to: 26 }],
    fromDatabaseVersion: 30,
    toDatabaseVersion: 31,
    stores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_HISTORY_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    validationStores: [
      VIDEO_WORKSPACES_STORE,
      VIDEO_WORKSPACE_HISTORY_STORE,
      VIDEO_WORKSPACE_DRAFTS_STORE,
    ],
    diagnostic: 'Workspace color stores are unavailable.',
  }),
  contractOnlyMigration({
    domainVersions: [{ domainId: 'mediaLibrary', from: 26, to: 27 }],
    fromDatabaseVersion: 31,
    toDatabaseVersion: 32,
    stores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_HISTORY_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    validationStores: [
      VIDEO_WORKSPACES_STORE,
      VIDEO_WORKSPACE_HISTORY_STORE,
      VIDEO_WORKSPACE_DRAFTS_STORE,
    ],
    diagnostic: 'Track control stores are unavailable.',
  }),
  {
    backupCoverage: 'none',
    domainVersions: [{ domainId: 'recordings', from: 2, to: 3 }],
    estimateAdditionalBytes: async () => 64 * 1024,
    fromDatabaseVersion: 32,
    toDatabaseVersion: 33,
    risk: 'additive',
    stores: [RECORDING_RECOVERY_SESSIONS_STORE, RECORDING_RECOVERY_BLOCKS_STORE],
    migrate(db) {
      db.createObjectStore(RECORDING_RECOVERY_SESSIONS_STORE, { keyPath: 'id' }).createIndex(
        'createdAt',
        'createdAt'
      );
      db.createObjectStore(RECORDING_RECOVERY_BLOCKS_STORE, {
        keyPath: ['id', 'index'],
      }).createIndex('id', 'id');
      return undefined;
    },
    validate(db) {
      if (
        ![RECORDING_RECOVERY_SESSIONS_STORE, RECORDING_RECOVERY_BLOCKS_STORE].every((name) =>
          db.objectStoreNames.contains(name)
        )
      ) {
        throw new Error('Recording recovery stores are unavailable.');
      }
      return undefined;
    },
  },
  contractOnlyMigration({
    domainVersions: [{ domainId: 'scenarioProjects', from: 7, to: 8 }],
    fromDatabaseVersion: 33,
    toDatabaseVersion: 34,
    stores: [SCENARIO_PROJECTS_STORE, SCENARIO_PROJECT_HISTORY_STORE, SCENARIO_PROJECT_UNITS_STORE],
    validationStores: [
      SCENARIO_PROJECTS_STORE,
      SCENARIO_PROJECT_HISTORY_STORE,
      SCENARIO_PROJECT_UNITS_STORE,
    ],
    diagnostic: 'Scenario framing stores are unavailable.',
  }),
  {
    backupCoverage: 'none',
    domainVersions: [{ domainId: 'voiceInputHistory', from: 0, to: 1 }],
    estimateAdditionalBytes: async () => 64 * 1024,
    fromDatabaseVersion: 34,
    toDatabaseVersion: 35,
    risk: 'additive',
    stores: [VOICE_INPUT_HISTORY_STORE],
    migrate(db) {
      db.createObjectStore(VOICE_INPUT_HISTORY_STORE, { keyPath: 'id' });
      return undefined;
    },
    validate(db) {
      if (!db.objectStoreNames.contains(VOICE_INPUT_HISTORY_STORE))
        throw new Error('Voice history store is unavailable.');
      return undefined;
    },
  },
  contractOnlyMigration({
    domainVersions: [{ domainId: 'mediaLibrary', from: 27, to: 28 }],
    fromDatabaseVersion: 35,
    toDatabaseVersion: 36,
    stores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_HISTORY_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    validationStores: [
      VIDEO_WORKSPACES_STORE,
      VIDEO_WORKSPACE_HISTORY_STORE,
      VIDEO_WORKSPACE_DRAFTS_STORE,
    ],
    diagnostic: 'Quick project stores are unavailable.',
  }),
  contractOnlyMigration({
    domainVersions: [
      { domainId: 'mediaLibrary', from: 28, to: 29 },
      { domainId: 'videoProjects', from: 5, to: 6 },
    ],
    fromDatabaseVersion: 36,
    toDatabaseVersion: 37,
    stores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_HISTORY_STORE, VIDEO_PROJECTS_STORE],
    validationStores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_HISTORY_STORE, VIDEO_PROJECTS_STORE],
    diagnostic: 'Camera project stores are unavailable.',
  }),
  contractOnlyMigration({
    domainVersions: [
      { domainId: 'mediaLibrary', from: 29, to: 30 },
      { domainId: 'videoProjects', from: 6, to: 7 },
    ],
    fromDatabaseVersion: 37,
    toDatabaseVersion: 38,
    stores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_HISTORY_STORE, VIDEO_PROJECTS_STORE],
    validationStores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_HISTORY_STORE, VIDEO_PROJECTS_STORE],
    diagnostic: 'Camera project stores are unavailable.',
  }),
  contractOnlyMigration({
    domainVersions: [
      { domainId: 'mediaLibrary', from: 30, to: 31 },
      { domainId: 'videoProjects', from: 7, to: 8 },
    ],
    fromDatabaseVersion: 38,
    toDatabaseVersion: 39,
    stores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_HISTORY_STORE, VIDEO_PROJECTS_STORE],
    validationStores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_HISTORY_STORE, VIDEO_PROJECTS_STORE],
    diagnostic: 'Camera project stores are unavailable.',
  }),
  {
    backupCoverage: 'none',
    domainVersions: [
      { domainId: 'syncCapture', from: 0, to: 1 },
      { domainId: 'videoProjects', from: 8, to: 9 },
    ],
    estimateAdditionalBytes: async () => 64 * 1024,
    fromDatabaseVersion: 39,
    toDatabaseVersion: 40,
    risk: 'additive',
    stores: [SYNC_CAPTURE_STORE, VIDEO_PROJECT_REVISIONS_STORE],
    migrate(db) {
      const store = db.createObjectStore(SYNC_CAPTURE_STORE, { keyPath: 'key' });
      for (const index of ['kind', 'rootKey', 'createdAt']) store.createIndex(index, index);
      db.createObjectStore(VIDEO_PROJECT_REVISIONS_STORE, { keyPath: 'projectId' });
      return undefined;
    },
    validate(db) {
      return requireMigrationStores(
        db,
        [SYNC_CAPTURE_STORE, VIDEO_PROJECT_REVISIONS_STORE],
        'Sync capture or project revision store is unavailable.'
      );
    },
  },
  {
    backupCoverage: 'none',
    domainVersions: [{ domainId: 'syncCapture', from: 1, to: 2 }],
    estimateAdditionalBytes: async () => 64 * 1024,
    fromDatabaseVersion: 40,
    toDatabaseVersion: 41,
    risk: 'additive',
    stores: [SYNC_OUTBOX_STORE],
    migrate(db) {
      db.createObjectStore(SYNC_OUTBOX_STORE, { keyPath: 'key' });
      return undefined;
    },
    validate(db) {
      return requireMigrationStores(db, [SYNC_OUTBOX_STORE], 'Sync outbox store is unavailable.');
    },
  },
  {
    backupCoverage: 'none',
    domainVersions: [{ domainId: 'syncCapture', from: 2, to: 3 }],
    estimateAdditionalBytes: async () => 64 * 1024,
    fromDatabaseVersion: 41,
    toDatabaseVersion: 42,
    risk: 'additive',
    stores: [SYNC_CATALOG_CACHE_STORE],
    migrate(db) {
      db.createObjectStore(SYNC_CATALOG_CACHE_STORE, { keyPath: 'key' });
      return undefined;
    },
    validate(db) {
      return requireMigrationStores(
        db,
        [SYNC_CATALOG_CACHE_STORE],
        'Sync catalog cache store is unavailable.'
      );
    },
  },
  contractOnlyMigration({
    domainVersions: [{ domainId: 'syncCapture', from: 3, to: 4 }],
    fromDatabaseVersion: 42,
    toDatabaseVersion: 43,
    stores: [SYNC_CAPTURE_STORE, SYNC_OUTBOX_STORE, SYNC_CATALOG_CACHE_STORE],
    validationStores: [SYNC_CAPTURE_STORE, SYNC_OUTBOX_STORE, SYNC_CATALOG_CACHE_STORE],
    diagnostic: 'Sync queue control stores are unavailable.',
  }),
  {
    backupCoverage: 'none',
    domainVersions: [{ domainId: 'syncCapture', from: 4, to: 5 }],
    estimateAdditionalBytes: async () => 64 * 1024,
    fromDatabaseVersion: 43,
    toDatabaseVersion: 44,
    risk: 'additive',
    stores: [SYNC_CONNECTION_STORE],
    migrate(db) {
      db.createObjectStore(SYNC_CONNECTION_STORE, { keyPath: 'key' });
      return undefined;
    },
    validate(db) {
      return requireMigrationStores(
        db,
        [SYNC_CAPTURE_STORE, SYNC_OUTBOX_STORE, SYNC_CATALOG_CACHE_STORE, SYNC_CONNECTION_STORE],
        'Sync connection stores are unavailable.'
      );
    },
  },
  {
    backupCoverage: 'none',
    domainVersions: [{ domainId: 'syncCapture', from: 5, to: 6 }],
    estimateAdditionalBytes: async () => 64 * 1024,
    fromDatabaseVersion: 44,
    toDatabaseVersion: 45,
    risk: 'additive',
    stores: [SYNC_OUTBOX_STORE],
    migrate(_db, transaction) {
      const store = transaction.objectStore(SYNC_OUTBOX_STORE);
      if (!store.createIndex) throw new Error('Sync queue due index creation unavailable.');
      store.createIndex(
        'syncQueueDue',
        [
          'spaceId',
          'connectionGeneration',
          'profileCreatedAt',
          'authorization.incarnation',
          'nextDueAt',
          'key',
        ],
        { unique: false }
      );
      return undefined;
    },
    validate(db) {
      return requireMigrationStores(
        db,
        [SYNC_OUTBOX_STORE],
        'Sync queue due store is unavailable.'
      );
    },
  },
  {
    backupCoverage: 'none',
    domainVersions: [{ domainId: 'assetGraph', from: 3, to: 4 }],
    estimateAdditionalBytes: async () => 64 * 1024,
    fromDatabaseVersion: 45,
    toDatabaseVersion: 46,
    risk: 'additive',
    stores: [ASSET_RESIDENCY_STORE],
    migrate(db) {
      db.createObjectStore(ASSET_RESIDENCY_STORE, { keyPath: 'id' });
      return undefined;
    },
    validate(db) {
      return requireMigrationStores(
        db,
        [ASSET_RESIDENCY_STORE],
        'Asset residency store is unavailable.'
      );
    },
  },
  contractOnlyMigration({
    domainVersions: [{ domainId: 'mediaLibrary', from: 31, to: 32 }],
    fromDatabaseVersion: 46,
    toDatabaseVersion: 47,
    stores: [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_HISTORY_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    validationStores: [
      VIDEO_WORKSPACES_STORE,
      VIDEO_WORKSPACE_HISTORY_STORE,
      VIDEO_WORKSPACE_DRAFTS_STORE,
    ],
    diagnostic: 'Text placement stores are unavailable.',
  }),
  {
    backupCoverage: 'none',
    domainVersions: [
      { domainId: 'recordings', from: 3, to: 4 },
      { domainId: 'mediaLibrary', from: 32, to: 33 },
      { domainId: 'assetGraph', from: 4, to: 5 },
      { domainId: 'videoProjects', from: 9, to: 10 },
      { domainId: 'scenarioProjects', from: 8, to: 9 },
      { domainId: 'snapshots', from: 1, to: 2 },
      { domainId: 'syncCapture', from: 6, to: 7 },
    ],
    estimateAdditionalBytes: estimateDeletionReferenceIndexBytes,
    fromDatabaseVersion: 47,
    toDatabaseVersion: 48,
    risk: 'additive',
    stores: [...REFERENCE_INDEX_STORES, RECORDING_RECOVERY_SESSIONS_STORE],
    migrate(_db, transaction) {
      return installDeletionReferenceIndexes(transaction);
    },
    validate(db) {
      return requireMigrationStores(
        db,
        REFERENCE_INDEX_STORES,
        'Deletion reference stores are unavailable.'
      );
    },
  },
  contractOnlyMigration({
    domainVersions: [{ domainId: 'syncCapture', from: 7, to: 8 }],
    fromDatabaseVersion: 48,
    toDatabaseVersion: 49,
    stores: [SYNC_CAPTURE_STORE, SYNC_OUTBOX_STORE, SYNC_CONNECTION_STORE],
    validationStores: [SYNC_CAPTURE_STORE, SYNC_OUTBOX_STORE, SYNC_CONNECTION_STORE],
    diagnostic: 'Sync checkpoint stores are unavailable.',
  }),
  {
    backupCoverage: 'none',
    domainVersions: [{ domainId: 'secretProtection', from: 0, to: 1 }],
    estimateAdditionalBytes: async () => 64 * 1024,
    fromDatabaseVersion: 49,
    toDatabaseVersion: 50,
    risk: 'additive',
    stores: [SECRET_PROTECTION_STORE],
    migrate(db) {
      db.createObjectStore(SECRET_PROTECTION_STORE, { keyPath: 'key' });
      return undefined;
    },
    validate(db) {
      return requireMigrationStores(
        db,
        [SECRET_PROTECTION_STORE],
        'Secret protection store is unavailable.'
      );
    },
  },
  {
    backupCoverage: 'none',
    domainVersions: [{ domainId: 'syncCapture', from: 8, to: 9 }],
    estimateAdditionalBytes: estimateSyncQueueSummaryIndexBytes,
    fromDatabaseVersion: 50,
    toDatabaseVersion: 51,
    risk: 'additive',
    stores: [SYNC_CAPTURE_STORE, SYNC_OUTBOX_STORE],
    migrate(_db, transaction) {
      return installSyncQueueSummaryIndexes(transaction);
    },
    validate(db) {
      return requireMigrationStores(
        db,
        [SYNC_CAPTURE_STORE, SYNC_OUTBOX_STORE],
        'Sync queue summary stores are unavailable.'
      );
    },
  },
  {
    backupCoverage: 'none',
    domainVersions: [
      { domainId: 'recordings', from: 4, to: 5 },
      { domainId: 'assetGraph', from: 5, to: 6 },
      { domainId: 'mediaLibrary', from: 33, to: 34 },
      { domainId: 'scenarioProjects', from: 9, to: 10 },
      { domainId: 'snapshots', from: 2, to: 3 },
      { domainId: 'syncCapture', from: 9, to: 10 },
      { domainId: 'videoProjects', from: 10, to: 11 },
    ],
    estimateAdditionalBytes: estimateDeletionReferenceIndexBytes,
    fromDatabaseVersion: 51,
    toDatabaseVersion: 52,
    risk: 'additive',
    stores: [
      ...REFERENCE_INDEX_STORES,
      RECORDING_RECOVERY_SESSIONS_STORE,
      RECORDING_CURSOR_TRAJECTORIES_STORE,
      RECORDING_CURSOR_BLOCKS_STORE,
    ],
    migrate(db, transaction) {
      // WT2 used physical47/48 before the branches merged. Preserve its existing history.
      if (!db.objectStoreNames.contains(RECORDING_CURSOR_TRAJECTORIES_STORE)) {
        db.createObjectStore(RECORDING_CURSOR_TRAJECTORIES_STORE, {
          keyPath: ['recordingId', 'trajectoryId'],
        }).createIndex('recordingId', 'recordingId');
      }
      ensureSnapshotAssetIndex(transaction, RECORDING_CURSOR_TRAJECTORIES_STORE);
      if (!db.objectStoreNames.contains(RECORDING_CURSOR_BLOCKS_STORE)) {
        const blocks = db.createObjectStore(RECORDING_CURSOR_BLOCKS_STORE, {
          keyPath: ['recordingId', 'trajectoryId', 'sequence'],
        });
        blocks.createIndex('trajectory', ['recordingId', 'trajectoryId']);
        blocks.createIndex('time', ['recordingId', 'trajectoryId', 'startTimeUs', 'sequence']);
      }
      if (transaction.objectStore(STORE_NAME).indexNames?.contains(ROW_REFERENCE_INDEX) === false)
        installDeletionReferenceIndexes(transaction);
      return undefined;
    },
    validate(db) {
      return requireMigrationStores(
        db,
        [RECORDING_CURSOR_TRAJECTORIES_STORE, RECORDING_CURSOR_BLOCKS_STORE],
        'Cursor trajectory stores are unavailable.'
      );
    },
  },
  {
    backupCoverage: 'none',
    domainVersions: [{ domainId: 'recordings', from: 5, to: 6 }],
    estimateAdditionalBytes: async () => 64 * 1024,
    fromDatabaseVersion: 52,
    toDatabaseVersion: 53,
    risk: 'additive',
    stores: [RECORDING_EVENTS_STORE],
    migrate(db, transaction) {
      if (!db.objectStoreNames.contains(RECORDING_EVENTS_STORE)) {
        const events = db.createObjectStore(RECORDING_EVENTS_STORE, {
          keyPath: ['recordingId', 'eventStreamId', 'kind', 'entryId'],
        });
        events.createIndex('kind', 'kind');
        events.createIndex('timeBuckets', 'timeBuckets', { multiEntry: true });
      }
      ensureSnapshotAssetIndex(transaction, RECORDING_EVENTS_STORE);
      return undefined;
    },
    validate(db) {
      return requireMigrationStores(
        db,
        [RECORDING_EVENTS_STORE],
        'Recording events store is unavailable.'
      );
    },
  },
];

function ensureSnapshotAssetIndex(transaction: UpgradeTransaction, name: string): void {
  const store = transaction.objectStore(name);
  if (store.indexNames?.contains('snapshotAssetId')) return;
  if (!store.createIndex) throw new Error('History snapshot index creation is unavailable.');
  store.createIndex('snapshotAssetId', 'snapshotAssetId');
}

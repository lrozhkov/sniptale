import { estimateUsageIndexBytes } from './usage-index-migration';
import type { DatabaseMigrationDescriptor } from './schema-contract-types';
import {
  ASSET_OPERATIONS_STORE,
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
  RECORDING_TELEMETRY_STORE,
  RECORDING_RECOVERY_SESSIONS_STORE,
  RECORDING_RECOVERY_BLOCKS_STORE,
} from './core.stores.ts';

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
  {
    backupCoverage: 'none',
    domainVersions: [{ domainId: 'mediaLibrary', from: 18, to: 19 }],
    estimateAdditionalBytes: async () => 64 * 1024,
    fromDatabaseVersion: 21,
    toDatabaseVersion: 22,
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
        ].every((name) => db.objectStoreNames.contains(name))
      )
        throw new Error('PCM speech workspace stores are unavailable.');
      return undefined;
    },
  },
  {
    backupCoverage: 'none',
    domainVersions: [{ domainId: 'mediaLibrary', from: 19, to: 20 }],
    estimateAdditionalBytes: async () => 64 * 1024,
    fromDatabaseVersion: 22,
    toDatabaseVersion: 23,
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
        ].every((name) => db.objectStoreNames.contains(name))
      )
        throw new Error('Action audio workspace stores are unavailable.');
      return undefined;
    },
  },
  {
    backupCoverage: 'none',
    domainVersions: [
      { domainId: 'mediaLibrary', from: 20, to: 21 },
      { domainId: 'scenarioProjects', from: 6, to: 7 },
    ],
    estimateAdditionalBytes: async () => 64 * 1024,
    fromDatabaseVersion: 23,
    toDatabaseVersion: 24,
    risk: 'additive',
    stores: [
      VIDEO_WORKSPACES_STORE,
      VIDEO_WORKSPACE_HISTORY_STORE,
      VIDEO_WORKSPACE_DRAFTS_STORE,
      SCENARIO_PROJECTS_STORE,
      SCENARIO_PROJECT_HISTORY_STORE,
      SCENARIO_PROJECT_UNITS_STORE,
    ],
    migrate() {
      return undefined;
    },
    validate(db) {
      if (
        ![
          VIDEO_WORKSPACES_STORE,
          VIDEO_WORKSPACE_HISTORY_STORE,
          VIDEO_WORKSPACE_DRAFTS_STORE,
          SCENARIO_PROJECTS_STORE,
          SCENARIO_PROJECT_HISTORY_STORE,
          SCENARIO_PROJECT_UNITS_STORE,
        ].every((name) => db.objectStoreNames.contains(name))
      )
        throw new Error('Bounded editor history stores are unavailable.');
      return undefined;
    },
  },
  {
    backupCoverage: 'none',
    domainVersions: [{ domainId: 'assetGraph', from: 1, to: 2 }],
    estimateAdditionalBytes: async () => 64 * 1024,
    fromDatabaseVersion: 24,
    toDatabaseVersion: 25,
    risk: 'additive',
    stores: [ASSET_OPERATIONS_STORE],
    migrate() {
      return undefined;
    },
    validate(db) {
      if (!db.objectStoreNames.contains(ASSET_OPERATIONS_STORE))
        throw new Error('Private source retirement outbox is unavailable.');
      return undefined;
    },
  },
  {
    backupCoverage: 'none',
    domainVersions: [{ domainId: 'assetGraph', from: 2, to: 3 }],
    estimateAdditionalBytes: async () => 64 * 1024,
    fromDatabaseVersion: 25,
    toDatabaseVersion: 26,
    risk: 'additive',
    stores: [ASSET_OPERATIONS_STORE],
    migrate() {
      return undefined;
    },
    validate(db) {
      if (!db.objectStoreNames.contains(ASSET_OPERATIONS_STORE))
        throw new Error('Known-source publication recovery is unavailable.');
      return undefined;
    },
  },
  {
    backupCoverage: 'none',
    domainVersions: [
      { domainId: 'recordings', from: 1, to: 2 },
      { domainId: 'mediaLibrary', from: 21, to: 22 },
      { domainId: 'videoProjects', from: 3, to: 4 },
    ],
    estimateAdditionalBytes: async () => 64 * 1024,
    fromDatabaseVersion: 26,
    toDatabaseVersion: 27,
    risk: 'additive',
    stores: [
      RECORDING_TELEMETRY_STORE,
      VIDEO_WORKSPACES_STORE,
      VIDEO_WORKSPACE_HISTORY_STORE,
      VIDEO_WORKSPACE_DRAFTS_STORE,
      VIDEO_PROJECTS_STORE,
    ],
    migrate() {
      return undefined;
    },
    validate(db) {
      if (
        ![
          RECORDING_TELEMETRY_STORE,
          VIDEO_WORKSPACES_STORE,
          VIDEO_WORKSPACE_HISTORY_STORE,
          VIDEO_WORKSPACE_DRAFTS_STORE,
          VIDEO_PROJECTS_STORE,
        ].every((name) => db.objectStoreNames.contains(name))
      )
        throw new Error('Interaction authoring stores are unavailable.');
      return undefined;
    },
  },
  {
    backupCoverage: 'none',
    domainVersions: [
      { domainId: 'mediaLibrary', from: 22, to: 23 },
      { domainId: 'videoProjects', from: 4, to: 5 },
    ],
    estimateAdditionalBytes: async () => 64 * 1024,
    fromDatabaseVersion: 27,
    toDatabaseVersion: 28,
    risk: 'additive',
    stores: [
      VIDEO_WORKSPACES_STORE,
      VIDEO_WORKSPACE_HISTORY_STORE,
      VIDEO_WORKSPACE_DRAFTS_STORE,
      VIDEO_PROJECTS_STORE,
    ],
    migrate() {
      return undefined;
    },
    validate(db) {
      if (
        ![
          VIDEO_WORKSPACES_STORE,
          VIDEO_WORKSPACE_HISTORY_STORE,
          VIDEO_WORKSPACE_DRAFTS_STORE,
          VIDEO_PROJECTS_STORE,
        ].every((name) => db.objectStoreNames.contains(name))
      )
        throw new Error('Camera policy stores are unavailable.');
      return undefined;
    },
  },
  {
    backupCoverage: 'none',
    domainVersions: [{ domainId: 'mediaLibrary', from: 23, to: 24 }],
    estimateAdditionalBytes: async () => 64 * 1024,
    fromDatabaseVersion: 28,
    toDatabaseVersion: 29,
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
        ].every((name) => db.objectStoreNames.contains(name))
      )
        throw new Error('Review project metadata stores are unavailable.');
      return undefined;
    },
  },
  {
    backupCoverage: 'none',
    domainVersions: [{ domainId: 'mediaLibrary', from: 24, to: 25 }],
    estimateAdditionalBytes: async () => 64 * 1024,
    fromDatabaseVersion: 29,
    toDatabaseVersion: 30,
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
        ].every((name) => db.objectStoreNames.contains(name))
      )
        throw new Error('Source crop workspace stores are unavailable.');
      return undefined;
    },
  },
  {
    backupCoverage: 'none',
    domainVersions: [{ domainId: 'mediaLibrary', from: 25, to: 26 }],
    estimateAdditionalBytes: async () => 64 * 1024,
    fromDatabaseVersion: 30,
    toDatabaseVersion: 31,
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
        ].every((name) => db.objectStoreNames.contains(name))
      )
        throw new Error('Workspace color stores are unavailable.');
      return undefined;
    },
  },
  {
    backupCoverage: 'none',
    domainVersions: [{ domainId: 'mediaLibrary', from: 26, to: 27 }],
    estimateAdditionalBytes: async () => 64 * 1024,
    fromDatabaseVersion: 31,
    toDatabaseVersion: 32,
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
        ].every((name) => db.objectStoreNames.contains(name))
      )
        throw new Error('Track control stores are unavailable.');
      return undefined;
    },
  },
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
  {
    backupCoverage: 'none',
    domainVersions: [{ domainId: 'scenarioProjects', from: 7, to: 8 }],
    estimateAdditionalBytes: async () => 64 * 1024,
    fromDatabaseVersion: 33,
    toDatabaseVersion: 34,
    risk: 'additive',
    stores: [SCENARIO_PROJECTS_STORE, SCENARIO_PROJECT_HISTORY_STORE, SCENARIO_PROJECT_UNITS_STORE],
    migrate() {
      return undefined;
    },
    validate(db) {
      if (
        ![
          SCENARIO_PROJECTS_STORE,
          SCENARIO_PROJECT_HISTORY_STORE,
          SCENARIO_PROJECT_UNITS_STORE,
        ].every((name) => db.objectStoreNames.contains(name))
      )
        throw new Error('Scenario framing stores are unavailable.');
      return undefined;
    },
  },
];

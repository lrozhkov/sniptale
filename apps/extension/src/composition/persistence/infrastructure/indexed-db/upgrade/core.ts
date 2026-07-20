import {
  DIAGNOSTICS_EVENTS_STORE,
  DIAGNOSTICS_META_STORE,
  EDITOR_SESSIONS_STORE,
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  RECORDING_TELEMETRY_STORE,
  SCENARIO_ASSETS_STORE,
  SCENARIO_EXPORTS_STORE,
  SCENARIO_PENDING_ASSETS_STORE,
  SCENARIO_PROJECTS_STORE,
  SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
  STORE_NAME,
  THUMBNAILS_STORE,
  VIDEO_PROJECTS_STORE,
  WEB_SNAPSHOTS_STORE,
} from '../core.stores.ts';
import { applyStateManagerStoreUpgrade } from './core.state-manager.ts';
import { applyPageStyleAssetsStoreUpgrade } from './core.page-style.ts';
import { applyEditorCustomShapesStoreUpgrade } from './core.editor-custom-shapes.ts';
import { applyVideoEffectBundlesStoreUpgrade } from './core.video-effect-bundles.ts';
import { applyNativeTransferStoresUpgrade } from './core.native-transfer.ts';
import { applyProjectExportInputsStoreUpgrade } from './core.project-export-inputs.ts';
import type { UpgradeDatabase } from './types';

export function handleDatabaseUpgrade(db: UpgradeDatabase, oldVersion: number) {
  applyVersion1Changes(db, oldVersion);
  applyVersion4Changes(db, oldVersion);
  applyVersion5Changes(db, oldVersion);
  applyVersion6Changes(db, oldVersion);
  applyVersion7Changes(db, oldVersion);
  applyVersion8Changes(db, oldVersion);
  applyVersion9Changes(db, oldVersion);
  applyVersion10Changes(db, oldVersion);
  applyVersion11Changes(db, oldVersion);
  applyVersion12Changes(db, oldVersion);
  applyPageStyleAssetsStoreUpgrade(db, oldVersion);
  applyEditorCustomShapesStoreUpgrade(db, oldVersion);
  applyVideoEffectBundlesStoreUpgrade(db, oldVersion);
  applyStateManagerStoreUpgrade(db, oldVersion);
  applyNativeTransferStoresUpgrade(db, oldVersion);
  applyProjectExportInputsStoreUpgrade(db, oldVersion);
  removeLegacyAnnotationPacksStore(db, oldVersion);
}

function applyVersion1Changes(db: UpgradeDatabase, oldVersion: number) {
  if (oldVersion >= 1 || db.objectStoreNames.contains(STORE_NAME)) {
    return;
  }

  const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
  store.createIndex('createdAt', 'createdAt');
}

function applyVersion4Changes(db: UpgradeDatabase, oldVersion: number) {
  if (oldVersion >= 4) {
    return;
  }

  if (!db.objectStoreNames.contains(DIAGNOSTICS_META_STORE)) {
    db.createObjectStore(DIAGNOSTICS_META_STORE, { keyPath: 'recordingId' });
  }

  if (!db.objectStoreNames.contains(DIAGNOSTICS_EVENTS_STORE)) {
    const eventsStore = db.createObjectStore(DIAGNOSTICS_EVENTS_STORE, {
      keyPath: ['recordingId', 'chunkIndex'],
    });
    eventsStore.createIndex('recordingId', 'recordingId');
  }
}

function applyVersion5Changes(db: UpgradeDatabase, oldVersion: number) {
  if (oldVersion >= 5) {
    return;
  }

  if (!db.objectStoreNames.contains(VIDEO_PROJECTS_STORE)) {
    const projectsStore = db.createObjectStore(VIDEO_PROJECTS_STORE, { keyPath: 'id' });
    projectsStore.createIndex('updatedAt', 'updatedAt');
  }

  if (!db.objectStoreNames.contains(PROJECT_ASSETS_STORE)) {
    const projectAssetsStore = db.createObjectStore(PROJECT_ASSETS_STORE, { keyPath: 'id' });
    projectAssetsStore.createIndex('createdAt', 'createdAt');
  }

  if (!db.objectStoreNames.contains(PROJECT_EXPORTS_STORE)) {
    const exportsStore = db.createObjectStore(PROJECT_EXPORTS_STORE, { keyPath: 'id' });
    exportsStore.createIndex('projectId', 'projectId');
    exportsStore.createIndex('createdAt', 'createdAt');
  }
}

function applyVersion6Changes(db: UpgradeDatabase, oldVersion: number) {
  if (oldVersion >= 6) {
    return;
  }

  if (!db.objectStoreNames.contains(MEDIA_LIBRARY_STORE)) {
    const mediaStore = db.createObjectStore(MEDIA_LIBRARY_STORE, { keyPath: 'id' });
    mediaStore.createIndex('createdAt', 'createdAt');
    mediaStore.createIndex('kind', 'kind');
  }

  if (!db.objectStoreNames.contains(THUMBNAILS_STORE)) {
    db.createObjectStore(THUMBNAILS_STORE, { keyPath: 'assetId' });
  }
}

function applyVersion7Changes(db: UpgradeDatabase, oldVersion: number) {
  if (oldVersion >= 7) {
    return;
  }

  if (!db.objectStoreNames.contains(EDITOR_SESSIONS_STORE)) {
    const editorSessionsStore = db.createObjectStore(EDITOR_SESSIONS_STORE, {
      keyPath: 'sessionId',
    });
    editorSessionsStore.createIndex('updatedAt', 'updatedAt');
  }
}

function applyVersion8Changes(db: UpgradeDatabase, oldVersion: number) {
  if (oldVersion >= 8) {
    return;
  }

  if (!db.objectStoreNames.contains(SCENARIO_PROJECTS_STORE)) {
    const scenarioProjectsStore = db.createObjectStore(SCENARIO_PROJECTS_STORE, {
      keyPath: 'id',
    });
    scenarioProjectsStore.createIndex('updatedAt', 'updatedAt');
  }

  if (!db.objectStoreNames.contains(SCENARIO_ASSETS_STORE)) {
    const scenarioAssetsStore = db.createObjectStore(SCENARIO_ASSETS_STORE, {
      keyPath: 'id',
    });
    scenarioAssetsStore.createIndex('projectId', 'projectId');
    scenarioAssetsStore.createIndex('createdAt', 'createdAt');
  }

  if (!db.objectStoreNames.contains(SCENARIO_EXPORTS_STORE)) {
    const scenarioExportsStore = db.createObjectStore(SCENARIO_EXPORTS_STORE, {
      keyPath: 'id',
    });
    scenarioExportsStore.createIndex('projectId', 'projectId');
    scenarioExportsStore.createIndex('createdAt', 'createdAt');
  }
}

function applyVersion9Changes(db: UpgradeDatabase, oldVersion: number) {
  if (oldVersion >= 9) {
    return;
  }

  if (!db.objectStoreNames.contains(SCENARIO_PENDING_ASSETS_STORE)) {
    const pendingAssetsStore = db.createObjectStore(SCENARIO_PENDING_ASSETS_STORE, {
      keyPath: 'id',
    });
    pendingAssetsStore.createIndex('tabId', 'tabId');
    pendingAssetsStore.createIndex('createdAt', 'createdAt');
  }
}

function applyVersion10Changes(db: UpgradeDatabase, oldVersion: number) {
  if (oldVersion >= 10) {
    return;
  }

  if (!db.objectStoreNames.contains(SCENARIO_STEP_EDITOR_DOCUMENTS_STORE)) {
    const stepDocumentsStore = db.createObjectStore(SCENARIO_STEP_EDITOR_DOCUMENTS_STORE, {
      keyPath: 'stepId',
    });
    stepDocumentsStore.createIndex('projectId', 'projectId');
    stepDocumentsStore.createIndex('updatedAt', 'updatedAt');
  }
}

function applyVersion11Changes(db: UpgradeDatabase, oldVersion: number) {
  if (oldVersion >= 11) {
    return;
  }

  if (!db.objectStoreNames.contains(RECORDING_TELEMETRY_STORE)) {
    const telemetryStore = db.createObjectStore(RECORDING_TELEMETRY_STORE, {
      keyPath: 'recordingId',
    });
    telemetryStore.createIndex('updatedAt', 'updatedAt');
  }
}

function applyVersion12Changes(db: UpgradeDatabase, oldVersion: number) {
  if (oldVersion >= 12) {
    return;
  }

  if (!db.objectStoreNames.contains(WEB_SNAPSHOTS_STORE)) {
    const webSnapshotsStore = db.createObjectStore(WEB_SNAPSHOTS_STORE, { keyPath: 'id' });
    webSnapshotsStore.createIndex('createdAt', 'createdAt');
  }
}

function removeLegacyAnnotationPacksStore(db: UpgradeDatabase, oldVersion: number) {
  if (oldVersion >= 16 || !db.objectStoreNames.contains('annotation_packs')) {
    return;
  }

  db.deleteObjectStore('annotation_packs');
}

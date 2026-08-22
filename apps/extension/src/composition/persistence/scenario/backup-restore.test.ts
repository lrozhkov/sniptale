import { describe, expect, it, vi } from 'vitest';
import { createEditorDocumentFixture } from '../../../editor/document/page-session/document.test-support';
import { createScenarioProject } from '../../../features/scenario/project/factories/project';
import type { AggregatePresentationEntry } from '../aggregate-presentations/contracts';
import { createPersistedEditorDocumentFixture } from '../document-assets/test-support';
import type { MediaThumbnailEntry } from '../media-library/contracts';
import type {
  ScenarioExportEntry,
  ScenarioProjectEntry,
  StoredScenarioStepEditorDocumentEntry,
} from './contracts';
import {
  putScenarioProjectBackupRestore,
  type ScenarioBackupRestoreStores,
} from './backup-restore';

function store(get: (key: IDBValidKey) => unknown = () => undefined) {
  return { delete: vi.fn(), get: vi.fn(async (key) => get(key)), put: vi.fn() };
}

function indexStore() {
  return { ...store(), index: vi.fn(() => ({ getAll: vi.fn(async () => []) })) };
}

function stores(): ScenarioBackupRestoreStores {
  return {
    assets: indexStore(),
    exports: indexStore(),
    operations: store(),
    owners: { ...store(), index: vi.fn(() => ({ count: vi.fn(async () => 0) })) },
    presentations: store(),
    projects: store(),
    refs: store(),
    stepDocuments: indexStore(),
    thumbnails: store(),
  } satisfies ScenarioBackupRestoreStores;
}

function projectEntry(id = 'project'): ScenarioProjectEntry {
  const project = { ...createScenarioProject('Scenario'), id };
  return { createdAt: project.createdAt, id, project, updatedAt: project.updatedAt };
}

const operation = () => ({
  assetIds: [],
  createdAt: 1,
  kind: 'physical-delete' as const,
  operationId: 'delete',
  status: 'pending' as const,
  updatedAt: 1,
});
const ref = {
  assetId: 'local',
  createdAt: 1,
  location: { kind: 'opfs' as const, objectKey: 'objects/local' },
  mimeType: 'image/png',
  sha256: null,
  size: 1,
};

describe('scenario project backup restore adapter', () => {
  it('publishes prepared scenario assets and metadata through caller stores', async () => {
    const target = stores();
    await expect(
      putScenarioProjectBackupRestore({
        operation: operation(),
        root: {
          assets: [
            {
              entry: {
                assetId: 'local',
                createdAt: 1,
                galleryAssetId: null,
                height: 1,
                id: 'asset',
                mimeType: 'image/png',
                projectId: 'project',
                size: 1,
                width: 1,
              },
              ref,
            },
          ],
          entry: projectEntry(),
          exportThumbnails: [],
          exports: [],
          stepDocuments: [],
        },
        stores: target,
        strategy: 'replace',
      })
    ).resolves.toEqual({ conflicted: false, imported: true });
    expect(target.projects.put).toHaveBeenCalled();
    expect(target.refs.put).toHaveBeenCalledWith(ref);
  });

  it('rejects replace when a child belongs to another scenario root', async () => {
    const target = stores();
    target.assets.get = vi.fn(async () => ({
      assetId: 'other',
      createdAt: 1,
      galleryAssetId: null,
      height: 1,
      id: 'asset',
      mimeType: 'image/png',
      projectId: 'other-project',
      size: 1,
      width: 1,
    }));
    await expect(
      putScenarioProjectBackupRestore({
        operation: operation(),
        root: {
          assets: [
            {
              entry: {
                assetId: 'local',
                createdAt: 1,
                galleryAssetId: null,
                height: 1,
                id: 'asset',
                mimeType: 'image/png',
                projectId: 'project',
                size: 1,
                width: 1,
              },
              ref,
            },
          ],
          entry: projectEntry(),
          exportThumbnails: [],
          exports: [],
          stepDocuments: [],
        },
        stores: target,
        strategy: 'replace',
      })
    ).rejects.toThrow('belongs to another root');
  });

  it('rejects replace when an export belongs to another scenario root', async () => {
    const target = stores();
    target.exports.get = vi.fn(
      async () =>
        ({
          createdAt: 1,
          filename: 'existing.html',
          format: 'html',
          id: 'export',
          projectId: 'other-project',
          size: 1,
        }) satisfies ScenarioExportEntry
    );
    await expect(
      putScenarioProjectBackupRestore({
        operation: operation(),
        root: {
          assets: [],
          entry: projectEntry(),
          exportThumbnails: [],
          exports: [
            {
              createdAt: 1,
              filename: 'export.html',
              format: 'html',
              id: 'export',
              projectId: 'project',
              size: 1,
            },
          ],
          stepDocuments: [],
        },
        stores: target,
        strategy: 'replace',
      })
    ).rejects.toThrow('Scenario export belongs to another root');
  });

  it('rejects replace when an editor document belongs to another scenario root', async () => {
    const target = stores();
    const document = {
      createdAt: 1,
      document: createPersistedEditorDocumentFixture(createEditorDocumentFixture(), 'local'),
      projectId: 'project',
      stepId: 'step',
      updatedAt: 1,
    } satisfies StoredScenarioStepEditorDocumentEntry;
    target.stepDocuments.get = vi.fn(async () => ({ ...document, projectId: 'other-project' }));
    await expect(
      putScenarioProjectBackupRestore({
        operation: operation(),
        root: {
          assets: [],
          entry: projectEntry(),
          exportThumbnails: [],
          exports: [],
          stepDocuments: [{ entry: document, refs: [ref] }],
        },
        stores: target,
        strategy: 'replace',
      })
    ).rejects.toThrow('Scenario editor document belongs to another root');
  });

  it('skips a complete root when a child identity already exists', async () => {
    const target = stores();
    target.exports.get = vi.fn(
      async () =>
        ({
          createdAt: 1,
          filename: 'existing.html',
          format: 'html',
          id: 'export',
          projectId: 'project',
          size: 1,
        }) satisfies ScenarioExportEntry
    );

    await expect(
      putScenarioProjectBackupRestore({
        operation: operation(),
        root: {
          assets: [],
          entry: projectEntry(),
          exportThumbnails: [],
          exports: [
            {
              createdAt: 1,
              filename: 'export.html',
              format: 'html',
              id: 'export',
              projectId: 'project',
              size: 1,
            },
          ],
          stepDocuments: [],
        },
        stores: target,
        strategy: 'skip',
      })
    ).resolves.toEqual({ conflicted: true, imported: false });
    expect(target.projects.put).not.toHaveBeenCalled();
  });
});

describe('scenario project backup restore atomic publication', () => {
  it('rejects a duplicate conflict that changed after preflight', async () => {
    const target = stores();
    target.projects.get = vi.fn(async () => projectEntry());
    await expect(
      putScenarioProjectBackupRestore({
        operation: operation(),
        root: {
          assets: [],
          entry: projectEntry(),
          exportThumbnails: [],
          exports: [],
          stepDocuments: [],
        },
        stores: target,
        strategy: 'duplicate',
      })
    ).rejects.toThrow('conflict changed after preflight');
  });

  it('rejects a prepared editor document with a missing asset ref', async () => {
    const target = stores();
    const document = {
      createdAt: 1,
      document: createPersistedEditorDocumentFixture(createEditorDocumentFixture(), 'source'),
      projectId: 'project',
      stepId: 'step',
      updatedAt: 1,
    } satisfies StoredScenarioStepEditorDocumentEntry;

    await expect(
      putScenarioProjectBackupRestore({
        operation: operation(),
        root: {
          assets: [],
          entry: projectEntry(),
          exportThumbnails: [],
          exports: [],
          stepDocuments: [{ entry: document, refs: [] }],
        },
        stores: target,
        strategy: 'replace',
      })
    ).rejects.toThrow('Scenario editor asset ref is missing: source.');
  });

  it('publishes editor assets and all scenario sidecars', async () => {
    const target = stores();
    const document = {
      createdAt: 1,
      document: createPersistedEditorDocumentFixture(createEditorDocumentFixture(), 'local'),
      projectId: 'project',
      stepId: 'step',
      updatedAt: 1,
    } satisfies StoredScenarioStepEditorDocumentEntry;
    const thumbnail = {
      assetId: 'scenario:project',
      blob: new Blob(['thumb']),
      createdAt: 1,
      height: 1,
      updatedAt: 1,
      width: 1,
    } satisfies MediaThumbnailEntry;
    const presentation = {
      aggregateId: 'project',
      aggregateKind: 'scenario' as const,
      presentationRevision: 1,
      thumbnailBlob: new Blob(['presentation']),
      updatedAt: 1,
    } satisfies AggregatePresentationEntry;
    const exportEntry = {
      createdAt: 1,
      filename: 'export.html',
      format: 'html' as const,
      id: 'export',
      projectId: 'project',
      size: 1,
    } satisfies ScenarioExportEntry;

    await putScenarioProjectBackupRestore({
      operation: operation(),
      root: {
        assets: [],
        entry: projectEntry(),
        exportThumbnails: [thumbnail],
        exports: [exportEntry],
        presentation,
        stepDocuments: [{ entry: document, refs: [ref] }],
        thumbnail,
      },
      stores: target,
      strategy: 'replace',
    });

    expect(target.stepDocuments.put).toHaveBeenCalledWith(document);
    expect(target.exports.put).toHaveBeenCalledWith(exportEntry);
    expect(target.thumbnails.put).toHaveBeenCalledWith(thumbnail);
    expect(target.presentations.put).toHaveBeenCalledWith(presentation);
  });

  it('replaces the complete existing scenario graph and records orphaned asset bytes', async () => {
    const target = stores();
    const existing = projectEntry();
    const document = {
      createdAt: 1,
      document: createPersistedEditorDocumentFixture(createEditorDocumentFixture(), 'document'),
      projectId: 'project',
      stepId: 'step',
      updatedAt: 1,
    } satisfies StoredScenarioStepEditorDocumentEntry;
    const existingAsset = {
      assetId: 'asset-object',
      createdAt: 1,
      galleryAssetId: null,
      height: 1,
      id: 'asset',
      mimeType: 'image/png',
      projectId: 'project',
      size: 1,
      width: 1,
    };
    const existingExport = {
      createdAt: 1,
      filename: 'old.html',
      format: 'html' as const,
      id: 'old-export',
      projectId: 'project',
      size: 1,
    } satisfies ScenarioExportEntry;
    target.projects.get = vi.fn(async () => existing);
    target.assets.index = vi.fn(() => ({ getAll: vi.fn(async () => [existingAsset]) }));
    target.stepDocuments.index = vi.fn(() => ({ getAll: vi.fn(async () => [document]) }));
    target.exports.index = vi.fn(() => ({ getAll: vi.fn(async () => [existingExport]) }));
    const pendingDelete = operation();

    await expect(
      putScenarioProjectBackupRestore({
        operation: pendingDelete,
        root: {
          assets: [],
          entry: projectEntry(),
          exportThumbnails: [],
          exports: [],
          stepDocuments: [],
        },
        stores: target,
        strategy: 'replace',
      })
    ).resolves.toEqual({ conflicted: true, imported: true });

    expect(target.assets.delete).toHaveBeenCalledWith('asset');
    expect(target.stepDocuments.delete).toHaveBeenCalledWith('step');
    expect(target.exports.delete).toHaveBeenCalledWith('old-export');
    expect(target.projects.delete).toHaveBeenCalledWith('project');
    expect(pendingDelete.assetIds).toEqual(expect.arrayContaining(['asset-object', 'document']));
  });
});

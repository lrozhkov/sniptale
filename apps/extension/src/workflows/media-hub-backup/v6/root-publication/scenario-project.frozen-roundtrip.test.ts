import { createEditorDocumentFixture } from '../../../../editor/document/page-session/document.test-support';
import { createPersistedEditorDocumentFixture } from '../../../../composition/persistence/document-assets/test-support';
import { encodePortableEditorDocument } from '../root-codecs/editor-document';
import { encodePortableScenarioProjectEntry } from '../root-codecs/projects';
import { afterEach, expect, it, vi } from 'vitest';
import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { materializeScenarioUnitStorage } from '../../../../composition/persistence/scenario/storage-units';
import { parseScenarioProjectEntry } from '../../../../composition/persistence/scenario/read-guards';
import { parsePortableScenarioProjectMetadata } from '../root-codecs/projects';
import { createGuideProject } from '../../../../features/scenario/project/public';
import {
  createGuideStep,
  createGuideImageBlock,
} from '../../../../features/scenario/project/factories';
import { createMediaLibraryEntry } from '../../../../composition/persistence/projects/index.test-support';
import { scenarioChildUsesMedia } from '../../../../composition/persistence/media-library/dependencies';
import { parseScenarioAssetEntry } from '../../../../composition/persistence/scenario/read-guards';
import { parseMediaLibraryEntry } from '../../../../composition/persistence/media-library/read-guards';
import { portableJson, session as mediaSession } from './media.review-assets.test-support';

const io = vi.hoisted(() => ({ db: vi.fn(), files: new Map<string, File>() }));
afterEach(() => io.files.clear());
vi.mock('../../../../composition/persistence/assets', async (original) => {
  const actual = await original<typeof import('../../../../composition/persistence/assets')>();
  return {
    ...actual,
    readAssetFile: (...args: Parameters<typeof actual.readAssetFile>) =>
      io.files.has(args[0].assetId)
        ? Promise.resolve(io.files.get(args[0].assetId)!)
        : actual.readAssetFile(...args),
  };
});
vi.mock('../../../../composition/persistence/infrastructure/indexed-db/core', async (original) => ({
  ...(await original<
    typeof import('../../../../composition/persistence/infrastructure/indexed-db/core')
  >()),
  initDB: io.db,
}));
vi.mock('../../../../composition/persistence/infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: async (effect: (db: unknown) => Promise<unknown>) =>
    effect(await io.db()),
}));
import { scenarioProjectRootPublisher } from './scenario-project';

function installDatabase(rows: Map<string, Map<string, unknown>>) {
  let working = rows;
  const writes: Array<{ name: string; value: unknown }> = [];
  const table = (name: string) => {
    if (!working.has(name)) working.set(name, new Map());
    return working.get(name)!;
  };
  const store = (name: string) => ({
    get: async (key: IDBValidKey) => table(name).get(String(key)),
    getAll: async () => [...table(name).values()],
    delete: async (key: IDBValidKey) => table(name).delete(String(key)),
    put: async (value: Record<string, unknown>) => {
      const key =
        name === 'scenario_project_units'
          ? String([value['projectId'], value['unitId'], value['revision']])
          : name === 'scenario_project_history'
            ? String([value['projectId'], value['revision']])
            : value['ownerKind']
              ? String([value['ownerKind'], value['ownerId'], value['role']])
              : String(
                  value['operationId'] ??
                    value['id'] ??
                    value['stepId'] ??
                    value['assetId'] ??
                    value['aggregateId']
                );
      table(name).set(key, structuredClone(value));
      writes.push({ name, value: structuredClone(value) });
    },
    index: (key: string) => ({
      getAll: async (id: string) =>
        [...table(name).values()].filter(
          (row) =>
            typeof row === 'object' && row !== null && (row as Record<string, unknown>)[key] === id
        ),
      count: async (id: string) =>
        [...table(name).values()].filter(
          (row) =>
            typeof row === 'object' && row !== null && (row as Record<string, unknown>)[key] === id
        ).length,
    }),
  });
  io.db.mockResolvedValue({
    get: async (name: string, key: IDBValidKey) => store(name).get(key),
    transaction: () => {
      working = structuredClone(rows);
      let aborted = false;
      return {
        objectStore: store,
        get done() {
          if (!aborted) {
            rows.clear();
            for (const [name, values] of working) rows.set(name, values);
          }
          working = rows;
          return Promise.resolve();
        },
        abort: () => {
          aborted = true;
          working = rows;
        },
      };
    },
  });
  return writes;
}

function input(strategy: 'replace' | 'skip' | 'duplicate', staleCheckpoint = false) {
  const project = createGuideProject('Scenario', 'scenario', 1);
  const step = createGuideStep('Used');
  step.blocks = [
    createGuideImageBlock({
      id: 'block',
      assetId: 'captured',
      width: 100,
      height: 50,
      source: { kind: 'import', filename: 'image.png' },
    }),
  ];
  project.items = [step];
  const media = createMediaLibraryEntry({
    lifecycle: { storageClass: 'temporary', savedAt: null, updatedAt: 1 },
    id: 'scenario-asset:captured',
    source: { kind: 'stored-asset', assetId: 'published-new' },
  });
  const session = {
    ...mediaSession(strategy),
    currentRoot: 'scenario-project:scenario',
    committedRoots: ['media:library-item:scenario-asset:captured'],
    rootIdMap: { 'media:library-item:scenario-asset:captured': media.id },
  };
  const rows = new Map<string, Map<string, unknown>>([
    ['media_library', new Map([[media.id, media]])],
    [
      'asset_operations',
      new Map([
        [
          session.operationId,
          { ...session, ...(staleCheckpoint ? { currentRoot: 'different-root' } : {}) },
        ],
      ]),
    ],
    [
      'asset_owners',
      new Map([
        [
          String(['media-library', media.id, 'source']),
          {
            assetId: 'published-new',
            ownerKind: 'media-library',
            ownerId: media.id,
            role: 'source',
          },
        ],
      ]),
    ],
  ]);
  const writes = installDatabase(rows);
  const ref = {
    assetId: 'frozen-old',
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: 'objects/frozen-old' },
    mimeType: 'image/png',
    size: 4,
    sha256: null,
  };
  const args: Parameters<typeof scenarioProjectRootPublisher.publish>[0] = {
    envelope: {
      descriptor: {
        rootKind: 'scenario-project',
        rootId: project.id,
        metadataPath: '_sniptale/metadata/scenario.json',
        objectCount: 1,
        totalBytes: 4,
      },
      objects: [],
      metadata: portableJson({
        entry: encodePortableScenarioProjectEntry({
          id: project.id,
          project,
          createdAt: 1,
          updatedAt: 1,
          workspaceRevision: 1,
        }),
        assets: [
          {
            entry: {
              id: 'captured',
              projectId: project.id,
              galleryAssetId: media.id,
              mimeType: 'image/png',
              size: 4,
              width: 100,
              height: 50,
              createdAt: 1,
            },
            objectId: 'image',
          },
        ],
        exports: [],
        exportThumbnails: [],
        stepDocuments: [],
      }),
    },
    journal: {
      journalId: 'ready',
      domain: 'archive-restore',
      createdAt: 1,
      assetRefs: [ref],
      payload: {},
    },
    session,
    staged: [{ objectId: 'image', ref }],
  };
  return { args, media, ref, rows, writes, project };
}

it.each(['replace', 'duplicate'] as const)(
  'restores native editing branches and branch-only image/document resources with %s identities',
  async (strategy) => {
    const { args, ref, rows, project } = input(strategy);
    const block = project.items[0]?.kind === 'step' ? project.items[0].blocks[0] : null;
    if (block?.kind !== 'image') throw new Error('Missing branch image');
    block.editDocumentId = 'historical-document';
    const current = { ...project, name: 'Current', items: [], updatedAt: 3 };
    const native = {
      id: project.id,
      project: current,
      createdAt: 1,
      updatedAt: 3,
      workspaceRevision: 3,
      history: [{ revision: 1, savedAt: 1, project: { ...current, name: 'Saved', updatedAt: 1 } }],
      editingHistory: {
        version: 1 as const,
        past: [{ ...project, name: 'Past' }],
        future: [{ ...project, name: 'Future' }],
      },
    };
    if (strategy === 'duplicate')
      rows.set(
        'scenario_projects',
        new Map([[project.id, { ...native, editingHistory: undefined }]])
      );
    const {
      editingHistory: graph,
      history: _legacy,
      ...entry
    } = encodePortableScenarioProjectEntry(native);
    if (!graph) throw new Error('Missing graph');
    const file = new File([JSON.stringify(graph)], 'history.json', { type: 'application/json' });
    const graphRef = {
      ...ref,
      assetId: 'history-body',
      mimeType: file.type,
      size: file.size,
      location: { kind: 'opfs' as const, objectKey: 'objects/history-body' },
    };
    io.files.set(graphRef.assetId, file);
    args.staged.push({ objectId: 'history', ref: graphRef });
    args.journal.assetRefs.push(graphRef);
    const metadata = parsePortableScenarioProjectMetadata(args.envelope.metadata);
    const document = encodePortableEditorDocument({
      document: createPersistedEditorDocumentFixture(createEditorDocumentFixture(), 'source'),
      objectsByAssetId: new Map([['source', 'image']]),
    });
    args.envelope.metadata = portableJson({
      ...metadata,
      entry,
      historyObjectId: 'history',
      stepDocuments: [
        {
          projectId: project.id,
          stepId: 'historical-document',
          createdAt: 1,
          updatedAt: 1,
          document,
        },
      ],
    });
    await expect(scenarioProjectRootPublisher.publish(args)).resolves.toMatchObject({
      imported: true,
    });
    const head = [...rows.get('scenario_projects')!.values()].find(
      (value) => isPlainRecord(value) && value['historyFormatVersion'] === 3
    );
    if (!isPlainRecord(head) || typeof head['id'] !== 'string')
      throw new Error('Missing native v3 head');
    const id = head['id'];
    const own = (name: string) =>
      [...(rows.get(name)?.values() ?? [])].filter(
        (value) => isPlainRecord(value) && value['projectId'] === id
      );
    const restored = parseScenarioProjectEntry(
      materializeScenarioUnitStorage(
        head,
        own('scenario_project_history'),
        own('scenario_project_units')
      )
    );
    if (!restored) throw new Error('Unreadable native graph');
    expect(restored.project.name).toBe('Current');
    expect(restored.project.items).toEqual([]);
    expect(restored.history?.map((version) => version.project.name)).toEqual(['Saved']);
    expect(restored.editingHistory?.past.map((value) => value.name)).toEqual(['Past']);
    expect(restored.editingHistory?.future.map((value) => value.name)).toEqual(['Future']);
    const child = own('scenario_assets').map(parseScenarioAssetEntry)[0];
    const documentRow = own('scenario_step_editor_documents')[0];
    if (!child || !isPlainRecord(documentRow)) throw new Error('Missing branch-only resources');
    for (const snapshot of [...restored.editingHistory!.past, ...restored.editingHistory!.future]) {
      expect(snapshot.id).toBe(id);
      const image = snapshot.items[0]?.kind === 'step' ? snapshot.items[0].blocks[0] : null;
      expect(image).toMatchObject({
        kind: 'image',
        assetId: child.id,
        editDocumentId: documentRow['stepId'],
      });
    }
    expect(id === project.id).toBe(strategy === 'replace');
    expect(child.id === 'captured').toBe(strategy === 'replace');
    expect(documentRow['stepId'] === 'historical-document').toBe(strategy === 'replace');
    expect(child.assetId).toBe(ref.assetId);
  }
);

it.each(['replace', 'skip'] as const)(
  'commits the frozen canonical scenario roundtrip using real domain admission: %s',
  async (strategy) => {
    const { args, media, ref, rows } = input(strategy);
    await expect(scenarioProjectRootPublisher.publish(args)).resolves.toMatchObject({
      imported: true,
      retainedAssetIds: [ref.assetId],
    });
    expect(rows.get('media_library')!.get(media.id)).toMatchObject({
      lifecycle: { storageClass: 'library' },
    });
    const child = parseScenarioAssetEntry(rows.get('scenario_assets')!.get('captured'));
    const root = parseMediaLibraryEntry(rows.get('media_library')!.get(media.id));
    if (!child || !root) throw new Error('Missing committed identities');
    expect(child.assetId).toBe('frozen-old');
    expect(child.borrowedMediaId).toBeUndefined();
    expect(scenarioChildUsesMedia(child, root)).toBe(true);
    expect(
      rows.get('asset_owners')!.get(String(['scenario-asset', child.id, 'body']))
    ).toMatchObject({ assetId: ref.assetId });
  }
);

it('aborts frozen resource and owner writes when the real archive checkpoint refuses', async () => {
  const { args, media, rows, writes } = input('replace', true);
  const beforeCheckpoint = structuredClone(rows.get('asset_operations'));
  await expect(scenarioProjectRootPublisher.publish(args)).rejects.toThrow(
    'Archive restore root checkpoint does not match'
  );
  expect(writes).toContainEqual({
    name: 'media_library',
    value: expect.objectContaining({
      id: media.id,
      lifecycle: expect.objectContaining({ storageClass: 'library' }),
    }),
  });
  expect(rows.get('asset_operations')).toEqual(beforeCheckpoint);
  expect(rows.get('scenario_projects')?.size ?? 0).toBe(0);
  expect(rows.get('scenario_assets')?.size ?? 0).toBe(0);
  expect(rows.get('asset_owners')!.size).toBe(1);
  expect(rows.get('media_library')!.get(media.id)).toEqual(media);
});

it.each([false, true])(
  'publishes the stored v5 scenario resource closure atomically, missing definition=%s',
  async (missing) => {
    const { args, ref, rows } = input('replace');
    const vectorId = 'a'.repeat(64);
    const canvasJson = JSON.stringify({
      objects: [
        {
          type: 'Group',
          objects: [],
          sniptaleType: 'vector-element',
          sniptaleVectorElement: {
            version: 1,
            definitionId: vectorId,
            overrides: { colors: {}, strokeScale: 1 },
          },
        },
      ],
    });
    const document = encodePortableEditorDocument({
      document: {
        ...createPersistedEditorDocumentFixture(createEditorDocumentFixture(), 'source'),
        version: 5,
        vectorDefinitions: { [vectorId]: { assetId: 'definition-source' } },
        assets: [
          { assetId: 'source', role: 'source-image' },
          { assetId: 'definition-source', role: `vector:${vectorId}` },
        ],
        canvasJson,
      },
      objectsByAssetId: new Map([
        ['source', 'image'],
        ['definition-source', 'definition'],
      ]),
    });
    const metadata = args.envelope.metadata;
    if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata))
      throw new Error('Missing metadata');
    metadata['stepDocuments'] = [
      {
        projectId: 'scenario',
        stepId: 'annotations',
        createdAt: 1,
        updatedAt: 1,
        document: JSON.parse(JSON.stringify(document)),
      },
    ];
    const entry = metadata['entry'];
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry))
      throw new Error('Missing entry');
    const project = entry['project'];
    if (typeof project !== 'object' || project === null || Array.isArray(project))
      throw new Error('Missing project');
    const items = project['items'];
    if (!Array.isArray(items)) throw new Error('Missing items');
    const item = items[0];
    if (typeof item !== 'object' || item === null || Array.isArray(item))
      throw new Error('Missing step');
    const blocks = item['blocks'];
    if (
      !Array.isArray(blocks) ||
      typeof blocks[0] !== 'object' ||
      blocks[0] === null ||
      Array.isArray(blocks[0])
    )
      throw new Error('Missing image');
    blocks[0]['editDocumentId'] = 'annotations';
    const definitionRef = {
      ...ref,
      assetId: 'restored-definition',
      mimeType: 'application/json',
      location: { kind: 'opfs' as const, objectKey: 'objects/restored-definition' },
    };
    if (!missing) {
      args.staged.push({ objectId: 'definition', ref: definitionRef });
      args.journal.assetRefs.push(definitionRef);
    }
    rows.set('scenario_projects', new Map());
    const before = structuredClone(rows);
    if (missing) {
      await expect(scenarioProjectRootPublisher.publish(args)).rejects.toThrow();
      expect(rows).toEqual(before);
      return;
    }
    const result = await scenarioProjectRootPublisher.publish(args);
    expect(result.retainedAssetIds).toEqual(
      expect.arrayContaining([ref.assetId, definitionRef.assetId])
    );
    const stored = rows.get('scenario_step_editor_documents')?.get('annotations');
    expect(stored).toMatchObject({
      projectId: 'scenario',
      stepId: 'annotations',
      document: {
        version: 5,
        vectorDefinitions: { [vectorId]: { assetId: definitionRef.assetId } },
        canvasJson,
      },
    });
    expect(
      rows
        .get('asset_owners')
        ?.get(String(['scenario-editor-document', 'annotations', `vector:${vectorId}`]))
    ).toMatchObject({ assetId: definitionRef.assetId });
  }
);

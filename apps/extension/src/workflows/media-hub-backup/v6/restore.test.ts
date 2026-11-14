import { computeEditorVectorDefinitionDigest } from '../../../features/editor/document/vector-element';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  retireCursorStages: vi.fn(),
  retireEventStages: vi.fn(),
  abortSession: vi.fn(),
  beginRoot: vi.fn(),
  clearCurrentRoot: vi.fn(),
  completeSession: vi.fn(),
  createJournal: vi.fn(),
  deleteJournal: vi.fn(),
  discard: vi.fn(),
  publishJournal: vi.fn(),
  readSession: vi.fn(),
  restoreGalleryViews: vi.fn(),
  stage: vi.fn(),
  verify: vi.fn(),
}));

vi.mock('../../../composition/persistence/recordings/recording-events/staging', () => ({
  retireJournalRecordingEventStages: mocks.retireEventStages,
}));

vi.mock('../../../composition/persistence/recordings/cursor-trajectory/staging', () => ({
  retireJournalCursorTrajectoryStages: mocks.retireCursorStages,
}));

vi.mock('../../../composition/persistence/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/assets')>()),
  abortArchiveRestoreSession: mocks.abortSession,
  beginArchiveRestoreRoot: mocks.beginRoot,
  clearArchiveRestoreCurrentRoot: mocks.clearCurrentRoot,
  completeArchiveRestoreSession: mocks.completeSession,
  createAssetPublicationJournal: mocks.createJournal,
  deleteReadyJournal: mocks.deleteJournal,
  discardPreparedAsset: mocks.discard,
  collectPreparedAssetCleanupFailures: async (assetIds: readonly string[]) => {
    const results = await Promise.allSettled(assetIds.map((id) => mocks.discard(id)));
    return results.flatMap((result) =>
      result.status === 'rejected' ? [result.reason as unknown] : []
    );
  },
  publishReadyJournalWithRetry: mocks.publishJournal,
  readArchiveRestoreSession: mocks.readSession,
}));
vi.mock('./restore-session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./restore-session')>()),
  verifyMediaHubRestoreResume: mocks.verify,
}));
vi.mock('./staging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./staging')>()),
  stageArchiveRootObjects: mocks.stage,
}));
vi.mock('../../../composition/persistence/gallery-saved-views', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/gallery-saved-views')
  >()),
  restoreGallerySavedViews: mocks.restoreGalleryViews,
}));

import { createArchiveWriter } from '../../../composition/archive-transfer';
import { createArchiveMemorySink } from '../../../composition/archive-transfer/test-support';
import { runWithDurableAssetOperationRecovery } from '../../../composition/persistence/infrastructure/mutation-barrier';
import { restoreMediaHubBackupV6 } from './restore';
import { buildMediaHubBackupExportPlanV6, exportMediaHubBackupV6 } from './export';
import { inspectMediaHubBackupV6 } from './inspect';
import { createEditorDocumentFixture } from '../../../editor/document/page-session/document.test-support';
import { createPersistedEditorDocumentFixture } from '../../../composition/persistence/document-assets/test-support';
import { encodePortableEditorDocument } from './root-codecs/editor-document';
import { createInternalObjectSegments } from './layout';

const descriptor = {
  mediaSubtype: 'library-item' as const,
  metadataPath: '_sniptale/metadata/media/one.json',
  objectCount: 1,
  rootId: 'one',
  rootKind: 'media' as const,
  totalBytes: 5,
};
const object = {
  filename: 'one.bin',
  mimeType: 'application/octet-stream',
  objectId: 'object-one',
  path: 'Screenshots/one.bin',
  size: 5,
};
const catalogPath = '_sniptale/catalog/media-000001.ndjson';
let currentSession: {
  archiveFingerprint: string;
  childIdMap: Record<string, string>;
  committedRoots: string[];
  conflictedRoots: string[];
  createdAt: number;
  currentRoot: string | null;
  kind: 'archive-restore-session';
  operationId: string;
  rootIdMap: Record<string, string>;
  skippedRoots: string[];
  status: 'pending' | 'completed' | 'aborted';
  strategy: 'duplicate' | 'skip';
  updatedAt: number;
};

async function archive(workspace?: unknown, transport = false, definition?: Blob): Promise<Blob> {
  const output = createArchiveMemorySink();
  const writer = createArchiveWriter(output.sink);
  const metadata = {
    entry: {
      id: descriptor.rootId,
      source: { kind: 'screenshot' },
      tags: [],
      ...(workspace === undefined ? {} : { mimeType: object.mimeType, size: object.size }),
    },
    originalObjectId: object.objectId,
    ...(workspace === undefined ? {} : { workspace }),
  };
  const rootJson = new Blob([JSON.stringify(metadata)], { type: 'application/json' });
  const rootObject = {
    objectId: 'root-metadata',
    filename: 'root.json',
    mimeType: rootJson.type,
    size: rootJson.size,
    path: createInternalObjectSegments('root-metadata', 'root.json').join('/'),
  };
  const definitionObject = definition
    ? {
        objectId: 'object-vector',
        filename: 'vector.json',
        mimeType: 'application/json',
        size: definition.size,
        path: createInternalObjectSegments('object-vector', 'vector.json').join('/'),
      }
    : undefined;
  const objects = [
    object,
    ...(transport ? [rootObject] : []),
    ...(definitionObject ? [definitionObject] : []),
  ];
  const archiveDescriptor = {
    ...descriptor,
    objectCount: objects.length,
    totalBytes: objects.reduce((sum, item) => sum + item.size, 0),
  };
  await writer.addText('_sniptale/manifest.json', '{}');
  await writer.addText(catalogPath, `${JSON.stringify(archiveDescriptor)}\n`);
  await writer.addText(
    descriptor.metadataPath,
    JSON.stringify({
      descriptor: archiveDescriptor,
      metadata: transport
        ? { payloadObjectId: rootObject.objectId, faviconObjectIds: [] }
        : metadata,
      objects,
    })
  );
  await writer.addBlob(object.path, new Blob(['media']));
  if (transport) await writer.addBlob(rootObject.path, rootJson);
  if (definitionObject && definition) await writer.addBlob(definitionObject.path, definition);
  await writer.close();
  return output.blob();
}

beforeEach(() => {
  vi.clearAllMocks();
  currentSession = {
    archiveFingerprint: 'a'.repeat(64),
    childIdMap: {},
    committedRoots: [],
    conflictedRoots: [],
    createdAt: 1,
    currentRoot: null,
    kind: 'archive-restore-session',
    operationId: 'restore-1',
    rootIdMap: {},
    skippedRoots: [],
    status: 'pending',
    strategy: 'duplicate',
    updatedAt: 1,
  };
  mocks.verify.mockResolvedValue({
    inspection: { manifest: { catalogs: [{ path: catalogPath }] } },
    session: currentSession,
  });
  mocks.beginRoot.mockImplementation(async (_operationId, root) => {
    currentSession = { ...currentSession, currentRoot: root };
    return currentSession;
  });
  mocks.stage.mockResolvedValue([
    {
      objectId: object.objectId,
      ref: {
        assetId: 'local-asset',
        createdAt: 1,
        location: { kind: 'opfs', objectKey: 'objects/local-asset' },
        mimeType: object.mimeType,
        sha256: null,
        size: 5,
      },
    },
  ]);
  mocks.createJournal.mockResolvedValue({
    assetRefs: [],
    createdAt: 1,
    domain: 'archive-restore-root',
    journalId: 'journal-1',
    operationId: 'restore-1',
    payload: {},
  });
  mocks.publishJournal.mockImplementation(async (journal, publish) => publish(journal));
  mocks.readSession.mockImplementation(async () => currentSession);
  mocks.completeSession.mockImplementation(async () => {
    currentSession = { ...currentSession, status: 'completed' };
    return currentSession;
  });
  mocks.clearCurrentRoot.mockImplementation(async () => {
    currentSession = { ...currentSession, currentRoot: null };
    return currentSession;
  });
  mocks.retireCursorStages.mockResolvedValue(undefined);
  mocks.retireEventStages.mockResolvedValue(undefined);
  mocks.discard.mockResolvedValue(undefined);
  mocks.deleteJournal.mockResolvedValue(undefined);
  mocks.abortSession.mockResolvedValue(undefined);
  mocks.restoreGalleryViews.mockResolvedValue([]);
});

it.each([
  'library-folders-v1',
  'library-folders-v2',
  'library-folders-v3',
  'library-folders-v4',
] as const)('keeps %s transport out of staging and publishes legacy roots', async (layout) => {
  const output = createArchiveMemorySink();
  await exportMediaHubBackupV6({
    plan: buildMediaHubBackupExportPlanV6({
      layout,
      roots: [
        {
          descriptor,
          load: async () => ({
            metadata: {
              entry: {
                id: 'one',
                source: { kind: 'screenshot' },
                tags: [],
                mimeType: object.mimeType,
                size: object.size,
              },
              originalObjectId: object.objectId,
            },
            objects: [{ ref: object, blob: new Blob(['media']) }],
          }),
          summary: {
            draftCount: 0,
            recordingCount: 0,
            sourceMetadataCount: 0,
            telemetryCount: 0,
            thumbnailCount: 0,
            webSnapshotCount: 0,
          },
        },
      ],
      privacy: {
        includeSourceMetadata: false,
        includeTelemetry: false,
        includeWebSnapshots: false,
      },
    }),
    sink: output.sink,
  });
  const file = output.blob();
  mocks.verify.mockResolvedValue({
    inspection: await inspectMediaHubBackupV6(file),
    session: currentSession,
  });
  await restoreMediaHubBackupV6({
    file,
    operationId: 'restore-1',
    publishers: [
      {
        profile: 'media:library-item',
        publish: async () => {
          currentSession = {
            ...currentSession,
            committedRoots: ['media:library-item:one'],
            currentRoot: null,
          };
          return { conflicted: false, imported: true, retainedAssetIds: ['local-asset'] };
        },
      },
    ],
  });
  expect(mocks.stage).toHaveBeenCalledWith(
    expect.objectContaining({
      envelope: expect.objectContaining({
        objects: [object],
        descriptor: expect.objectContaining({ objectCount: 1, totalBytes: 5 }),
      }),
    })
  );
  expect(mocks.createJournal).toHaveBeenCalledWith(
    expect.objectContaining({ assetRefs: [expect.objectContaining({ assetId: 'local-asset' })] })
  );
  expect(mocks.discard).not.toHaveBeenCalled();
});
describe('media backup v6 restore orchestration', () => {
  it('restores portable Gallery views with the archive conflict policy before completion', async () => {
    currentSession = { ...currentSession, strategy: 'skip' };
    const galleryViews = [{ id: 'view-1' }];
    mocks.verify.mockResolvedValue({
      inspection: {
        manifest: { archiveId: 'archive-1', catalogs: [], galleryViews },
      },
      session: currentSession,
    });

    await restoreMediaHubBackupV6({
      file: await archive(),
      operationId: 'restore-1',
      publishers: [],
    });

    expect(mocks.restoreGalleryViews).toHaveBeenCalledWith(galleryViews, 'skip', 'archive-1');
    expect(mocks.restoreGalleryViews.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.completeSession.mock.invocationCallOrder[0]!
    );
  });

  it('publishes one root and completes only after the atomic session checkpoint', async () => {
    const publisher = {
      profile: 'media:library-item',
      async publish() {
        currentSession = {
          ...currentSession,
          committedRoots: ['media:library-item:one'],
          currentRoot: null,
        };
        return { conflicted: false, imported: true, retainedAssetIds: ['local-asset'] };
      },
    };
    await expect(
      restoreMediaHubBackupV6({
        file: await archive(),
        operationId: 'restore-1',
        publishers: [publisher],
      })
    ).resolves.toMatchObject({ status: 'completed' });
    expect(mocks.verify).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'restore-1', permit: expect.any(Object) })
    );
    expect(mocks.beginRoot).toHaveBeenCalledWith('restore-1', 'media:library-item:one');
    expect(mocks.completeSession).toHaveBeenCalledOnce();
    expect(mocks.discard).not.toHaveBeenCalled();
  });

  it('keeps recovery queued until the active restore completes', async () => {
    let releasePublication!: () => void;
    let publicationStarted!: () => void;
    const publicationGate = new Promise<void>((resolve) => {
      releasePublication = resolve;
    });
    const started = new Promise<void>((resolve) => {
      publicationStarted = resolve;
    });
    const publisher = {
      profile: 'media:library-item',
      async publish() {
        publicationStarted();
        await publicationGate;
        currentSession = {
          ...currentSession,
          committedRoots: ['media:library-item:one'],
          currentRoot: null,
        };
        return { conflicted: false, imported: true, retainedAssetIds: ['local-asset'] };
      },
    };
    const restore = restoreMediaHubBackupV6({
      file: await archive(),
      operationId: 'restore-1',
      publishers: [publisher],
    });
    await started;
    const recoveryOperation = vi.fn();
    const recovery = runWithDurableAssetOperationRecovery(undefined, recoveryOperation);
    await Promise.resolve();
    expect(recoveryOperation).not.toHaveBeenCalled();

    releasePublication();
    await expect(restore).resolves.toMatchObject({ status: 'completed' });
    await recovery;
    expect(recoveryOperation).toHaveBeenCalledOnce();
  });

  it('journals only the domain-validated staged objects', async () => {
    const replacement = {
      objectId: object.objectId,
      ref: {
        assetId: 'sanitized-asset',
        createdAt: 2,
        location: { kind: 'opfs' as const, objectKey: 'objects/sanitized-asset' },
        mimeType: object.mimeType,
        sha256: null,
        size: 5,
      },
    };
    const publisher = {
      profile: 'media:library-item',
      prepareStaged: vi.fn(async ({ envelope }) => ({ envelope, staged: [replacement] })),
      async publish() {
        currentSession = {
          ...currentSession,
          committedRoots: ['media:library-item:one'],
          currentRoot: null,
        };
        return { conflicted: false, imported: true, retainedAssetIds: ['sanitized-asset'] };
      },
    };

    await restoreMediaHubBackupV6({
      file: await archive(),
      operationId: 'restore-1',
      publishers: [publisher],
    });

    expect(publisher.prepareStaged).toHaveBeenCalledOnce();
    expect(mocks.createJournal).toHaveBeenCalledWith(
      expect.objectContaining({ assetRefs: [replacement.ref] })
    );
  });

  it('does not erase a root whose transaction committed before cleanup failed', async () => {
    const publisher = {
      profile: 'media:library-item',
      async publish() {
        currentSession = {
          ...currentSession,
          committedRoots: ['media:library-item:one'],
          currentRoot: null,
        };
        throw new Error('post-commit interruption');
      },
    };
    await expect(
      restoreMediaHubBackupV6({
        file: await archive(),
        operationId: 'restore-1',
        publishers: [publisher],
      })
    ).resolves.toMatchObject({ status: 'completed' });
    expect(mocks.discard).not.toHaveBeenCalled();
    expect(mocks.abortSession).not.toHaveBeenCalled();
  });

  it('aborts and removes only the uncommitted current root on publication failure', async () => {
    const publisher = {
      profile: 'media:library-item',
      publish: vi.fn().mockRejectedValue(new Error('transaction failed')),
    };
    await expect(
      restoreMediaHubBackupV6({
        file: await archive(),
        operationId: 'restore-1',
        publishers: [publisher],
      })
    ).rejects.toThrow('transaction failed');
    expect(mocks.retireCursorStages).toHaveBeenCalledExactlyOnceWith('journal-1');
    expect(mocks.retireEventStages).toHaveBeenCalledExactlyOnceWith('journal-1');
    expect(mocks.retireEventStages.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deleteJournal.mock.invocationCallOrder[0]!
    );
    expect(mocks.retireCursorStages.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deleteJournal.mock.invocationCallOrder[0]!
    );
    expect(mocks.discard).toHaveBeenCalledWith('local-asset');
    expect(mocks.abortSession).toHaveBeenCalledWith('restore-1');
  });

  it('keeps an interrupted session pending and resumable after user cancellation', async () => {
    currentSession = {
      ...currentSession,
      committedRoots: ['media:library-item:previous'],
      rootIdMap: { 'media:library-item:previous': 'previous' },
    };
    mocks.verify.mockResolvedValue({
      inspection: { manifest: { catalogs: [{ path: catalogPath }] } },
      session: currentSession,
    });
    mocks.stage.mockRejectedValue(new DOMException('cancelled', 'AbortError'));
    await expect(
      restoreMediaHubBackupV6({
        file: await archive(),
        operationId: 'restore-1',
        publishers: [{ profile: 'media:library-item', publish: vi.fn() }],
      })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.clearCurrentRoot).toHaveBeenCalledWith('restore-1');
    expect(mocks.abortSession).not.toHaveBeenCalled();
    expect(currentSession).toMatchObject({
      committedRoots: ['media:library-item:previous'],
      currentRoot: null,
      status: 'pending',
    });
  });

  it('checkpoints an existing skipped root without staging its bytes', async () => {
    currentSession = { ...currentSession, strategy: 'skip' };
    const publisher = {
      profile: 'media:library-item',
      async checkpointSkipIfExisting() {
        currentSession = {
          ...currentSession,
          committedRoots: ['media:library-item:one'],
          conflictedRoots: ['media:library-item:one'],
          currentRoot: null,
          rootIdMap: { 'media:library-item:one': 'one' },
          skippedRoots: ['media:library-item:one'],
        };
        return true;
      },
      publish: vi.fn(),
    };
    await expect(
      restoreMediaHubBackupV6({
        file: await archive(),
        operationId: 'restore-1',
        publishers: [publisher],
      })
    ).resolves.toMatchObject({ status: 'completed' });
    expect(mocks.stage).not.toHaveBeenCalled();
    expect(publisher.publish).not.toHaveBeenCalled();
  });
});

it.each(['cursor', 'events'] as const)(
  'keeps the ready claim when private %s cleanup fails',
  async (format) => {
    const cleanup = format === 'cursor' ? mocks.retireCursorStages : mocks.retireEventStages;
    cleanup.mockRejectedValueOnce(new Error('History cleanup refused'));
    await expect(
      restoreMediaHubBackupV6({
        file: await archive(),
        operationId: 'restore-1',
        publishers: [
          {
            profile: 'media:library-item',
            publish: async () => {
              throw new Error('Publication refused');
            },
          },
        ],
      })
    ).rejects.toThrow('ready journal cleanup failed');
    expect(mocks.deleteJournal).not.toHaveBeenCalled();
    expect(mocks.discard).not.toHaveBeenCalled();
    expect(mocks.abortSession).not.toHaveBeenCalled();
    expect(currentSession).toMatchObject({
      currentRoot: 'media:library-item:one',
      status: 'pending',
    });
  }
);

it.each(
  [
    'library-folders-v1',
    'library-folders-v2',
    'library-folders-v3',
    'library-folders-v4',
    'library-folders-v5',
  ].flatMap((layout) =>
    ['legacy', 'current', 'future', 'partial'].map((kind) => ({ layout, kind }))
  )
)('admits $kind retained documents in $layout before archive staging', async ({ layout, kind }) => {
  const version = kind === 'legacy' ? 3 : kind === 'future' ? 5 : 4;
  const document = {
    ...createPersistedEditorDocumentFixture(createEditorDocumentFixture(), 'source'),
    version: 4 as const,
  };
  document.canvasJson = JSON.stringify({
    objects: [
      {
        sniptaleRasterOriginalData: 'sniptale-asset:source',
        sniptaleRasterColorData: 'sniptale-asset:source',
        sniptaleRasterVisibilityData: 'sniptale-asset:source',
        sniptaleRasterKeyData: 'sniptale-asset:source',
        sniptaleRasterState: {
          version: 1,
          width: 8,
          height: 6,
          crop: { x: 2, y: 1, width: 4, height: 3 },
        },
      },
    ],
  });
  const portable = encodePortableEditorDocument({
    document,
    objectsByAssetId: new Map([['source', object.objectId]]),
  });
  const candidate = {
    ...portable,
    version,
    ...(kind === 'partial'
      ? {
          canvasJson: JSON.stringify({
            objects: [{ sniptaleRasterOriginalData: `sniptale-object:${object.objectId}` }],
          }),
        }
      : {}),
  };
  const file = await archive(
    {
      aggregateId: 'one',
      createdAt: 1,
      updatedAt: 1,
      document: candidate,
    },
    layout !== 'library-folders-v1'
  );
  mocks.verify.mockResolvedValue({
    inspection: { manifest: { layout, sharedObjects: [], catalogs: [{ path: catalogPath }] } },
    session: currentSession,
  });
  const publisher = {
    profile: 'media:library-item',
    publish: vi.fn(async () => {
      currentSession = {
        ...currentSession,
        committedRoots: ['media:library-item:one'],
        currentRoot: null,
      };
      return { conflicted: false, imported: true, retainedAssetIds: ['local-asset'] };
    }),
  };
  const operation = restoreMediaHubBackupV6({
    file,
    operationId: 'restore-1',
    publishers: [publisher],
  });
  if (kind === 'current') {
    await expect(operation).resolves.toMatchObject({ status: 'completed' });
    expect(mocks.stage).toHaveBeenCalledOnce();
    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        envelope: expect.objectContaining({
          metadata: expect.objectContaining({
            workspace: expect.objectContaining({ document: portable }),
          }),
        }),
      })
    );
  } else {
    await expect(operation).rejects.toThrow(/invalid|validation/);
    expect(mocks.stage).not.toHaveBeenCalled();
    expect(mocks.createJournal).not.toHaveBeenCalled();
    expect(publisher.publish).not.toHaveBeenCalled();
  }
});

it.each([false, true])(
  'admits stored v5 through the ZIP restore entry and refuses missing definitions before staging: %s',
  async (missing) => {
    const definition = {
      version: 1 as const,
      id: '',
      viewBox: { minX: 0, minY: 0, width: 24, height: 24 },
      svg: '<svg height="24" id="v1" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><rect color="#000000" fill="#ff0000" height="19" id="v2" stroke="none" width="20" x="1" y="2"></rect></svg>',
      slots: [
        {
          id: 'c0',
          kind: 'explicit-color' as const,
          originalColor: '#ff0000',
          bindings: [{ nodeId: 'v2', attribute: 'fill' as const }],
        },
      ],
      capabilities: { palette: true, strokeScale: false },
      provenance: {
        sourceId: 'local',
        prefix: null,
        name: null,
        author: null,
        authorUrl: null,
        license: null,
        licenseUrl: null,
      },
    };
    definition.id = await computeEditorVectorDefinitionDigest(definition);
    const canvasJson = JSON.stringify({
      objects: [
        {
          type: 'Group',
          objects: [],
          sniptaleType: 'vector-element',
          sniptaleVectorElement: {
            version: 1,
            definitionId: definition.id,
            overrides: { colors: { c0: '#0000ff' }, strokeScale: 1 },
          },
        },
      ],
    });
    const document = encodePortableEditorDocument({
      document: {
        ...createPersistedEditorDocumentFixture(createEditorDocumentFixture(), 'source'),
        version: 5,
        vectorDefinitions: { [definition.id]: { assetId: 'local-vector' } },
        canvasJson,
        assets: [
          { assetId: 'source', role: 'source-image' },
          { assetId: 'local-vector', role: `vector:${definition.id}` },
        ],
      },
      objectsByAssetId: new Map([
        ['source', object.objectId],
        ['local-vector', 'object-vector'],
      ]),
    });
    const file = await archive(
      { aggregateId: 'one', createdAt: 1, updatedAt: 1, document },
      true,
      missing ? undefined : new Blob([JSON.stringify(definition)], { type: 'application/json' })
    );
    mocks.verify.mockResolvedValue({
      inspection: {
        manifest: {
          layout: 'library-folders-v5',
          sharedObjects: [],
          catalogs: [{ path: catalogPath }],
        },
      },
      session: currentSession,
    });
    const publisher = {
      profile: 'media:library-item',
      publish: vi.fn(async () => {
        currentSession = {
          ...currentSession,
          committedRoots: ['media:library-item:one'],
          currentRoot: null,
        };
        return {
          conflicted: false,
          imported: true,
          retainedAssetIds: ['restored-source', 'restored-vector'],
        };
      }),
    };
    const operation = restoreMediaHubBackupV6({
      file,
      operationId: 'restore-1',
      publishers: [publisher],
    });
    if (missing) {
      await expect(operation).rejects.toThrow();
      expect(mocks.stage).not.toHaveBeenCalled();
      expect(mocks.createJournal).not.toHaveBeenCalled();
      expect(publisher.publish).not.toHaveBeenCalled();
    } else {
      await expect(operation).resolves.toMatchObject({ status: 'completed' });
      expect(mocks.stage).toHaveBeenCalledOnce();
      expect(publisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          envelope: expect.objectContaining({
            metadata: expect.objectContaining({
              workspace: expect.objectContaining({ document }),
            }),
            objects: expect.arrayContaining([
              expect.objectContaining({ objectId: 'object-vector', mimeType: 'application/json' }),
            ]),
          }),
        })
      );
    }
  }
);

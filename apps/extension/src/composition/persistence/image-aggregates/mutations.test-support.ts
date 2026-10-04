import { beforeEach, vi } from 'vitest';
import { createEditorDocumentFixture } from '../../../editor/document/page-session/document.test-support';
import { createLibraryLifecycle } from '../library-lifecycle/contracts';
import { createPersistedEditorDocumentFixture } from '../document-assets/test-support';

const mocks = vi.hoisted(() => ({
  blobToDataUrl: vi.fn(async () => 'data:image/png;base64,b3JpZ2luYWw='),
  createThumbnail: vi.fn(async () => new Blob(['original-thumbnail'])),
  loadSettings: vi.fn(),
  getMedia: vi.fn(),
  getPresentation: vi.fn(),
  getWorkspace: vi.fn(),
  runMutation: vi.fn(),
  initDB: vi.fn(),
  assetSequence: 0,
}));

vi.mock('../infrastructure/indexed-db/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: mocks.initDB,
}));

vi.mock('../settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../settings')>()),
  loadSettings: mocks.loadSettings,
}));

vi.mock('../assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../assets')>()),
  buildPhysicalDeleteOperation: () => ({
    assetIds: [],
    createdAt: 1,
    kind: 'physical-delete',
    operationId: 'delete-1',
    status: 'pending',
    updatedAt: 1,
  }),
  completePhysicalDeleteOperation: vi.fn(async () => undefined),
  createAssetPublicationJournal: vi.fn(async (args) => ({
    ...args,
    createdAt: 1,
    journalId: 'workspace-journal',
  })),
  discardPreparedAsset: vi.fn(async () => undefined),
  publishReadyJournalWithRetry: vi.fn(async (journal, publish) => publish(journal)),
  readAssetFile: vi.fn(
    async (_ref, filename) => new File(['immutable-original'], filename, { type: 'image/png' })
  ),
  recoverStandaloneAssetPublications: vi.fn(async () => 0),
  releaseAssetReadyProtection: vi.fn(async () => undefined),
  writeBlobToAsset: vi.fn(async (blob: Blob) => {
    const assetId = `workspace-asset-${++mocks.assetSequence}`;
    return {
      ref: {
        assetId,
        createdAt: 1,
        location: { kind: 'opfs', objectKey: `objects/${assetId}` },
        mimeType: blob.type || 'application/octet-stream',
        sha256: null,
        size: blob.size,
      },
    };
  }),
}));

vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: mocks.runMutation,
}));

vi.mock('../media-library/index.library', () => ({
  getMediaLibraryEntry: mocks.getMedia,
}));

vi.mock('../image-workspaces/read', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../image-workspaces/read')>()),
  readImageWorkspace: mocks.getWorkspace,
}));

vi.mock('../aggregate-presentations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../aggregate-presentations')>()),
  getAggregatePresentation: mocks.getPresentation,
}));

vi.mock('../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/data-url')>()),
  blobToDataUrl: mocks.blobToDataUrl,
}));

vi.mock('../../../platform/media-utils/image-thumbnail', () => ({
  createImageThumbnailBlob: mocks.createThumbnail,
}));

export function root(revision: number) {
  return {
    blob: new Blob(['immutable-original'], { type: 'image/png' }),
    createdAt: 1,
    duration: null,
    filename: 'capture.png',
    height: 80,
    id: 'image-1',
    imageContentState: revision === 0 ? ('original' as const) : ('edited' as const),
    kind: 'image' as const,
    lifecycle: createLibraryLifecycle('temporary', 2),
    mimeType: 'image/png',
    originalFilename: 'capture.png',
    size: 18,
    source: { kind: 'screenshot' as const },
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    updatedAt: 2,
    width: 100,
    workspaceRevision: revision,
  };
}

interface ImageTransactionFixture {
  media?: object & { id: string };
  presentation?: object;
  sourceId?: string;
  targetAggregateId?: string;
  targetMedia?: object;
  targetPresentation?: object;
  targetWorkspace?: object;
  workspace?: object;
}

function seedTransactionRows(args: ImageTransactionFixture) {
  const storedWorkspace =
    args.workspace &&
    'document' in args.workspace &&
    (args.workspace.document as { version?: number }).version === 2
      ? {
          ...args.workspace,
          document: createPersistedEditorDocumentFixture(
            args.workspace.document as ReturnType<typeof createEditorDocumentFixture>
          ),
        }
      : args.workspace;
  const sourceId = args.media?.id ?? args.sourceId ?? 'image-1';
  const mediaById = new Map<string, unknown>();
  const workspaceById = new Map<string, unknown>();
  const presentationById = new Map<string, unknown>();
  if (args.media) mediaById.set(sourceId, args.media);
  if (storedWorkspace) workspaceById.set(sourceId, storedWorkspace);
  if (args.presentation) presentationById.set(sourceId, args.presentation);
  if (args.targetAggregateId && args.targetMedia)
    mediaById.set(args.targetAggregateId, args.targetMedia);
  if (args.targetAggregateId && args.targetWorkspace)
    workspaceById.set(args.targetAggregateId, args.targetWorkspace);
  if (args.targetAggregateId && args.targetPresentation)
    presentationById.set(args.targetAggregateId, args.targetPresentation);
  return { mediaById, workspaceById, presentationById };
}

export function installTransaction(args: ImageTransactionFixture) {
  const { mediaById, workspaceById, presentationById } = seedTransactionRows(args);
  const puts = {
    media: vi.fn(),
    presentation: vi.fn(),
    workspace: vi.fn(),
  };
  puts.media.mockImplementation(
    async (value: { id: string }) => void mediaById.set(value.id, value)
  );
  puts.workspace.mockImplementation(
    async (value: { aggregateId: string }) => void workspaceById.set(value.aggregateId, value)
  );
  puts.presentation.mockImplementation(
    async (value: { aggregateId: string }) => void presentationById.set(value.aggregateId, value)
  );
  const stores = {
    aggregate_presentations: {
      get: vi.fn(async (key: [string, string]) => {
        return presentationById.get(key[1]);
      }),
      put: puts.presentation,
    },
    image_workspaces: {
      get: vi.fn(async (key: string) => {
        return workspaceById.get(key);
      }),
      put: puts.workspace,
    },
    media_library: {
      get: vi.fn(async (key: string) => {
        return mediaById.get(key);
      }),
      put: puts.media,
    },
    asset_refs: {
      delete: vi.fn(),
      put: vi.fn(),
    },
    asset_owners: {
      delete: vi.fn(),
      index: vi.fn(() => ({ count: vi.fn(async () => 0) })),
      put: vi.fn(),
    },
    asset_operations: {
      put: vi.fn(),
    },
  } as const;
  mocks.runMutation.mockImplementation(async (effect) =>
    effect({
      transaction: vi.fn(() => ({
        done: Promise.resolve(),
        objectStore: vi.fn((name: keyof typeof stores) => stores[name]),
      })),
    })
  );
  return puts;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, 'now').mockReturnValue(10);
  mocks.assetSequence = 0;
  mocks.loadSettings.mockResolvedValue({ localStoragePolicy: { defaultDestination: 'temporary' } });
  mocks.initDB.mockResolvedValue({ get: vi.fn(async () => undefined) });
});

export function getImageMutationMocks() {
  return mocks;
}

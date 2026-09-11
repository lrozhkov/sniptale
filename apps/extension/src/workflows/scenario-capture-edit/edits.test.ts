import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createGuideProject,
  createGuideStep,
  createGuideImageBlock,
} from '../../features/scenario/project/public';

const { dataUrlToBlobMock, measureImageBlobMock, writeBlobToAssetMock } = vi.hoisted(() => ({
  dataUrlToBlobMock: vi.fn(),
  measureImageBlobMock: vi.fn(),
  writeBlobToAssetMock: vi.fn(),
}));

vi.mock('../../composition/persistence/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/assets')>()),
  assertAssetWriteAdmission: vi.fn(async () => undefined),
  writeBlobToAsset: writeBlobToAssetMock,
}));

vi.mock('../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/media-utils/data-url')>()),
  dataUrlToBlob: dataUrlToBlobMock,
}));

vi.mock('@sniptale/platform/browser/media/image-dimensions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/media/image-dimensions')>()),
  measureImageBlob: measureImageBlobMock,
}));

const publication = vi.hoisted(() => ({ commit: vi.fn(), reject: vi.fn(), publish: vi.fn() }));
vi.mock('../../composition/persistence/scenario/aggregate-mutations', () => ({
  commitScenarioAggregateMutation: publication.commit,
}));
vi.mock('../../composition/persistence/scenario/asset-staging', () => ({
  rejectScenarioMutationBeforeHandoff: publication.reject,
}));
vi.mock('../../features/media-hub/events', () => ({
  publishMediaHubLibraryChanged: publication.publish,
}));
import {
  DEFAULT_EDITOR_FRAME_SETTINGS,
  DEFAULT_BROWSER_FRAME_STATE,
} from '../../features/editor/document/constants';
import {
  applyScenarioImageEdit,
  buildScenarioEditedImageBlock,
  prepareScenarioEditedCaptureAsset,
} from './edits';

function registerCaptureStepEditsScope() {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(123);
    dataUrlToBlobMock.mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
    measureImageBlobMock.mockResolvedValue({ width: 1440, height: 900 });
    writeBlobToAssetMock.mockImplementation(async (blob: Blob, options: { mimeType: string }) => ({
      ref: {
        assetId: 'opfs-edited-asset',
        createdAt: 1,
        location: { kind: 'opfs', objectKey: 'objects/opfs-edited-asset' },
        mimeType: options.mimeType,
        sha256: null,
        size: blob.size,
      },
    }));
  });
}

async function verifiesEditedAssetCreation() {
  const prepared = await prepareScenarioEditedCaptureAsset({
    dataUrl: 'data:image/png;base64,abc',
    galleryAssetId: 'gallery-1',
    projectId: 'project-1',
  });

  expect(dataUrlToBlobMock).toHaveBeenCalledWith('data:image/png;base64,abc');
  expect(prepared.entry).toEqual(
    expect.objectContaining({
      projectId: 'project-1',
      galleryAssetId: 'gallery-1',
      mimeType: 'image/png',
      width: 1440,
      height: 900,
      createdAt: 123,
      size: 5,
    })
  );
  expect(prepared.asset).toEqual(
    expect.objectContaining({
      projectId: 'project-1',
      galleryAssetId: 'gallery-1',
      mimeType: 'image/png',
      width: 1440,
      height: 900,
      createdAt: 123,
      size: 5,
    })
  );
}

async function verifiesFallbackAssetMetadata() {
  dataUrlToBlobMock.mockResolvedValue(new Blob(['fallback']));

  const prepared = await prepareScenarioEditedCaptureAsset({
    dataUrl: 'data:image/png;base64,fallback',
    projectId: 'project-2',
  });

  expect(prepared.entry).toEqual(
    expect.objectContaining({
      projectId: 'project-2',
      galleryAssetId: null,
      mimeType: 'image/png',
    })
  );
  expect(prepared.asset).toEqual(
    expect.objectContaining({
      projectId: 'project-2',
      galleryAssetId: null,
      mimeType: 'image/png',
    })
  );
}

function verifiesEditedImageReferenceUpdate() {
  const block = createGuideImageBlock({
    id: 'image-1',
    assetId: 'asset-old',
    width: 320,
    height: 180,
    editDocumentId: 'document-old',
    galleryAssetId: 'gallery-1',
    source: { kind: 'import', filename: 'original.png' },
  });
  block.contentTransform = { x: 0.2, y: -0.1, scale: 1.4 };
  block.caption = 'Keep caption';
  const original = structuredClone(block);
  const edited = buildScenarioEditedImageBlock(block, 'asset-new', 'document-new');
  expect(edited).toEqual({ ...original, assetId: 'asset-new', editDocumentId: 'document-new' });
  expect(block).toEqual(original);
  expect(edited).not.toBe(block);
}

function runCaptureStepEditsSuite() {
  registerCaptureStepEditsScope();

  it(
    'creates a new immutable scenario asset entry from the editor data url',
    verifiesEditedAssetCreation
  );
  it(
    'falls back to canonical metadata when the edited blob has no mime type or gallery asset',
    verifiesFallbackAssetMetadata
  );
  it(
    'repoints only immutable image references while preserving layout and the previous version',
    verifiesEditedImageReferenceUpdate
  );
}

describe('capture step edits', runCaptureStepEditsSuite);

describe('guide image edit publication', () => {
  registerCaptureStepEditsScope();
  function input() {
    const project = createGuideProject('Unsaved name', 'guide', 100);
    const step = createGuideStep('Unsaved title', 'step');
    const block = createGuideImageBlock({
      id: 'image',
      assetId: 'old',
      width: 320,
      height: 180,
      editDocumentId: 'old-doc',
      source: { kind: 'import', filename: 'image.png' },
    });
    block.caption = 'Keep caption';
    block.contentTransform = { x: 0.2, y: -0.1, scale: 1.7 };
    step.blocks.push(block);
    project.items.push(step);
    return {
      project,
      baseUpdatedAt: 100,
      target: {
        projectId: 'guide',
        itemId: 'step',
        blockId: 'image',
        assetId: 'old',
        editDocumentId: 'old-doc',
      },
      dataUrl: 'data:image/png;base64,abc',
      document: {
        version: 2 as const,
        sourceImageData: 'data:image/png;base64,abc',
        sourceName: null,
        sourceWidth: 320,
        sourceHeight: 180,
        canvasWidth: 320,
        canvasHeight: 180,
        sourceLeft: 0,
        sourceTop: 0,
        sourceDisplayWidth: 320,
        sourceDisplayHeight: 180,
        frame: DEFAULT_EDITOR_FRAME_SETTINGS,
        browserFrame: DEFAULT_BROWSER_FRAME_STATE,
        canvasJson: '{"version":"7.2.0","objects":[]}',
      },
    };
  }
  it('publishes the raster and annotation version together with all unsaved guide fields', async () => {
    publication.commit.mockImplementation(async (project) => ({
      project: { ...project, updatedAt: 101 },
    }));
    const args = input();
    const before = structuredClone(args.project);
    const result = await applyScenarioImageEdit(args);
    expect(args.project).toEqual(before);
    expect(result.name).toBe('Unsaved name');
    const item = result.items[0];
    expect(item?.kind).toBe('step');
    if (item?.kind !== 'step') throw new Error('Missing step');
    expect(item.blocks[0]).toMatchObject({
      caption: 'Keep caption',
      frame: { width: 320, height: 180 },
      contentTransform: { x: 0.2, y: -0.1, scale: 1.7 },
    });
    expect(item.blocks[0]).not.toMatchObject({ assetId: 'old' });
    expect(publication.commit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        expectedUpdatedAt: 100,
        children: {
          assetPuts: [expect.objectContaining({ projectId: 'guide' })],
          editorDocumentPuts: [
            expect.objectContaining({ projectId: 'guide', document: args.document }),
          ],
        },
      })
    );
    expect(publication.reject).not.toHaveBeenCalled();
  });
  it('rejects a changed target or malformed editor output before staging bytes', async () => {
    const args = input();
    args.target.assetId = 'foreign';
    await expect(applyScenarioImageEdit(args)).rejects.toThrow('target');
    await expect(
      applyScenarioImageEdit({ ...input(), dataUrl: 'https://foreign.test/image' })
    ).rejects.toThrow('Invalid');
    expect(writeBlobToAssetMock).not.toHaveBeenCalled();
    expect(publication.commit).not.toHaveBeenCalled();
  });
  it('compensates prepared bytes if document identity creation fails before handoff', async () => {
    const error = new Error('identity unavailable');
    const ids = vi
      .spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
      .mockImplementationOnce(() => {
        throw error;
      });
    publication.reject.mockImplementationOnce(async (_children, reason) => {
      throw reason;
    });
    try {
      await expect(applyScenarioImageEdit(input())).rejects.toBe(error);
      expect(publication.reject).toHaveBeenCalledWith(
        { assetPuts: [expect.objectContaining({ projectId: 'guide' })] },
        error
      );
      expect(publication.commit).not.toHaveBeenCalled();
    } finally {
      ids.mockRestore();
    }
  });
  it('leaves post-handoff recovery to the aggregate owner on a stale revision', async () => {
    const error = new Error('stale');
    error.name = 'StaleScenarioAggregateRevisionError';
    publication.commit.mockRejectedValueOnce(error);
    await expect(applyScenarioImageEdit(input())).rejects.toBe(error);
    expect(publication.reject).not.toHaveBeenCalled();
    expect(publication.publish).not.toHaveBeenCalled();
  });
});

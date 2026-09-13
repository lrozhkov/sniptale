import { beforeEach, expect, it, vi } from 'vitest';
import {
  createGuideImageBlock,
  createGuideProject,
  createGuideStep,
} from '../../../../../features/scenario/project/public';
import { createScenarioCaptureEditorDocument } from '../../../../../features/scenario/capture-step/editor-document';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';

const io = vi.hoisted(() => ({
  asset: vi.fn<typeof import('../../projects/assets').getScenarioAsset>(),
  document:
    vi.fn<typeof import('../../editor-documents').getScenarioStepEditorDocumentForTransfer>(),
  commit: vi.fn<typeof import('../../aggregate-mutations').commitScenarioAggregateMutation>(),
  write: vi.fn(),
  discard: vi.fn(),
  event: vi.fn(),
}));
vi.mock('../../projects/assets', () => ({ getScenarioAsset: io.asset }));
vi.mock('../../editor-documents', () => ({
  getScenarioStepEditorDocumentForTransfer: io.document,
}));
vi.mock('../../aggregate-mutations', () => ({ commitScenarioAggregateMutation: io.commit }));
vi.mock('../../../assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../assets')>()),
  assertAssetWriteAdmission: vi.fn(async () => undefined),
  writeBlobToAsset: io.write,
  discardPreparedAsset: io.discard,
}));
vi.mock('@sniptale/platform/browser/media/image-dimensions', () => ({
  measureImageBlob: vi.fn(async () => ({ width: 100, height: 80 })),
}));
vi.mock('../../../../../features/media-hub/events', () => ({
  publishMediaHubLibraryChanged: io.event,
}));
import { duplicateScenarioProjectRecord } from './duplicate';

function sourceProject() {
  const project = createGuideProject('Source', 'source', 100);
  const step = createGuideStep('Pictures', 'step');
  const image = createGuideImageBlock({
    id: 'image',
    assetId: 'source-image',
    width: 100,
    height: 80,
    editDocumentId: 'source-document',
    source: { kind: 'import', filename: 'original.png' },
  });
  image.caption = 'Keep caption';
  image.contentTransform = { x: 0.2, y: 0.1, scale: 2 };
  step.blocks = [
    {
      kind: 'text',
      id: 'explanation',
      paragraphs: [{ runs: [{ text: 'Keep explanation', bold: true, italic: false, href: null }] }],
    },
    image,
    { ...image, id: 'second-image' },
  ];
  project.items = [{ kind: 'section', id: 'intro', title: 'Introduction', paragraphs: [] }, step];
  return project;
}
function images(project: GuideProject) {
  return project.items.flatMap((item) =>
    item.kind === 'step' ? item.blocks.filter((block) => block.kind === 'image') : []
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  io.commit.mockImplementation(async (project) => ({ project, workspaceRevision: 0 }));
  io.discard.mockResolvedValue(undefined);
  io.write.mockImplementation(async (blob: Blob) => ({
    ref: {
      assetId: 'new-physical',
      createdAt: 200,
      location: { kind: 'opfs', objectKey: 'objects/new-physical' },
      mimeType: blob.type,
      sha256: null,
      size: blob.size,
    },
  }));
  io.asset.mockResolvedValue({
    id: 'source-image',
    assetId: 'source-physical',
    projectId: 'source',
    galleryAssetId: null,
    mimeType: 'image/png',
    width: 100,
    height: 80,
    createdAt: 100,
    size: 5,
    file: new File(['image'], 'image.png', { type: 'image/png' }),
  });
  io.document.mockResolvedValue({
    stepId: 'source-document',
    projectId: 'source',
    createdAt: 100,
    updatedAt: 100,
    document: createScenarioCaptureEditorDocument({
      dataUrl: 'data:image/png;base64,aW1hZ2U=',
      overlays: [],
      sourceWidth: 100,
      sourceHeight: 80,
    }),
  });
});

it('copies repeated images and annotation documents once with independent logical identities', async () => {
  const source = sourceProject();
  const before = structuredClone(source);
  const copied = await duplicateScenarioProjectRecord(source, 'Copy');
  const copiedImages = images(copied);
  expect(source).toEqual(before);
  expect(copied.id).not.toBe(source.id);
  expect(copied.name).toBe('Copy');
  expect(copied.items[0]?.id).not.toBe('intro');
  expect(copied.items[1]?.id).not.toBe('step');
  expect(copiedImages[0]?.id).not.toBe('image');
  expect(copiedImages[0]?.assetId).not.toBe('source-image');
  expect(copiedImages[0]?.editDocumentId).not.toBe('source-document');
  expect(copiedImages[0]?.assetId).toBe(copiedImages[1]?.assetId);
  expect(copiedImages[0]?.editDocumentId).toBe(copiedImages[1]?.editDocumentId);
  expect(copiedImages[0]).toMatchObject({
    caption: 'Keep caption',
    contentTransform: { x: 0.2, y: 0.1, scale: 2 },
  });
  expect(io.asset).toHaveBeenCalledTimes(1);
  expect(io.document).toHaveBeenCalledTimes(1);
  expect(io.commit).toHaveBeenCalledWith(
    copied,
    expect.objectContaining({
      expectedUpdatedAt: null,
      storageClass: 'library',
      children: {
        assetPuts: [
          expect.objectContaining({
            id: copiedImages[0]?.assetId,
            assetId: 'new-physical',
            projectId: copied.id,
          }),
        ],
        editorDocumentPuts: [
          expect.objectContaining({
            stepId: copiedImages[0]?.editDocumentId,
            projectId: copied.id,
          }),
        ],
      },
    })
  );
  expect(io.event).toHaveBeenCalledWith('create', [`scenario:${copied.id}`]);
  expect(io.discard).not.toHaveBeenCalled();
});

it('copies a text-only guide without reading or staging media', async () => {
  const source = createGuideProject('Text', 'text', 100);
  source.items = [createGuideStep('Instructions', 'step')];
  const copied = await duplicateScenarioProjectRecord(source, 'Text copy');
  expect(copied.items[0]).toMatchObject({ title: 'Instructions', blocks: [] });
  expect(io.asset).not.toHaveBeenCalled();
  expect(io.write).not.toHaveBeenCalled();
  expect(io.commit).toHaveBeenCalledTimes(1);
});

it('rejects missing images before publication', async () => {
  io.asset.mockResolvedValue(undefined);
  await expect(duplicateScenarioProjectRecord(sourceProject(), 'Copy')).rejects.toThrow(
    'image is missing'
  );
  expect(io.commit).not.toHaveBeenCalled();
  expect(io.event).not.toHaveBeenCalled();
});

it('compensates staged images when an annotation document is unavailable', async () => {
  io.document.mockResolvedValue(undefined);
  await expect(duplicateScenarioProjectRecord(sourceProject(), 'Copy')).rejects.toThrow(
    'annotation document'
  );
  expect(io.discard).toHaveBeenCalledExactlyOnceWith('new-physical');
  expect(io.commit).not.toHaveBeenCalled();
});

it('leaves cleanup with the aggregate after publication handoff fails', async () => {
  io.commit.mockRejectedValue(new Error('quota'));
  await expect(duplicateScenarioProjectRecord(sourceProject(), 'Copy')).rejects.toThrow('quota');
  expect(io.discard).not.toHaveBeenCalled();
  expect(io.event).not.toHaveBeenCalled();
});

it('rejects invalid copy names before acquiring resources', async () => {
  await expect(duplicateScenarioProjectRecord(sourceProject(), 'x'.repeat(161))).rejects.toThrow(
    'Invalid guide copy'
  );
  expect(io.asset).not.toHaveBeenCalled();
  expect(io.commit).not.toHaveBeenCalled();
});

it('rejects cross-project child references without adopting foreign media', async () => {
  const asset = await io.asset('source-image');
  if (!asset) throw new Error('Missing fixture');
  io.asset.mockResolvedValue({ ...asset, projectId: 'another-project' });
  await expect(duplicateScenarioProjectRecord(sourceProject(), 'Copy')).rejects.toThrow(
    'belongs to another project'
  );
  expect(io.write).not.toHaveBeenCalled();
  expect(io.commit).not.toHaveBeenCalled();
});

it('fails cleanly when image preparation hits quota before any publication', async () => {
  io.write.mockRejectedValueOnce(new Error('quota'));
  await expect(duplicateScenarioProjectRecord(sourceProject(), 'Copy')).rejects.toThrow('quota');
  expect(io.commit).not.toHaveBeenCalled();
  expect(io.event).not.toHaveBeenCalled();
  expect(io.discard).not.toHaveBeenCalled();
});

it('saves a selected template step with independently owned media and resolved appearance', async () => {
  const { saveScenarioStepTemplate } = await import('./templates');
  const source = sourceProject();
  const selected = source.items[1];
  if (selected?.kind !== 'step') throw new Error('Expected step fixture.');
  selected.styleOverrides = { font: 'serif' };
  const template = await saveScenarioStepTemplate(source, selected.id, 'Reusable layout');
  expect(template.purpose).toBe('step-template');
  expect(template.items).toHaveLength(1);
  expect(template.style).toEqual({ ...source.style, font: 'serif' });
  expect(template.items[0]).toMatchObject({ title: selected.title, styleOverrides: {} });
  expect(images(template)[0]?.assetId).not.toBe(images(source)[0]?.assetId);
  expect(images(template)[0]?.editDocumentId).not.toBe(images(source)[0]?.editDocumentId);
  expect(io.commit).toHaveBeenCalledWith(
    template,
    expect.objectContaining({
      expectedUpdatedAt: null,
      storageClass: 'library',
      children: expect.objectContaining({
        assetPuts: [expect.objectContaining({ projectId: template.id })],
        editorDocumentPuts: [expect.objectContaining({ projectId: template.id })],
      }),
    })
  );
  expect(source.items).toHaveLength(2);
});

it('refuses missing or section template sources before staging media', async () => {
  const { saveScenarioStepTemplate } = await import('./templates');
  for (const id of ['missing', 'intro']) {
    await expect(saveScenarioStepTemplate(sourceProject(), id, 'Template')).rejects.toThrow();
  }
  expect(io.write).not.toHaveBeenCalled();
  expect(io.commit).not.toHaveBeenCalled();
});

it('copies tour images once across representations and independently copies narration and navigation', async () => {
  const { createTourDocument, createTourImageSlide } =
    await import('../../../../../features/scenario/project/public');
  const source = sourceProject();
  source.tour = createTourDocument('tour');
  const slide = createTourImageSlide('slide');
  slide.image = {
    assetId: 'source-image',
    galleryAssetId: null,
    editDocumentId: 'source-document',
    width: 100,
    height: 80,
    alt: '',
    source: { kind: 'import', filename: 'image.png' },
  };
  slide.narration = {
    assetId: 'source-audio',
    duration: 3,
    trimStart: 0,
    trimEnd: 3,
    gain: 1,
    transcript: 'voice',
  };
  slide.hotspots = [
    {
      id: 'hotspot',
      point: { x: 0.5, y: 0.5 },
      targetRect: null,
      label: 'Again',
      text: '',
      action: { kind: 'slide', slideId: 'slide' },
      appearance: null,
      pulse: true,
    },
  ];
  source.tour.slides = [slide];
  const image = await io.asset('source-image');
  io.asset.mockImplementation(async (id) =>
    id === 'source-audio'
      ? {
          id,
          assetId: 'physical-audio',
          projectId: 'source',
          galleryAssetId: null,
          mimeType: 'audio/webm',
          width: 0,
          height: 0,
          duration: 3,
          size: 5,
          createdAt: 100,
          file: new File(['audio'], 'voice.webm', { type: 'audio/webm' }),
        }
      : image
  );
  const result = await duplicateScenarioProjectRecord(source, 'Copy');
  const copied = result.tour?.slides[0];
  if (copied?.kind !== 'image') throw new Error('Expected tour image');
  expect(copied.image?.assetId).toBe(images(result)[0]?.assetId);
  expect(copied.narration?.assetId).not.toBe('source-audio');
  expect(copied.hotspots[0]?.action).toEqual({ kind: 'slide', slideId: copied.id });
  expect(io.write).toHaveBeenCalledTimes(2);
  expect(source.tour.slides[0]?.id).toBe('slide');
});

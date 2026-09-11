import { expect, it, vi } from 'vitest';
import { buildRecentScenarioSteps, buildGuidePreviewSteps } from './step-projections';
import { createGuideProject, createGuideStep, createGuideImageBlock } from './public';

vi.mock('../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/data-url')>()),
  blobToDataUrl: vi.fn(async () => 'data:image/png;base64,preview'),
}));

function captureStep(id: string) {
  const step = createGuideStep(id, id);
  step.blocks.push(
    createGuideImageBlock({
      id: `${id}-image`,
      assetId: `${id}-asset`,
      width: 100,
      height: 50,
      source: {
        kind: 'capture',
        captureSurface: 'visible',
        sourceKind: 'manual',
        page: {
          title: null,
          url: null,
          viewport: { x: 0, y: 0, width: 100, height: 50 },
          scrollX: 0,
          scrollY: 0,
          devicePixelRatio: 1,
        },
        target: null,
        interactionPoint: null,
        cursorPoint: null,
        captureMetadata: { pointerRange: null, scroll: null, trigger: 'pointer-up' },
      },
    })
  );
  return step;
}

it('limits recent captures in reverse order while retaining their positions around sections', async () => {
  const project = createGuideProject('Guide');
  project.items = [
    { kind: 'section', id: 'section', title: 'Introduction', paragraphs: [] },
    captureStep('first'),
    createGuideStep('Text', 'text'),
    captureStep('last'),
  ];
  const getAssetBlob = vi.fn(async () => new Blob(['image']));
  const recent = await buildRecentScenarioSteps({ project, getAssetBlob, limit: 1 });
  expect(recent).toEqual([
    expect.objectContaining({
      id: 'last',
      position: 3,
      stepNumber: 3,
      title: 'last',
      metadata: expect.objectContaining({ captureSurface: 'visible', sourceKind: 'manual' }),
    }),
  ]);
  expect(getAssetBlob).toHaveBeenCalledExactlyOnceWith('last-asset');
});

it('skips missing recent image bytes without mutating the document', async () => {
  const project = createGuideProject('Guide');
  project.items = [captureStep('first'), captureStep('missing')];
  const original = structuredClone(project);
  const recent = await buildRecentScenarioSteps({
    project,
    getAssetBlob: async (id) => (id === 'first-asset' ? new Blob(['image']) : undefined),
  });
  expect(recent.map((step) => step.id)).toEqual(['first']);
  expect(project).toEqual(original);
});

it('keeps text-only and imported steps in library order, including missing-image placeholders', async () => {
  const project = createGuideProject('Guide');
  const imported = createGuideStep('', 'import');
  const image = createGuideImageBlock({
    id: 'image',
    assetId: 'asset',
    width: 100,
    height: 50,
    source: { kind: 'import', filename: 'photo.png' },
  });
  image.caption = 'Imported image';
  imported.blocks.push(image);
  project.items = [createGuideStep('Text', 'text'), imported];
  const getAssetBlob = vi.fn(async () => undefined);
  expect(await buildGuidePreviewSteps({ project, getAssetBlob })).toEqual([
    { id: 'text', title: 'Text', position: 0, stepNumber: 1, previewDataUrl: '' },
    { id: 'import', title: 'Imported image', position: 1, stepNumber: 2, previewDataUrl: '' },
  ]);
  expect(await buildRecentScenarioSteps({ project, getAssetBlob })).toEqual([]);
  expect(getAssetBlob).toHaveBeenCalledExactlyOnceWith('asset');
});

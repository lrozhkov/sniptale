import { beforeEach, expect, it, vi } from 'vitest';

const {
  blobToDataUrlMock,
  buildScenarioCaptureSvgMarkupMock,
  loadImageFromBlobMock,
  measureImageBlobMock,
} = vi.hoisted(() => ({
  blobToDataUrlMock: vi.fn(),
  buildScenarioCaptureSvgMarkupMock: vi.fn(),
  loadImageFromBlobMock: vi.fn(),
  measureImageBlobMock: vi.fn(),
}));

vi.mock('../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/data-url')>()),
  blobToDataUrl: blobToDataUrlMock,
}));

vi.mock('@sniptale/platform/browser/media/image-load', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/media/image-load')>()),
  loadImageFromBlob: loadImageFromBlobMock,
}));

vi.mock('@sniptale/platform/browser/media/image-dimensions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/media/image-dimensions')>()),
  measureImageBlob: measureImageBlobMock,
}));

vi.mock('../stage-render/svg', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../stage-render/svg')>()),
  buildScenarioCaptureSvgMarkup: buildScenarioCaptureSvgMarkupMock,
}));

vi.mock('../../../features/scenario/stage/layout', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../features/scenario/stage/layout')>()),
  SCENARIO_STAGE_HEIGHT: 420,
  SCENARIO_STAGE_WIDTH: 720,
}));

import { createScenarioCaptureStep } from '../../../features/scenario/project/public';
import { buildScenarioCaptureImageBlob, buildScenarioCaptureImageDataUrl } from './images';

const createObjectUrlMock = vi.fn();
const revokeObjectUrlMock = vi.fn();
const OriginalImage = globalThis.Image;

function createCanvasStub(overrides: Partial<HTMLCanvasElement> = {}) {
  return {
    width: 0,
    height: 0,
    getContext: vi.fn().mockReturnValue({
      clearRect: vi.fn(),
      drawImage: vi.fn(),
    }),
    toBlob: vi.fn((callback: BlobCallback) => callback(new Blob(['png'], { type: 'image/png' }))),
    ...overrides,
  } as unknown as HTMLCanvasElement;
}

function stubDocument(canvas: HTMLCanvasElement) {
  vi.stubGlobal('document', {
    createElement: vi.fn((tagName: string) => (tagName === 'canvas' ? canvas : {})),
  });
}

function installSuccessfulImageLoader() {
  loadImageFromBlobMock.mockResolvedValue({} as HTMLImageElement);
}

function installFailingImageLoader() {
  loadImageFromBlobMock.mockRejectedValue(new Error('Failed to load scenario export image'));
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (OriginalImage) {
    vi.stubGlobal('Image', OriginalImage);
  }
  blobToDataUrlMock.mockReset();
  buildScenarioCaptureSvgMarkupMock.mockReset();
  measureImageBlobMock.mockReset();
  loadImageFromBlobMock.mockReset();
  createObjectUrlMock.mockReset();
  revokeObjectUrlMock.mockReset();
  createObjectUrlMock.mockReturnValue('blob:scenario-export');
  buildScenarioCaptureSvgMarkupMock.mockReturnValue('<svg>scenario</svg>');
  blobToDataUrlMock.mockImplementation(async (blob: Blob) => `data:${blob.type};base64,encoded`);
  measureImageBlobMock.mockResolvedValue({ width: 1440, height: 900 });
  vi.stubGlobal('URL', {
    createObjectURL: createObjectUrlMock,
    revokeObjectURL: revokeObjectUrlMock,
  });
});

it('builds svg blobs and data urls for scenario captures', async () => {
  const step = createScenarioCaptureStep({ assetId: 'asset-1' });
  const asset = new Blob(['pixel'], { type: 'image/png' });

  const blob = await buildScenarioCaptureImageBlob(step, asset, 'svg');
  const dataUrl = await buildScenarioCaptureImageDataUrl(step, asset, 'svg');

  expect(blob.type).toBe('image/svg+xml;charset=utf-8');
  expect(await blob.text()).toContain('<svg>scenario</svg>');
  expect(dataUrl).toBe('data:image/svg+xml;charset=utf-8;base64,encoded');
  expect(buildScenarioCaptureSvgMarkupMock).toHaveBeenCalledWith(
    expect.objectContaining({
      step,
      assetDataUrl: 'data:image/png;base64,encoded',
      assetDimensions: { width: 1440, height: 900 },
      renderMode: 'export',
    })
  );
});

it('passes through original render mode for full-image capture exports', async () => {
  const step = createScenarioCaptureStep({ assetId: 'asset-1' });
  const asset = new Blob(['pixel'], { type: 'image/png' });

  await buildScenarioCaptureImageDataUrl(step, asset, 'svg', {
    renderMode: 'original',
  });

  expect(buildScenarioCaptureSvgMarkupMock).toHaveBeenLastCalledWith(
    expect.objectContaining({
      renderMode: 'original',
    })
  );
});

it('renders png blobs through a canvas snapshot', async () => {
  installSuccessfulImageLoader();
  const clearRect = vi.fn();
  const drawImage = vi.fn();
  const canvas = createCanvasStub({
    getContext: vi.fn().mockReturnValue({ clearRect, drawImage }),
  });
  stubDocument(canvas);

  const blob = await buildScenarioCaptureImageBlob(
    createScenarioCaptureStep({ assetId: 'asset-1' }),
    new Blob(['pixel'], { type: 'image/png' }),
    'png'
  );

  expect(blob.type).toBe('image/png');
  expect(canvas.width).toBe(1440);
  expect(canvas.height).toBe(840);
  expect(clearRect).toHaveBeenCalledWith(0, 0, 1440, 840);
  expect(drawImage).toHaveBeenCalled();
  expect(loadImageFromBlobMock).toHaveBeenCalledWith(
    expect.any(Blob),
    'Failed to load scenario export image'
  );
});

it('can render a larger png snapshot for full-image previews', async () => {
  installSuccessfulImageLoader();
  const canvas = createCanvasStub();
  stubDocument(canvas);

  await buildScenarioCaptureImageBlob(
    createScenarioCaptureStep({ assetId: 'asset-1' }),
    new Blob(['pixel'], { type: 'image/png' }),
    'png',
    { scale: 4 }
  );

  expect(canvas.width).toBe(2880);
  expect(canvas.height).toBe(1680);
});

it('fails png export when the image cannot load, the canvas has no context, or toBlob returns null', async () => {
  installFailingImageLoader();
  stubDocument(createCanvasStub());

  await expect(
    buildScenarioCaptureImageBlob(
      createScenarioCaptureStep({ assetId: 'asset-1' }),
      new Blob(['pixel'], { type: 'image/png' }),
      'png'
    )
  ).rejects.toThrow('Failed to load scenario export image');

  installSuccessfulImageLoader();
  stubDocument(
    createCanvasStub({
      getContext: vi.fn().mockReturnValue(null),
    })
  );

  await expect(
    buildScenarioCaptureImageBlob(
      createScenarioCaptureStep({ assetId: 'asset-1' }),
      new Blob(['pixel'], { type: 'image/png' }),
      'png'
    )
  ).rejects.toThrow('Failed to create scenario export canvas');

  stubDocument(
    createCanvasStub({
      toBlob: vi.fn((callback: BlobCallback) => callback(null)),
    })
  );

  await expect(
    buildScenarioCaptureImageBlob(
      createScenarioCaptureStep({ assetId: 'asset-1' }),
      new Blob(['pixel'], { type: 'image/png' }),
      'png'
    )
  ).rejects.toThrow('Failed to render scenario export PNG');
});

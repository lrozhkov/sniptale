// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

import { createScenarioCaptureStep } from '../../../../../features/scenario/project/public';
import { renderCaptureStepAttachment } from './render';

const {
  blobToDataUrlMock,
  measureImageBlobMock,
  buildScenarioCaptureSvgMarkupMock,
  loadImageFromBlobMock,
} = vi.hoisted(() => ({
  blobToDataUrlMock: vi.fn(),
  measureImageBlobMock: vi.fn(),
  buildScenarioCaptureSvgMarkupMock: vi.fn(),
  loadImageFromBlobMock: vi.fn(),
}));

vi.mock('../../../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/media-utils/data-url')>()),
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

vi.mock('../../../stage-render/svg', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../stage-render/svg')>();
  return {
    ...actual,
    buildScenarioCaptureSvgMarkup: buildScenarioCaptureSvgMarkupMock,
  };
});

beforeEach(() => {
  blobToDataUrlMock.mockImplementation(async (blob: Blob) => `data:${blob.type};size=${blob.size}`);
  loadImageFromBlobMock.mockResolvedValue({} as HTMLImageElement);
  measureImageBlobMock.mockResolvedValue({ width: 1000, height: 800 });
  buildScenarioCaptureSvgMarkupMock.mockReturnValue('<svg />');
  vi.stubGlobal(
    'Image',
    class {
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;
      decoding = 'async';
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
  );
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    clearRect: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
});

it('keeps the original PNG attachment when it is already within the size cap', async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (_callback, type) {
    _callback?.(new Blob([new Uint8Array(120_000)], { type: type ?? 'image/png' }));
  });

  const step = createScenarioCaptureStep({
    assetId: 'asset-1',
    title: 'Step one',
  });
  const attachment = await renderCaptureStepAttachment({
    assetBlob: new Blob(['asset'], { type: 'image/png' }),
    step,
    stepNumber: 1,
  });

  expect(attachment).toMatchObject({
    filename: 'step1.png',
    mimeType: 'image/png',
    stepId: step.id,
  });
});

it('surfaces an explicit error when every attachment candidate exceeds the size cap', async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (_callback, type) {
    const nextSize = type === 'image/png' ? 6_000_000 : 5_500_000;
    _callback?.(new Blob([new Uint8Array(nextSize)], { type: type ?? 'image/png' }));
  });

  const step = createScenarioCaptureStep({
    assetId: 'asset-2',
    title: 'Oversized step',
  });

  await expect(
    renderCaptureStepAttachment({
      assetBlob: new Blob(['asset'], { type: 'image/png' }),
      step,
      stepNumber: 2,
    })
  ).rejects.toThrow(`Scenario attachment for step ${step.id} exceeds 307200 bytes`);
});

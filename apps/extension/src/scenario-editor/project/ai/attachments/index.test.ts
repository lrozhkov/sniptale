// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

import {
  createScenarioCaptureStep,
  createScenarioSectionStep,
} from '../../../../features/scenario/project/public';
import type { ScenarioProject } from '../../../../features/scenario/contracts/types/project';

const {
  blobToDataUrlMock,
  measureImageBlobMock,
  buildScenarioCaptureSvgMarkupMock,
  loadImageFromBlobMock,
  renderSvgBlobMock,
} = vi.hoisted(() => ({
  blobToDataUrlMock: vi.fn(),
  measureImageBlobMock: vi.fn(),
  buildScenarioCaptureSvgMarkupMock: vi.fn(),
  loadImageFromBlobMock: vi.fn(),
  renderSvgBlobMock: vi.fn(),
}));

vi.mock('../../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/media-utils/data-url')>()),
  blobToDataUrl: blobToDataUrlMock,
}));

vi.mock('@sniptale/platform/browser/media/image-dimensions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/media/image-dimensions')>()),
  measureImageBlob: measureImageBlobMock,
}));

vi.mock('@sniptale/platform/browser/media/image-load', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/media/image-load')>()),
  loadImageFromBlob: loadImageFromBlobMock,
}));

vi.mock('../../stage-render/svg', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../stage-render/svg')>();
  return {
    ...actual,
    buildScenarioCaptureSvgMarkup: buildScenarioCaptureSvgMarkupMock,
  };
});

vi.mock('./render/image', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./render/image')>()),
  renderSvgBlob: renderSvgBlobMock,
}));

import { renderCaptureStepAttachment } from './render';
import { buildScenarioEditorLLMPayload } from './';

function createProject(): ScenarioProject {
  return {
    version: 2,
    id: 'project-1',
    name: 'Scenario',
    createdAt: 1,
    updatedAt: 1,
    trash: [],
    suggestedEvents: [],
    steps: [
      createScenarioCaptureStep({
        assetId: 'asset-1',
        title: 'Step one',
      }),
      createScenarioSectionStep({
        title: 'Section',
      }),
      createScenarioCaptureStep({
        assetId: 'asset-2',
        title: 'Step three',
      }),
    ],
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  blobToDataUrlMock.mockImplementation(async (blob: Blob) => `data:${blob.type};size=${blob.size}`);
  loadImageFromBlobMock.mockResolvedValue({} as HTMLImageElement);
  measureImageBlobMock.mockResolvedValue({ width: 1000, height: 800 });
  buildScenarioCaptureSvgMarkupMock.mockReturnValue('<svg />');
  renderSvgBlobMock.mockImplementation(
    async (args: { blobType: string; quality?: number; size: { width: number } }) => {
      const canvasWidth = args.size.width;
      const size =
        args.blobType === 'image/png'
          ? 360_000
          : canvasWidth === 640
            ? args.quality === 0.62
              ? 120_000
              : 160_000
            : args.quality === 0.86
              ? 310_000
              : args.quality === 0.62
                ? 240_000
                : 290_000;

      return new Blob([new Uint8Array(size)], { type: args.blobType });
    }
  );
});

it('builds sequential filenames and selects the smallest valid attachment variant', async () => {
  const project = createProject();
  const payload = await buildScenarioEditorLLMPayload({
    attachmentMode: 'current',
    getAssetBlob: async (assetId: string) => new Blob([assetId], { type: 'image/png' }),
    project,
    selectedStepId: project.steps[0]?.id ?? null,
  });

  expect(payload.attachments).toEqual([
    expect.objectContaining({
      filename: 'step1.jpg',
      stepId: expect.any(String),
    }),
  ]);
  expect(payload.projectSnapshot.steps.map((step) => step.imageFilename)).toEqual([
    'step1.jpg',
    undefined,
    undefined,
  ]);
  expect(payload.projectSnapshotJson).toContain('"stepNumber": 2');
  expect(payload.projectSnapshotJson).toContain('"kind": "section"');
});

it('defaults to omitting screenshots unless attachment mode is explicit', async () => {
  const project = createProject();
  blobToDataUrlMock.mockClear();

  const payload = await buildScenarioEditorLLMPayload({
    getAssetBlob: async (assetId: string) => new Blob([assetId], { type: 'image/png' }),
    project,
    selectedStepId: project.steps[0]?.id ?? null,
  });

  expect(payload.attachments).toEqual([]);
  expect(payload.projectSnapshot.steps.every((step) => step.imageFilename === undefined)).toBe(
    true
  );
  expect(blobToDataUrlMock).not.toHaveBeenCalled();
});

it('omits screenshots when attachment mode is disabled', async () => {
  const project = createProject();
  blobToDataUrlMock.mockClear();

  const payload = await buildScenarioEditorLLMPayload({
    attachmentMode: 'none',
    getAssetBlob: async (assetId: string) => new Blob([assetId], { type: 'image/png' }),
    project,
    selectedStepId: project.steps[0]?.id ?? null,
  });

  expect(payload.attachments).toEqual([]);
  expect(payload.projectSnapshot.steps.every((step) => step.imageFilename === undefined)).toBe(
    true
  );
  expect(blobToDataUrlMock).not.toHaveBeenCalled();
});

it('strips URL credentials, query, and hash from scenario AI metadata', async () => {
  const project = {
    ...createProject(),
    steps: [
      createScenarioCaptureStep({
        assetId: 'asset-1',
        page: {
          devicePixelRatio: 1,
          scrollX: 0,
          scrollY: 0,
          title: 'Page title',
          url: 'https://user:password@example.test/path?token=secret#section',
          viewport: { height: 720, width: 1280, x: 0, y: 0 },
        },
        target: {
          ariaLabel: null,
          framePadding: null,
          iframeSelector: null,
          rect: null,
          role: null,
          selector: '#submit',
          tagName: 'button',
          text: 'Submit',
          title: null,
        },
      }),
    ],
  };

  const payload = await buildScenarioEditorLLMPayload({
    attachmentMode: 'none',
    getAssetBlob: async () => new Blob(['asset']),
    project,
  });

  expect(payload.projectSnapshot.steps[0]?.page?.url).toBe('https://example.test/path');
  expect(payload.projectSnapshotJson).not.toContain('user:password');
  expect(payload.projectSnapshotJson).not.toContain('password');
  expect(payload.projectSnapshotJson).not.toContain('token=secret');
  expect(payload.projectSnapshotJson).not.toContain('#section');
});

it('keeps the original PNG attachment when it is already within the size cap', async () => {
  renderSvgBlobMock.mockImplementation(async (args: { blobType: string }) => {
    return new Blob([new Uint8Array(120_000)], { type: args.blobType });
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

it('surfaces an explicit error when no attachment candidate fits the size cap', async () => {
  renderSvgBlobMock.mockImplementation(
    async (args: { blobType: string; quality?: number; size: { width: number } }) => {
      const canvasWidth = args.size.width;
      const size =
        args.blobType === 'image/png'
          ? 360_000
          : canvasWidth === 640
            ? args.quality === 0.62
              ? 330_000
              : 340_000
            : args.quality === 0.62
              ? 350_000
              : 365_000;

      return new Blob([new Uint8Array(size)], { type: args.blobType });
    }
  );

  const step = createScenarioCaptureStep({
    assetId: 'asset-1',
    title: 'Step one',
  });
  await expect(
    renderCaptureStepAttachment({
      assetBlob: new Blob(['asset'], { type: 'image/png' }),
      step,
      stepNumber: 1,
    })
  ).rejects.toThrow(`Scenario attachment for step ${step.id} exceeds 307200 bytes`);
});

it('skips missing asset blobs while keeping non-capture snapshot fields null-safe', async () => {
  const project = createProject();
  const payload = await buildScenarioEditorLLMPayload({
    attachmentMode: 'current',
    getAssetBlob: async (assetId: string) =>
      assetId === 'asset-1' ? undefined : new Blob([assetId]),
    project,
    selectedStepId: project.steps[2]?.id ?? null,
  });

  expect(payload.attachments).toEqual([
    expect.objectContaining({
      filename: 'step3.jpg',
    }),
  ]);
  expect(payload.projectSnapshot.steps[0]).not.toHaveProperty('imageFilename');
  expect(payload.projectSnapshot.steps[1]).toEqual(
    expect.objectContaining({
      currentOverlaysSummary: [],
      currentZoom: 1,
      interactionPoint: null,
      kind: 'section',
      page: null,
      target: null,
    })
  );
});

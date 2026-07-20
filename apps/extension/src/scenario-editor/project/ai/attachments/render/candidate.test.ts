// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const { blobToDataUrlMock, renderSvgBlobMock } = vi.hoisted(() => ({
  blobToDataUrlMock: vi.fn(),
  renderSvgBlobMock: vi.fn(),
}));

vi.mock('../../../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/media-utils/data-url')>()),
  blobToDataUrl: blobToDataUrlMock,
}));

vi.mock('./image', () => ({
  renderSvgBlob: renderSvgBlobMock,
}));

import { createAttachmentCandidate, createJpegAttachmentCandidates } from './candidate';

beforeEach(() => {
  blobToDataUrlMock.mockImplementation(async (blob: Blob) => `data:${blob.type};size=${blob.size}`);
  renderSvgBlobMock.mockImplementation(
    async ({ blobType, quality }) =>
      new Blob([new Uint8Array(quality === 0.62 ? 120_000 : 160_000)], {
        type: blobType,
      })
  );
});

it('creates a candidate with stable filename and mime metadata', async () => {
  const candidate = await createAttachmentCandidate({
    blobType: 'image/png',
    extension: 'png',
    size: { width: 720, height: 420 },
    stepId: 'step-1',
    stepNumber: 1,
    svgMarkup: '<svg />',
  });

  expect(candidate).toMatchObject({
    dataUrl: 'data:image/png;size=160000',
    filename: 'step1.png',
    mimeType: 'image/png',
    stepId: 'step-1',
    stepNumber: 1,
  });
});

it('builds one JPEG candidate per configured quality', async () => {
  const candidates = await createJpegAttachmentCandidates({
    size: { width: 720, height: 420 },
    stepId: 'step-1',
    stepNumber: 1,
    svgMarkup: '<svg />',
  });

  expect(candidates).toHaveLength(4);
  expect(candidates.map((candidate) => candidate.filename)).toEqual([
    'step1.jpg',
    'step1.jpg',
    'step1.jpg',
    'step1.jpg',
  ]);
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { buildScenarioCaptureImageDataUrlMock } = vi.hoisted(() => ({
  buildScenarioCaptureImageDataUrlMock: vi.fn(),
}));

vi.mock('../../../../platform/i18n', () => ({
  getCurrentLocale: () => 'ru',
  translate: (key: string) => key,
}));

vi.mock('../images', () => ({
  buildScenarioCaptureImageDataUrl: buildScenarioCaptureImageDataUrlMock,
  scenarioCaptureImageScales: {
    full: 4,
    preview: 2,
  },
}));

import { createScenarioCaptureStep } from '../../../../features/scenario/project/public';
import { renderCaptureStepHtml } from './capture/render';

beforeEach(() => {
  buildScenarioCaptureImageDataUrlMock.mockReset();
  buildScenarioCaptureImageDataUrlMock.mockImplementation(
    async (_step: unknown, _asset: unknown, imageFormat: 'svg' | 'png') =>
      imageFormat === 'png' ? 'data:image/png;base64,cGl4ZWw=' : 'data:image/svg+xml;utf8,%3Csvg%3E'
  );
});

describe('renderCaptureStepHtml', () => {
  it('renders a missing-capture fallback when the asset resolver returns nothing', async () => {
    const result = await renderCaptureStepHtml({
      captureIndex: 1,
      imageFormat: 'png',
      includeFullImages: false,
      resolveAsset: async () => undefined,
      step: createScenarioCaptureStep({
        assetId: 'missing-asset',
        title: 'Missing capture',
        body: 'Explain the fallback.',
      }),
    });

    expect(result.sectionHtml).toContain('missing-step');
    expect(result.sectionHtml).toContain('scenario.editor.exportMissingAsset');
    expect(result.lightboxHtml).toBeUndefined();
  });

  it('renders optional lightbox markup only for png exports with full images enabled', async () => {
    const step = createScenarioCaptureStep({
      assetId: 'asset-1',
      title: 'Capture title',
      body: 'Capture body',
    });
    const resolveAsset = async () => new Blob(['pixel'], { type: 'image/png' });

    const pngResult = await renderCaptureStepHtml({
      captureIndex: 1,
      imageFormat: 'png',
      includeFullImages: true,
      resolveAsset,
      step,
    });
    const svgResult = await renderCaptureStepHtml({
      captureIndex: 1,
      imageFormat: 'svg',
      includeFullImages: true,
      resolveAsset,
      step,
    });

    expect(pngResult.sectionHtml).toContain('capture-media-link');
    expect(pngResult.lightboxHtml).toContain('sniptale-full-image-1');
    expect(svgResult.sectionHtml).not.toContain('capture-media-link');
    expect(svgResult.lightboxHtml).toBeUndefined();
  });
});

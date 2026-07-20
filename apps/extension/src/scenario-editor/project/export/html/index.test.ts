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

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createScenarioCaptureStep,
  createScenarioNoteStep,
} from '../../../../features/scenario/project/public';
import { type ScenarioProject } from '../../../../features/scenario/contracts/types/project';
import { buildScenarioHtmlExport } from './';

function createProject(): ScenarioProject {
  return {
    version: 2,
    id: 'scenario-1',
    name: 'How to Export',
    createdAt: 1,
    updatedAt: 2,
    trash: [],
    suggestedEvents: [],
    steps: [
      createScenarioCaptureStep({
        assetId: 'asset-1',
        title: 'Open export menu',
        body: 'Choose HTML export first.',
      }),
      createScenarioNoteStep({
        title: 'Check the preview',
        body: 'Make sure the result looks correct before sharing it.',
        tone: 'info',
      }),
    ],
  };
}

async function resolveAsset(assetId: string): Promise<Blob | undefined> {
  if (assetId !== 'asset-1') {
    return undefined;
  }

  return new Blob(['pixel'], { type: 'image/png' });
}

beforeEach(() => {
  buildScenarioCaptureImageDataUrlMock.mockReset();
  buildScenarioCaptureImageDataUrlMock.mockImplementation(
    async (_step: unknown, _asset: unknown, imageFormat: 'svg' | 'png') =>
      imageFormat === 'png' ? 'data:image/png;base64,cGl4ZWw=' : 'data:image/svg+xml;utf8,%3Csvg%3E'
  );
});

describe('buildScenarioHtmlExport', () => {
  it('assembles html exports with rendered sections and stable export metadata', async () => {
    const result = await buildScenarioHtmlExport(createProject(), resolveAsset);
    const html = await result.blob.text();

    expect(result.format).toBe('html');
    expect(result.filename).toBe('how-to-export.html');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('class="capture-step"');
    expect(html).toContain('class="note-step"');
    expect(html).toContain('Open export menu');
    expect(html).toContain('Check the preview');
  });

  it('routes full-image lightboxes only for png exports that explicitly enable them', async () => {
    const pngResult = await buildScenarioHtmlExport(createProject(), resolveAsset, 'png', true);
    const svgResult = await buildScenarioHtmlExport(createProject(), resolveAsset, 'svg', true);
    const pngHtml = await pngResult.blob.text();
    const svgHtml = await svgResult.blob.text();

    expect(pngHtml).toContain('data-lightbox-target="sniptale-full-image-1"');
    expect(svgHtml).not.toContain('data-lightbox-target="sniptale-full-image-1"');
  });
});

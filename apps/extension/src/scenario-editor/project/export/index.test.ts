const {
  blobToDataUrlMock,
  buildScenarioCaptureImageBlobMock,
  buildScenarioCaptureImageDataUrlMock,
  generatedArchives,
  measureImageBlobMock,
} = vi.hoisted(() => ({
  blobToDataUrlMock: vi.fn(),
  buildScenarioCaptureImageBlobMock: vi.fn(),
  buildScenarioCaptureImageDataUrlMock: vi.fn(),
  generatedArchives: [] as Array<Record<string, unknown>>,
  measureImageBlobMock: vi.fn(),
}));

vi.mock('jszip', () => ({
  default: class FakeScenarioZip {
    private readonly files = new Map<string, unknown>();

    file(path: string, data: unknown) {
      this.files.set(path, data);
      return this;
    }

    async generateAsync(): Promise<Blob> {
      const archive = Object.fromEntries(this.files.entries());
      generatedArchives.push(archive);
      return new Blob([JSON.stringify(archive)], { type: 'application/json' });
    }
  },
}));

vi.mock('../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/data-url')>()),
  blobToDataUrl: blobToDataUrlMock,
}));

vi.mock('@sniptale/platform/browser/media/image-dimensions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/media/image-dimensions')>()),
  measureImageBlob: measureImageBlobMock,
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  getCurrentLocale: () => 'ru',
  translate: (key: string) => key,
}));

vi.mock('./images', () => ({
  buildScenarioCaptureImageBlob: buildScenarioCaptureImageBlobMock,
  buildScenarioCaptureImageDataUrl: buildScenarioCaptureImageDataUrlMock,
  scenarioCaptureImageScales: {
    full: 4,
    preview: 2,
  },
}));

import { beforeEach, expect, it, vi } from 'vitest';
import { buildScenarioHtmlExport } from './html';
import { buildScenarioMarkdownExport } from './markdown';
import {
  createScenarioCaptureStep,
  createScenarioDividerStep,
  createScenarioNoteStep,
  createScenarioSectionStep,
} from '../../../features/scenario/project/public';
import { type ScenarioProject } from '../../../features/scenario/contracts/types/project';

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

function createProjectWithMissingAsset(): ScenarioProject {
  return {
    version: 2,
    id: 'scenario-2',
    name: 'Fallback',
    createdAt: 1,
    updatedAt: 2,
    trash: [],
    suggestedEvents: [],
    steps: [
      createScenarioCaptureStep({
        assetId: 'missing-asset',
      }),
      createScenarioSectionStep({
        title: 'Section title',
        body: 'Section caption',
      }),
      createScenarioDividerStep(),
    ],
  };
}

async function resolveAsset(assetId: string): Promise<Blob | undefined> {
  if (assetId !== 'asset-1') {
    return undefined;
  }

  return new Blob(['pixel'], { type: 'image/png' });
}

function installScenarioExportImageMocks() {
  generatedArchives.length = 0;
  blobToDataUrlMock.mockImplementation(async (blob: Blob) =>
    blob.type.startsWith('image/svg+xml')
      ? 'data:image/svg+xml;utf8,%3Csvg%3E'
      : 'data:image/png;base64,cGl4ZWw='
  );
  measureImageBlobMock.mockResolvedValue({ width: 1440, height: 900 });
  buildScenarioCaptureImageDataUrlMock.mockImplementation(
    async (_step: unknown, _asset: unknown, imageFormat: 'svg' | 'png') =>
      imageFormat === 'png' ? 'data:image/png;base64,cGl4ZWw=' : 'data:image/svg+xml;utf8,%3Csvg%3E'
  );
  buildScenarioCaptureImageBlobMock.mockImplementation(
    async (_step: unknown, _asset: unknown, imageFormat: 'svg' | 'png') =>
      new Blob([imageFormat], {
        type: imageFormat === 'png' ? 'image/png' : 'image/svg+xml;charset=utf-8',
      })
  );
}

beforeEach(() => {
  installScenarioExportImageMocks();
});

it('builds a single-file html export with embedded image data', async () => {
  const result = await buildScenarioHtmlExport(createProject(), resolveAsset);
  const html = await result.blob.text();

  expect(result.format).toBe('html');
  expect(result.filename).toBe('how-to-export.html');
  expect(html).toContain('<!DOCTYPE html>');
  expect(html).toContain('How to Export');
  expect(html).toContain('Open export menu');
  expect(html).toContain('Choose HTML export first.');
  expect(html).toContain('data:image/png;base64');
  expect(html).toContain('class="capture-step"');
  expect(html).toContain('class="note-step"');
  expect(html).toContain('<html lang="ru">');
  expect(html).toContain('aria-label="scenario.editor.exportDocumentLabel"');
  expect(html).not.toContain('class="lightbox"');
  expect(html).toContain('>01<');
});

it('supports png exports and keeps capture steps print-safe inside a single page block', async () => {
  const htmlResult = await buildScenarioHtmlExport(createProject(), resolveAsset, 'png');
  const markdownResult = await buildScenarioMarkdownExport(createProject(), resolveAsset, 'png');
  const html = await htmlResult.blob.text();
  const archive = generatedArchives[0] as Record<string, Blob | string> | undefined;

  expect(html).toContain('data:image/png;base64');
  expect(html).toContain('break-inside:avoid;page-break-inside:avoid;');
  expect(archive?.['scenario.md']).toContain('![Open export menu](assets/step-1.png)');
  expect(archive?.['assets/step-1.png']).toBeInstanceOf(Blob);
  expect(markdownResult.filename).toBe('how-to-export-markdown.zip');
});

it('can include a hover link to the full original image in png HTML exports', async () => {
  const result = await buildScenarioHtmlExport(createProject(), resolveAsset, 'png', true);
  const html = await result.blob.text();

  expect(html).toContain('data-lightbox-target="sniptale-full-image-1"');
  expect(html).toContain('scenario.editor.exportOpenFullImage');
  expect(html).toContain('scenario.editor.exportClosePreview');
  expect(html).toContain('id="sniptale-full-image-1"');
  expect(html).toContain('body.lightbox-open');
  expect(html).toContain('src="data:image/png;base64,cGl4ZWw=');
});

it('ignores full-image links for svg exports', async () => {
  const result = await buildScenarioHtmlExport(createProject(), resolveAsset, 'svg', true);
  const html = await result.blob.text();

  expect(html).not.toContain('data-lightbox-target="sniptale-full-image-1"');
  expect(html).toContain('src="data:image/svg+xml;utf8,%3Csvg%3E"');
});

it('builds markdown zip exports with scenario.md and capture assets', async () => {
  const result = await buildScenarioMarkdownExport(createProject(), resolveAsset);
  const archive = generatedArchives[0] as Record<string, Blob | string> | undefined;

  expect(result.format).toBe('markdown');
  expect(result.filename).toBe('how-to-export-markdown.zip');
  expect(archive?.['scenario.md']).toContain('# How to Export');
  expect(archive?.['scenario.md']).toContain('## Open export menu');
  expect(archive?.['scenario.md']).toContain('![Open export menu](assets/step-1.png)');
  expect(archive?.['scenario.md']).toContain('### Check the preview');
  expect(archive?.['assets/step-1.png']).toBeInstanceOf(Blob);
});

it('renders missing capture assets and non-capture steps without crashing', async () => {
  const htmlExport = await buildScenarioHtmlExport(createProjectWithMissingAsset(), resolveAsset);
  const markdownExport = await buildScenarioMarkdownExport(
    createProjectWithMissingAsset(),
    resolveAsset
  );
  const html = await htmlExport.blob.text();
  const archive = generatedArchives[0] as Record<string, Blob | string> | undefined;

  expect(html).toContain('scenario.editor.exportMissingAsset');
  expect(html).toContain('Section title');
  expect(html).toContain('class="section-step"');
  expect(html).toContain('Section caption');
  expect(archive?.['scenario.md']).toContain('## Step 1');
  expect(archive?.['scenario.md']).toContain('## Section title');
  expect(archive?.['scenario.md']).not.toContain('Section caption');
  expect(archive?.['scenario.md']).toContain('\n---\n');
  expect(archive?.['assets/step-1.png']).toBeUndefined();
  expect(markdownExport.filename).toBe('fallback-markdown.zip');
});

it('omits step-body paragraphs when capture and section text is blank', async () => {
  const project: ScenarioProject = {
    ...createProject(),
    steps: [
      createScenarioCaptureStep({
        assetId: 'asset-1',
        title: 'Blank capture',
        body: '   ',
      }),
      createScenarioSectionStep({
        title: 'Blank section',
        body: '   ',
      }),
    ],
  };

  const result = await buildScenarioHtmlExport(project, resolveAsset);
  const html = await result.blob.text();

  expect(html).not.toContain('<p class="step-body">');
  expect(html).toContain('Blank section');
});

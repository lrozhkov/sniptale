import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import {
  createDefaultScenarioElementAnimation,
  createDefaultScenarioElementBuild,
  createScenarioProjectV3,
} from '../../../../../features/scenario/project/v3';
import type {
  ScenarioElement,
  ScenarioProjectV3,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import { buildScenarioDeckMarkdownExport } from './';

describe('buildScenarioDeckMarkdownExport', () => {
  it('packages markdown, slide previews, assets, notes, code, and source JSON', async () => {
    const result = await buildScenarioDeckMarkdownExport({
      getAssetBlob: vi.fn(async () => new Blob(['asset-bytes'], { type: 'image/png' })),
      options: createMarkdownOptions(),
      project: createMarkdownProject(),
    });
    const archive = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const markdown = await archive.file('scenario.md')?.async('string');
    const slidePreview = await archive.file('slides/slide-1.svg')?.async('string');

    expect(result.filename).toBe('markdown-deck-markdown.zip');
    expect(markdown).toContain('# Markdown Deck');
    expect(markdown).toContain('![Flow &lt;\\[1\\]&gt;](slides/slide-1.svg)');
    expect(markdown).toContain('Code: ts');
    expect(markdown).toContain('> Notes: Presenter note');
    expect(slidePreview).toContain('<svg');
    expect(archive.file('assets/asset-image.png')).not.toBeNull();
    expect(archive.file('scenario.json')).not.toBeNull();
  });

  it('records missing image assets in markdown without blocking export', async () => {
    const result = await buildScenarioDeckMarkdownExport({
      getAssetBlob: vi.fn(async () => undefined),
      options: createMarkdownOptions({ includeSourceJson: false }),
      project: createMarkdownProject(),
    });
    const archive = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const markdown = await archive.file('scenario.md')?.async('string');

    expect(result.missingAssetIds).toEqual(['asset-image']);
    expect(markdown).toContain('Missing assets: `asset-image`');
    expect(archive.file('scenario.json')).toBeNull();
  });
});

function createMarkdownProject(): ScenarioProjectV3 {
  const project = createScenarioProjectV3('Markdown Deck');

  return {
    ...project,
    slides: [
      {
        ...project.slides[0]!,
        elements: createMarkdownElements(),
        id: 'slide-1',
        notes: 'Presenter note',
        title: 'Flow <[1]>',
      },
    ],
  };
}

function createMarkdownElements(): ScenarioElement[] {
  return [
    {
      ...createBaseElement('code-1', 'code'),
      code: 'const value = 1;',
      language: 'ts',
      style: { backgroundColor: '#111111', fontSize: 18, textColor: '#ffffff' },
    },
    {
      ...createBaseElement('image-1', 'image'),
      assetRef: { assetId: 'asset-image', galleryAssetId: null },
      captureContext: null,
      contentTransform: { scale: 1, x: 0, y: 0 },
      editDocumentId: null,
      fit: 'contain',
    },
  ];
}

function createBaseElement<TKind extends ScenarioElement['kind']>(id: string, kind: TKind) {
  return {
    animation: createDefaultScenarioElementAnimation(),
    build: createDefaultScenarioElementBuild(),
    createdAt: 1,
    frame: { height: 120, width: 240, x: 40, y: 50 },
    id,
    kind,
    locked: false,
    name: id,
    opacity: 1,
    role: null,
    updatedAt: 1,
    visible: true,
  };
}

function createMarkdownOptions(
  overrides: Partial<Parameters<typeof buildScenarioDeckMarkdownExport>[0]['options']> = {}
) {
  return {
    assetMode: 'embed',
    format: 'markdown',
    includeMissingPlaceholders: true,
    includeNotes: true,
    includeSourceJson: true,
    ...overrides,
  } as const;
}

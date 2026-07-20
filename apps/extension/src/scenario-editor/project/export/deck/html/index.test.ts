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
import { buildScenarioDeckHtmlExport } from './';

describe('buildScenarioDeckHtmlExport', () => {
  it('builds a standalone escaped HTML deck with embedded assets and notes', async () => {
    const result = await buildScenarioDeckHtmlExport({
      getAssetBlob: createAssetResolver(),
      options: createHtmlOptions({ assetMode: 'embed' }),
      project: createDeckProject(),
    });
    const html = await result.blob.text();

    expect(result.filename).toBe('demo-deck.html');
    expect(result.missingAssetIds).toEqual([]);
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('&lt;Intro&gt;');
    expect(html).toContain('data:image/png;base64');
    expect(html).toContain('<aside class="notes">Speaker note</aside>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<b>unsafe</b>');
    expect(html).not.toContain('scenario-source-json');
  });

  it('packages HTML with asset files and source JSON when requested', async () => {
    const result = await buildScenarioDeckHtmlExport({
      getAssetBlob: createAssetResolver(),
      options: createHtmlOptions({ assetMode: 'files', includeSourceJson: true }),
      project: createDeckProject(),
    });
    const archive = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const html = await archive.file('index.html')?.async('string');
    const source = await archive.file('scenario.json')?.async('string');

    expect(result.filename).toBe('demo-deck-html.zip');
    expect(html).toContain('assets/asset-image.png');
    expect(html).toContain('scenario-source-json');
    expect(source).toContain('"version": 3');
    expect(archive.file('assets/asset-image.png')).not.toBeNull();
  });

  it('surfaces missing image assets in the exported document', async () => {
    const result = await buildScenarioDeckHtmlExport({
      getAssetBlob: vi.fn(async () => undefined),
      options: createHtmlOptions({ assetMode: 'embed' }),
      project: createDeckProject(),
    });
    const html = await result.blob.text();

    expect(result.missingAssetIds).toEqual(['asset-image']);
    expect(html).toContain('Missing assets: asset-image');
  });
});

function createDeckProject(): ScenarioProjectV3 {
  const project = createScenarioProjectV3('Demo Deck');

  return {
    ...project,
    slides: [
      {
        ...project.slides[0]!,
        elements: createDeckElements(),
        id: 'slide-1',
        notes: 'Speaker note',
        title: '<Intro>',
      },
    ],
  };
}

function createDeckElements(): ScenarioElement[] {
  return [
    createTextElement(),
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

function createTextElement(): ScenarioElement {
  return {
    ...createBaseElement('text-1', 'text'),
    style: { align: 'left', color: '#111111', fontSize: 28, fontWeight: 700 },
    text: '<b>unsafe</b>',
  };
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

function createHtmlOptions(
  overrides: Partial<Parameters<typeof buildScenarioDeckHtmlExport>[0]['options']>
) {
  return {
    assetMode: 'embed',
    format: 'html',
    includeMissingPlaceholders: true,
    includeNotes: true,
    includeSourceJson: false,
    ...overrides,
  } as const;
}

function createAssetResolver() {
  return vi.fn(async () => new Blob(['asset-bytes'], { type: 'image/png' }));
}

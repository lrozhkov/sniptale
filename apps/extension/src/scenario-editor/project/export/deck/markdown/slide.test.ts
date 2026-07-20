import { describe, expect, it } from 'vitest';
import type { ScenarioElement, ScenarioSlide } from '@sniptale/runtime-contracts/scenario/types/v3';
import {
  createDefaultScenarioElementAnimation,
  createDefaultScenarioElementBuild,
  createScenarioSlide,
} from '../../../../../features/scenario/project/v3';
import { renderScenarioDeckMarkdownSlide } from './slide';

describe('renderScenarioDeckMarkdownSlide', () => {
  it('renders all typed element families into portable markdown', () => {
    const markdown = renderScenarioDeckMarkdownSlide({
      options: {
        assetMode: 'files',
        format: 'markdown',
        includeMissingPlaceholders: true,
        includeNotes: true,
        includeSourceJson: false,
      },
      rendered: { index: 0, slide: createMarkdownSlide(), svg: '<svg />' },
      slideAssetPath: 'slides/slide-1.svg',
    });

    expect(markdown).toContain('Text \\[escaped\\]');
    expect(markdown).toContain('Callout &lt;safe&gt;');
    expect(markdown).toContain('Code: js');
    expect(markdown).toContain('Image asset: `asset-1`');
    expect(markdown).toContain('Shape: ellipse');
    expect(markdown).toContain('Connector: line');
    expect(markdown).toContain('Connector: arrow');
    expect(markdown).toContain('> Notes: Note \\[one\\]');
  });

  it('omits notes when disabled', () => {
    const markdown = renderScenarioDeckMarkdownSlide({
      options: {
        assetMode: 'files',
        format: 'markdown',
        includeMissingPlaceholders: true,
        includeNotes: false,
        includeSourceJson: false,
      },
      rendered: { index: 0, slide: createMarkdownSlide(), svg: '<svg />' },
      slideAssetPath: 'slides/slide-1.svg',
    });

    expect(markdown).not.toContain('Notes:');
  });
});

function createMarkdownSlide(): ScenarioSlide {
  return createScenarioSlide({
    elements: createMarkdownElements(),
    notes: 'Note [one]',
    title: 'Slide [one]',
  });
}

function createMarkdownElements(): ScenarioElement[] {
  return [
    { ...createBaseElement('text-1', 'text'), style: textStyle(), text: 'Text [escaped]' },
    {
      ...createBaseElement('callout-1', 'callout'),
      connector: null,
      panel: panelStyle(),
      text: 'Callout <safe>',
    },
    {
      ...createBaseElement('code-1', 'code'),
      code: 'console.log(1)',
      language: 'js',
      style: codeStyle(),
    },
    imageElement(),
    {
      ...createBaseElement('shape-1', 'shape'),
      cornerRadius: 0,
      fillColor: '#fff',
      shape: 'ellipse',
      strokeColor: '#111',
      strokeWidth: 1,
    },
    connectorElement('line-1', 'line'),
    { ...connectorElement('arrow-1', 'arrow'), head: 'end' },
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

function imageElement(): ScenarioElement {
  return {
    ...createBaseElement('image-1', 'image'),
    assetRef: { assetId: 'asset-1', galleryAssetId: null },
    captureContext: null,
    contentTransform: { scale: 1, x: 0, y: 0 },
    editDocumentId: null,
    fit: 'contain',
  };
}

function connectorElement<TKind extends 'arrow' | 'line'>(id: string, kind: TKind) {
  return {
    ...createBaseElement(id, kind),
    dash: 'solid' as const,
    end: { x: 1, y: 1 },
    start: { x: 0, y: 0 },
    strokeColor: '#111111',
    strokeWidth: 2,
  };
}

function textStyle() {
  return { align: 'left', color: '#111111', fontSize: 20, fontWeight: 500 } as const;
}

function panelStyle() {
  return {
    backgroundColor: '#ffffff',
    borderColor: '#111111',
    borderWidth: 1,
    textColor: '#111111',
  };
}

function codeStyle() {
  return { backgroundColor: '#111111', fontSize: 18, textColor: '#ffffff' };
}

import { expect, it } from 'vitest';

import {
  createScenarioArrowElement,
  createScenarioCalloutElement,
  createScenarioCodeElement,
  createScenarioImageElement,
  createScenarioLineElement,
  createScenarioShapeElement,
  createScenarioSlide,
  createScenarioTextElement,
} from '../../../../features/scenario/project/v3';
import {
  instantiateScenarioTemplateSlide,
  listBundledScenarioTemplates,
} from '../../../../features/scenario/project/v3/templates';
import type { ScenarioSlide } from '@sniptale/runtime-contracts/scenario/types/v3';
import { createScenarioSlideSvgDataUrl } from './svg';
import { renderScenarioSlide } from './render';

function createRenderTestSlide(): ScenarioSlide {
  return createScenarioSlide({
    elements: [
      createScenarioShapeElement({ role: 'background-shape' }),
      createScenarioImageElement({
        assetRef: { assetId: 'asset-1', galleryAssetId: null },
        contentTransform: { scale: 1.25, x: 12, y: -8 },
        fit: 'cover',
        role: 'main-image',
      }),
      createScenarioTextElement({
        role: 'title',
        text: 'Hello <slide>\n& user',
      }),
      createScenarioArrowElement({ role: 'connector' }),
      createScenarioCodeElement({
        code: 'const value = "<safe>";',
        role: 'code',
      }),
    ],
    title: 'Render test',
  });
}

it('renders deterministic escaped SVG with stable element order', () => {
  const slide = createRenderTestSlide();
  const first = renderScenarioSlide(slide, {
    assets: { 'asset-1': { height: 240, source: 'data:image/png;base64,abc', width: 320 } },
    mode: 'export',
    outputWidth: 640,
  });
  const second = renderScenarioSlide(slide, {
    assets: { 'asset-1': { height: 240, source: 'data:image/png;base64,abc', width: 320 } },
    mode: 'export',
    outputWidth: 640,
  });

  expect(first.svg).toBe(second.svg);
  expect(first.svg).toContain('Hello');
  expect(first.svg).toContain('&lt;slide&gt;');
  expect(first.svg).toContain('const value = "&lt;safe&gt;";');
  expect(first.elements.map((rendered) => rendered.element.role)).toEqual([
    'background-shape',
    'main-image',
    'title',
    'connector',
    'code',
  ]);
  expect(createScenarioSlideSvgDataUrl(first.svg)).toContain('data:image/svg+xml;charset=utf-8,');
  expect(createScenarioSlideSvgDataUrl(first.svg)).not.toContain('<svg');
});

it('falls back before writing unsafe SVG paint tokens', () => {
  const unsafePaint = 'url(https://tracker.test/paint.svg#x)';
  const slide = createScenarioSlide({
    canvas: {
      background: { color: unsafePaint, kind: 'solid' },
      height: 720,
      width: 1280,
    },
    elements: [
      createScenarioShapeElement({ fillColor: unsafePaint, strokeColor: unsafePaint }),
      createScenarioLineElement({ strokeColor: unsafePaint }),
      createScenarioCalloutElement({
        connector: { end: { x: 20, y: 30 }, start: { x: 10, y: 10 } },
        panel: {
          backgroundColor: unsafePaint,
          borderColor: unsafePaint,
          borderWidth: 1,
          textColor: unsafePaint,
        },
        text: 'Callout',
      }),
      createScenarioTextElement({
        style: { align: 'left', color: unsafePaint, fontSize: 24, fontWeight: 700 },
        text: 'Text',
      }),
      createScenarioCodeElement({
        style: { backgroundColor: unsafePaint, fontSize: 24, textColor: unsafePaint },
      }),
    ],
  });

  const rendered = renderScenarioSlide(slide, { mode: 'export' });

  expect(rendered.svg).not.toContain(unsafePaint);
  expect(rendered.svg).not.toContain('tracker.test');
  expect(rendered.svg).toContain('fill="#f3ede2"');
  expect(rendered.svg).toContain('fill="transparent"');
  expect(rendered.svg).toContain('stroke="#111111"');
});

it('reports missing images and keeps selection metadata editor-only', () => {
  const slide = createRenderTestSlide();
  const image = slide.elements.find((element) => element.kind === 'image')!;
  const editorRender = renderScenarioSlide(slide, {
    missingAssetLabel: 'Image unavailable',
    mode: 'editor',
    selectedElementIds: [image.id],
  });
  const thumbnailRender = renderScenarioSlide(slide, {
    mode: 'thumbnail',
    selectedElementIds: [image.id],
  });

  expect(editorRender.missingAssets).toEqual([{ assetId: 'asset-1', elementId: image.id }]);
  expect(editorRender.selectionBoxes).toHaveLength(1);
  expect(thumbnailRender.selectionBoxes).toEqual([]);
  expect(editorRender.svg).toContain('Image unavailable');
});

it('applies image fit and content transform inside the image frame', () => {
  const slide = createRenderTestSlide();
  const image = slide.elements.find((element) => element.kind === 'image')!;
  const rendered = renderScenarioSlide(slide, {
    assets: { 'asset-1': { height: 240, source: 'data:image/png;base64,abc', width: 320 } },
    mode: 'export',
  });
  const renderedImage = rendered.elements.find((element) => element.element.id === image.id);

  expect(renderedImage).toMatchObject({
    contentBox: expect.objectContaining({
      height: expect.any(Number),
      width: expect.any(Number),
      x: expect.any(Number),
      y: expect.any(Number),
    }),
  });
  expect(rendered.svg).toContain('clip-path');
});

it('filters rendered elements by click build state', () => {
  const slide = createScenarioSlide({
    clicks: { count: 2, initialIndex: 0 },
    elements: [
      createScenarioTextElement({
        build: { hideAtClick: null, order: 1, showAtClick: 0 },
        role: 'intro',
      }),
      createScenarioTextElement({
        build: { hideAtClick: null, order: 2, showAtClick: 2 },
        role: 'fragment',
      }),
    ],
  });

  expect(renderScenarioSlide(slide, { clickIndex: 0, mode: 'export' }).elements).toHaveLength(1);
  expect(renderScenarioSlide(slide, { clickIndex: 2, mode: 'export' }).elements).toHaveLength(2);
});

it('renders SVG branches for ellipse shapes, centered text, callouts, and dashed connectors', () => {
  const slide = createScenarioSlide({
    elements: [
      createScenarioShapeElement({ shape: 'ellipse' }),
      createScenarioTextElement({
        style: { align: 'center', color: '#111', fontSize: 24, fontWeight: 700 },
      }),
      createScenarioLineElement({ dash: 'dotted' }),
      createScenarioArrowElement({ dash: 'dashed' }),
      createScenarioCalloutElement({ connector: null, text: 'Callout A' }),
      createScenarioCalloutElement({
        connector: { end: { x: 20, y: 30 }, start: { x: 10, y: 10 } },
        frame: { height: 80, width: 0, x: 20, y: 20 },
        text: 'Callout B',
      }),
    ],
  });
  const rendered = renderScenarioSlide(slide, { mode: 'export' });

  expect(rendered.svg).toContain('<ellipse');
  expect(rendered.svg).toContain('text-anchor="middle"');
  expect(rendered.svg).toContain('stroke-dasharray="2 8"');
  expect(rendered.svg).toContain('stroke-dasharray="10 8"');
  expect(rendered.svg).toContain('marker-end="url(#scenario-arrow-head)"');
  expect(rendered.svg).toContain('Callout A');
  expect(rendered.svg).toContain('Callout B');
});

it('scales thumbnail-only visual metrics with the slide canvas', () => {
  const slide = createScenarioSlide({
    elements: [
      createScenarioImageElement({
        assetRef: { assetId: 'asset-missing', galleryAssetId: null },
        frame: { height: 320, width: 520, x: 80, y: 80 },
      }),
      createScenarioShapeElement({
        cornerRadius: 20,
        frame: { height: 80, width: 160, x: 700, y: 90 },
        strokeWidth: 4,
      }),
      createScenarioArrowElement({
        frame: { height: 80, width: 160, x: 700, y: 220 },
        strokeWidth: 4,
      }),
    ],
  });

  const rendered = renderScenarioSlide(slide, {
    missingAssetLabel: 'Image unavailable',
    mode: 'thumbnail',
    outputWidth: 128,
  });

  expect(rendered.svg).toContain('font-size="2.2"');
  expect(rendered.svg).toContain('rx="1.2"');
  expect(rendered.svg).toContain('stroke-width="0.4"');
  expect(rendered.svg).not.toContain('stroke-width="4"');
});

it('renders every bundled template thumbnail without default missing-image copy', () => {
  const renderedTemplates = listBundledScenarioTemplates().map((template) =>
    renderScenarioSlide(instantiateScenarioTemplateSlide(template), {
      missingAssetLabel: '',
      mode: 'thumbnail',
      outputHeight: 72,
      outputWidth: 128,
    })
  );

  expect(renderedTemplates).toHaveLength(9);
  for (const rendered of renderedTemplates) {
    expect(rendered.svg).not.toContain('Missing image');
  }
});

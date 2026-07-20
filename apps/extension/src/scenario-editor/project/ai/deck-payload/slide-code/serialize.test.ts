import { expect, it } from 'vitest';
import {
  createScenarioArrowElement,
  createScenarioCalloutElement,
  createScenarioCodeElement,
  createScenarioImageElement,
  createScenarioLineElement,
  createScenarioProjectV3,
  createScenarioShapeElement,
  createScenarioTextElement,
} from '../../../../../features/scenario/project/v3';
import type { ScenarioSlide } from '@sniptale/runtime-contracts/scenario/types/v3';
import { createScenarioAiProjectOutline, serializeScenarioAiSlideCode } from './';
import { createScenarioAiToolManifest } from './manifest';

it('serializes editable slide fields and redacts page URL/query and HTML-like text', () => {
  const project = createScenarioProjectV3('AI project');
  const slide = createCapturedSlide(project.slides[0]!);

  const code = serializeScenarioAiSlideCode({ project, slide });
  const json = JSON.stringify(code);

  expect(code.elements[0]).toMatchObject({
    assetRef: { assetId: 'asset-1', galleryAssetId: null },
    captureContext: {
      page: { title: 'Checkout', url: 'https://example.test/path' },
      target: { text: 'secret() Buy' },
    },
    editDocumentPresent: true,
  });
  expect(code).toMatchObject({
    backgroundTransition: { kind: 'fade' },
    clicks: { count: 0, initialIndex: 0 },
    layout: { layoutId: 'blank' },
    projectPresentation: { transition: { kind: 'fade' } },
    source: {
      captureMetadata: { trigger: 'pointer-up' },
      kind: 'capture',
      page: { title: 'Checkout', url: 'https://example.test/path' },
    },
    transition: { kind: 'fade' },
  });
  expect(json).not.toContain('token=secret');
  expect(json).not.toContain('<script>');
});

function createCapturedSlide(slide: ScenarioSlide): ScenarioSlide {
  return {
    ...slide,
    elements: [createCapturedImageElement()],
    id: 'slide-1',
    source: createCapturedSlideSource(),
  };
}

function createCapturedImageElement() {
  return createScenarioImageElement({
    assetRef: { assetId: 'asset-1', galleryAssetId: null },
    captureContext: {
      captureMetadata: { pointerRange: null, scroll: null, trigger: 'pointer-up' },
      cursorPoint: null,
      interactionPoint: null,
      page: createCapturedPage(),
      target: createCapturedTarget(),
    },
    editDocumentId: 'doc-1',
  });
}

function createCapturedSlideSource(): ScenarioSlide['source'] {
  return {
    assetId: 'asset-1',
    captureMetadata: { pointerRange: null, scroll: null, trigger: 'pointer-up' },
    captureSurface: 'visible',
    cursorPoint: null,
    galleryAssetId: null,
    interactionPoint: null,
    kind: 'capture',
    page: createCapturedPage(),
    sourceKind: 'auto-click',
    target: createCapturedTarget(),
  };
}

function createCapturedPage() {
  return {
    devicePixelRatio: 1,
    scrollX: 0,
    scrollY: 0,
    title: '<b>Checkout</b>',
    url: 'https://example.test/path?token=secret#hash',
    viewport: { height: 800, width: 1200, x: 0, y: 0 },
  };
}

function createCapturedTarget() {
  return {
    ariaLabel: null,
    framePadding: null,
    iframeSelector: null,
    rect: null,
    role: 'button',
    selector: null,
    tagName: 'BUTTON',
    text: '<script>secret()</script>Buy',
    title: null,
  };
}

it('creates a compact project outline', () => {
  const project = createScenarioProjectV3('AI project');

  expect(createScenarioAiProjectOutline(project)).toMatchObject({
    name: 'AI project',
    slides: [expect.objectContaining({ elementCount: 0 })],
    version: 3,
  });
});

it('serializes every editable element kind with relevant typed fields', () => {
  const project = createScenarioProjectV3('AI project');
  const slide = {
    ...project.slides[0]!,
    elements: [
      createScenarioTextElement({ text: 'Text' }),
      createScenarioCodeElement({ code: 'const x = 1;', language: 'ts' }),
      createScenarioShapeElement({ shape: 'ellipse' }),
      createScenarioLineElement({ dash: 'dashed' }),
      createScenarioArrowElement({ head: 'both' }),
      createScenarioCalloutElement({ text: 'Callout' }),
    ],
  };

  expect(serializeScenarioAiSlideCode({ project, slide }).elements).toEqual([
    expect.objectContaining({
      animation: expect.objectContaining({ preset: 'none' }),
      build: expect.objectContaining({ showAtClick: 0 }),
      kind: 'text',
      text: 'Text',
    }),
    expect.objectContaining({ code: 'const x = 1;', kind: 'code', language: 'ts' }),
    expect.objectContaining({ kind: 'shape', shape: 'ellipse' }),
    expect.objectContaining({ dash: 'dashed', kind: 'line' }),
    expect.objectContaining({ head: 'both', kind: 'arrow' }),
    expect.objectContaining({ kind: 'callout', text: 'Callout' }),
  ]);
});

it('builds the default tool manifest from bundled templates', () => {
  const manifest = createScenarioAiToolManifest();

  expect(manifest.canvas).toMatchObject({ coordinateSystem: 'slide-pixels', minWidth: 320 });
  expect(manifest.elementKinds).toContain('image');
  expect(manifest.templates.length).toBeGreaterThan(0);
});

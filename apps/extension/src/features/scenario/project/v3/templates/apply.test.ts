import { expect, it } from 'vitest';
import {
  createScenarioCodeElement,
  createScenarioImageElement,
  createScenarioShapeElement,
  createScenarioSlide,
  createScenarioTextElement,
} from '../factories';
import type { ScenarioTemplateDefinition } from '@sniptale/runtime-contracts/scenario/types/v3';
import {
  applyScenarioTemplateToSlide,
  instantiateScenarioTemplateSlide,
  planScenarioTemplateApplication,
} from './apply';

function createTemplate(): ScenarioTemplateDefinition {
  return {
    catalogRank: 0,
    catalogStatus: 'core',
    description: 'Template',
    group: 'section',
    label: 'Role template',
    slide: {
      canvas: { background: { color: '#ffffff', kind: 'solid' }, height: 720, width: 1280 },
      elements: [
        createScenarioTextElement({ role: 'title', text: 'Template title' }),
        createScenarioImageElement({ role: 'main-image' }),
        createScenarioCodeElement({ role: 'code-block', code: 'template' }),
      ],
      layout: {
        compositionPreset: 'guided-screenshot',
        layoutId: 'screenshot-callout',
        safeArea: { bottom: 56, left: 64, right: 64, top: 56 },
        themeOverrides: null,
      },
      notes: 'Template notes',
      title: 'Template slide',
    },
    source: 'bundled',
    templateId: 'role-template',
    version: 1,
  };
}

it('instantiates template slides with fresh slide and element ids', () => {
  const template = createTemplate();
  const slide = instantiateScenarioTemplateSlide(template);

  expect(slide.templateId).toBe('role-template');
  expect(slide.layout.layoutId).toBe('screenshot-callout');
  expect(slide.id).not.toBe(template.slide.elements[0]?.id);
  expect(slide.elements.map((element) => element.id)).not.toEqual(
    template.slide.elements.map((element) => element.id)
  );
});

it('preserves the main screenshot asset when switching between screenshot layouts', () => {
  const result = applyScenarioTemplateToSlide({
    confirmed: true,
    slide: createScreenshotCaptureSlide(),
    template: createTemplate(),
  });

  expect(result.status).toBe('applied');
  if (result.status !== 'applied') {
    throw new Error('Expected screenshot layout application to be applied');
  }

  expect(result.plan.requiresConfirmation).toBe(false);
  expect(result.slide.source).toMatchObject({ assetId: 'capture-asset', kind: 'capture' });
  expect(result.slide.elements.find((element) => element.role === 'main-image')).toMatchObject({
    assetRef: { assetId: 'capture-asset', galleryAssetId: 'gallery-asset' },
    captureContext: expect.objectContaining({ interactionPoint: { x: 40, y: 50 } }),
  });
});

function createScreenshotCaptureSlide() {
  return createScenarioSlide({
    elements: [createScreenshotElement()],
    source: {
      assetId: 'capture-asset',
      captureMetadata: { pointerRange: null, scroll: null, trigger: 'pointer-up' },
      captureSurface: 'visible',
      cursorPoint: null,
      galleryAssetId: 'gallery-asset',
      interactionPoint: { x: 40, y: 50 },
      kind: 'capture',
      page: createCapturePage(),
      sourceKind: 'auto-click',
      target: null,
    },
  });
}

function createScreenshotElement() {
  return createScenarioImageElement({
    assetRef: { assetId: 'capture-asset', galleryAssetId: 'gallery-asset' },
    captureContext: {
      captureMetadata: { pointerRange: null, scroll: null, trigger: 'pointer-up' },
      cursorPoint: null,
      interactionPoint: { x: 40, y: 50 },
      page: createCapturePage(),
      target: null,
    },
    role: 'screenshot',
  });
}

function createCapturePage() {
  return {
    devicePixelRatio: 1,
    scrollX: 0,
    scrollY: 0,
    title: 'Captured page',
    url: 'https://example.test',
    viewport: { height: 720, width: 1280, x: 0, y: 0 },
  };
}

it('plans destructive application before unmatched elements are removed', () => {
  const slide = createScenarioSlide({
    elements: [
      createScenarioTextElement({ role: 'title', text: 'Existing title' }),
      createScenarioTextElement({ role: 'extra-note', text: 'Remove me' }),
    ],
  });
  const plan = planScenarioTemplateApplication({ slide, template: createTemplate() });

  expect(plan.preservedRoles).toContain('title');
  expect(plan.removedElementIds).toEqual([slide.elements[1]?.id]);
  expect(plan.requiresConfirmation).toBe(true);
});

it('does not preserve role matches across incompatible element kinds', () => {
  const slide = createScenarioSlide({
    elements: [createScenarioShapeElement({ role: 'title' })],
  });
  const plan = planScenarioTemplateApplication({ slide, template: createTemplate() });

  expect(plan.preservedRoles).not.toContain('title');
  expect(plan.removedElementIds).toEqual([slide.elements[0]?.id]);
  expect(plan.requiresConfirmation).toBe(true);
});

it('preserves role-bound text, image, and code content after confirmation', () => {
  const slide = createScenarioSlide({
    elements: [
      createScenarioTextElement({ role: 'title', text: 'Existing title' }),
      createScenarioImageElement({
        assetRef: { assetId: 'asset-1', galleryAssetId: null },
        fit: 'cover',
        role: 'main-image',
      }),
      createScenarioCodeElement({
        code: 'const answer = 42;',
        language: 'ts',
        role: 'code-block',
      }),
    ],
    notes: 'Existing notes',
  });
  const result = applyScenarioTemplateToSlide({
    confirmed: true,
    slide,
    template: createTemplate(),
  });

  expect(result.status).toBe('applied');
  if (result.status !== 'applied') {
    throw new Error('Expected template application to be applied');
  }

  expect(result.slide.elements.find((element) => element.role === 'title')).toMatchObject({
    text: 'Existing title',
  });
  expect(result.slide.elements.find((element) => element.role === 'main-image')).toMatchObject({
    assetRef: { assetId: 'asset-1', galleryAssetId: null },
    fit: 'cover',
  });
  expect(result.slide.elements.find((element) => element.role === 'code-block')).toMatchObject({
    code: 'const answer = 42;',
    language: 'ts',
  });
  expect(result.slide.notes).toBe('Existing notes');
});

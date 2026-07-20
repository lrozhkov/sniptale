import { describe, expect, it } from 'vitest';

import {
  createScenarioArrowElement,
  createScenarioImageElement,
  createScenarioProjectV3,
  createScenarioShapeElement,
  createScenarioTextElement,
} from './factories';
import { isScenarioProjectV3, isScenarioSlideV3 } from './guards';

describe('scenario v3 guard valid shapes', () => {
  it('accepts valid v3 projects and slides', () => {
    const project = createScenarioProjectV3('Guarded project');
    const slide = {
      ...project.slides[0]!,
      elements: [createScenarioTextElement({ text: 'Hello' })],
    };

    expect(isScenarioSlideV3(slide)).toBe(true);
    expect(isScenarioProjectV3({ ...project, slides: [slide] })).toBe(true);
  });
});

describe('scenario v3 guard capture sources', () => {
  it('rejects malformed capture slide sources', () => {
    const project = createScenarioProjectV3('Capture source guards');
    const slide = {
      ...project.slides[0]!,
      source: createCaptureSlideSource(),
    };
    const sourceWithoutPage = { ...slide.source };
    const sourceWithoutAssetId = { ...slide.source };

    Reflect.deleteProperty(sourceWithoutPage, 'page');
    Reflect.deleteProperty(sourceWithoutAssetId, 'assetId');

    expect(isScenarioSlideV3(slide)).toBe(true);
    expect(isScenarioSlideV3({ ...slide, source: sourceWithoutPage })).toBe(false);
    expect(isScenarioSlideV3({ ...slide, source: sourceWithoutAssetId })).toBe(false);
    expect(
      isScenarioSlideV3({
        ...slide,
        source: { ...slide.source, page: { title: 'Page' } },
      })
    ).toBe(false);
  });
});

describe('scenario v3 guard project invariants', () => {
  it('rejects unsupported versions and invalid element geometry', () => {
    const project = createScenarioProjectV3('Invalid project');
    const invalidElement = {
      ...createScenarioTextElement(),
      frame: { height: 0, width: 100, x: 0, y: 0 },
    };

    expect(isScenarioProjectV3({ ...project, version: 2 })).toBe(false);
    expect(
      isScenarioProjectV3({
        ...project,
        slides: [{ ...project.slides[0]!, elements: [invalidElement] }],
      })
    ).toBe(false);
  });
});

describe('scenario v3 guard trash entries', () => {
  it('rejects malformed trash entries', () => {
    const project = createScenarioProjectV3('Trash guards');

    expect(
      isScenarioProjectV3({
        ...project,
        trash: [{ deletedAt: 1, originalIndex: 0, slide: project.slides[0]! }],
      })
    ).toBe(true);
    expect(
      isScenarioProjectV3({
        ...project,
        trash: [{ deletedAt: 1, originalIndex: 0, slide: { id: 'broken' } }],
      })
    ).toBe(false);
  });
});

function createCaptureSlideSource() {
  return {
    assetId: 'asset-1',
    captureMetadata: { pointerRange: null, scroll: null, trigger: 'pointer-up' },
    captureSurface: null,
    cursorPoint: null,
    galleryAssetId: null,
    interactionPoint: null,
    kind: 'capture' as const,
    page: {
      devicePixelRatio: 1,
      scrollX: 0,
      scrollY: 0,
      title: 'Page',
      url: 'https://example.test/',
      viewport: { height: 100, width: 100, x: 0, y: 0 },
    },
    sourceKind: null,
    target: null,
  };
}

describe('scenario v3 element payload guards', () => {
  it('rejects malformed kind-specific element payloads', () => {
    const project = createScenarioProjectV3('Element guards');
    const invalidElements = [
      { ...createScenarioTextElement(), style: { align: 'middle' } },
      { ...createScenarioImageElement(), fit: 'stretch' },
      { ...createScenarioShapeElement(), shape: 'triangle' },
      { ...createScenarioArrowElement(), head: 'none' },
    ];

    invalidElements.forEach((element) => {
      expect(
        isScenarioSlideV3({
          ...project.slides[0]!,
          elements: [element],
        })
      ).toBe(false);
    });
  });
});

describe('scenario v3 required presentation fields', () => {
  it('rejects projects and slides that omit presentation-first fields', () => {
    const project = createScenarioProjectV3('Presentation guards');
    const missingProjectPresentation = { ...project } as Record<string, unknown>;
    const missingSlideClicks = { ...project.slides[0]! } as Record<string, unknown>;

    Reflect.deleteProperty(missingProjectPresentation, 'presentation');
    Reflect.deleteProperty(missingSlideClicks, 'clicks');

    expect(isScenarioProjectV3(missingProjectPresentation)).toBe(false);
    expect(isScenarioSlideV3(missingSlideClicks)).toBe(false);
  });
});

describe('scenario v3 guard metadata fields', () => {
  it('validates layout, theme, grid, and style preset metadata', () => {
    const project = createScenarioProjectV3('Presentation metadata');
    const slide = project.slides[0]!;
    const styledSlide = {
      ...slide,
      elements: [createScenarioTextElement({ stylePresetId: 'display-title', text: 'Title' })],
    };

    expect(isScenarioProjectV3({ ...project, slides: [styledSlide] })).toBe(true);
    expect(
      isScenarioProjectV3({ ...project, presentation: { ...project.presentation, themeId: 'bad' } })
    ).toBe(false);
    expect(
      isScenarioSlideV3({ ...slide, layout: { ...slide.layout, compositionPreset: 'bad' } })
    ).toBe(false);
    expect(
      isScenarioProjectV3({
        ...project,
        presentation: {
          ...project.presentation,
          grid: { ...project.presentation.grid, rows: 0 },
        },
      })
    ).toBe(false);
  });
});

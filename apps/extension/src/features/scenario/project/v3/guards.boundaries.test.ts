import { describe, expect, it } from 'vitest';
import {
  createScenarioCalloutElement,
  createScenarioCodeElement,
  createScenarioLineElement,
  createScenarioProjectV3,
  createScenarioSlide,
  createScenarioShapeElement,
  createScenarioTextElement,
} from './factories';
import { isScenarioProjectV3, isScenarioSlideV3 } from './guards';
import { SCENARIO_V3_LIMITS } from './limits';

function createCaptureSource() {
  return {
    assetId: 'asset-1',
    captureMetadata: {
      pointerRange: null,
      scroll: null,
      trigger: 'pointer-up',
    },
    captureSurface: 'tab',
    cursorPoint: null,
    galleryAssetId: null,
    interactionPoint: null,
    kind: 'capture',
    page: {
      devicePixelRatio: 1,
      scrollX: 0,
      scrollY: 0,
      title: 'Page',
      url: 'https://example.test',
      viewport: { height: 720, width: 1280, x: 0, y: 0 },
    },
    sourceKind: 'auto-click',
    target: null,
  };
}

describe('scenario v3 guard import budgets', () => {
  it('rejects oversized project arrays and template library references', () => {
    const project = createScenarioProjectV3('Budgeted project');

    expect(
      isScenarioProjectV3({
        ...project,
        tags: Array.from({ length: SCENARIO_V3_LIMITS.maxTags + 1 }, () => 'tag'),
      })
    ).toBe(false);
    expect(
      isScenarioProjectV3({
        ...project,
        templateLibraries: [{ enabled: true, libraryId: 'x'.repeat(200) }],
      })
    ).toBe(false);
    expect(
      isScenarioProjectV3({
        ...project,
        slides: Array.from({ length: SCENARIO_V3_LIMITS.maxSlides + 1 }, () => project.slides[0]),
      })
    ).toBe(false);
  });

  it('rejects oversized slide and element domains before rendering', () => {
    const slide = createScenarioProjectV3('Budgeted slide').slides[0]!;
    const text = createScenarioTextElement();

    expect(
      isScenarioSlideV3({
        ...slide,
        canvas: { ...slide.canvas, width: SCENARIO_V3_LIMITS.maxCanvasDimension + 1 },
      })
    ).toBe(false);
    expect(
      isScenarioSlideV3({
        ...slide,
        elements: Array.from({ length: SCENARIO_V3_LIMITS.maxElementsPerSlide + 1 }, () => text),
      })
    ).toBe(false);
    expect(isScenarioSlideV3({ ...slide, clicks: { count: -1, initialIndex: 0 } })).toBe(false);
    expect(isScenarioSlideV3({ ...slide, elements: [{ ...text, opacity: 2 }] })).toBe(false);
    expect(
      isScenarioSlideV3({
        ...slide,
        elements: [{ ...text, text: 'x'.repeat(SCENARIO_V3_LIMITS.maxTextLength + 1) }],
      })
    ).toBe(false);
  });
});

describe('scenario v3 source import boundaries', () => {
  it('rejects malformed capture sources before rendering', () => {
    const slide = createScenarioSlide();
    const captureSource = createCaptureSource();

    expect(isScenarioSlideV3({ ...slide, source: captureSource })).toBe(true);
    expect(isScenarioSlideV3({ ...slide, source: { ...captureSource, assetId: '' } })).toBe(false);
    expect(
      isScenarioSlideV3({
        ...slide,
        source: { ...captureSource, page: { ...captureSource.page, devicePixelRatio: 20 } },
      })
    ).toBe(false);
  });
});

describe('scenario v3 canvas import boundaries', () => {
  it('rejects malformed canvas backgrounds before rendering', () => {
    const slide = createScenarioSlide();

    expect(
      isScenarioSlideV3({
        ...slide,
        canvas: { ...slide.canvas, background: { kind: 'transparent', color: '#fff' } },
      })
    ).toBe(false);
    expect(
      isScenarioSlideV3({
        ...slide,
        canvas: {
          ...slide.canvas,
          background: { color: 'x'.repeat(SCENARIO_V3_LIMITS.maxColorLength + 1), kind: 'solid' },
        },
      })
    ).toBe(false);
    expect(
      isScenarioSlideV3({
        ...slide,
        canvas: {
          ...slide.canvas,
          background: { color: 'url(https://tracker.test/paint.svg#x)', kind: 'solid' },
        },
      })
    ).toBe(false);
    expect(
      isScenarioSlideV3({
        ...slide,
        canvas: {
          ...slide.canvas,
          background: { color: 'u\\72l(https://tracker.test/paint.svg#x)', kind: 'solid' },
        },
      })
    ).toBe(false);
  });
});

it('validates scenario v3 element color tokens before rendering', () => {
  const slide = createScenarioSlide();

  expect(
    isScenarioSlideV3({
      ...slide,
      elements: [
        createScenarioTextElement({
          style: { align: 'left', color: 'hsl(210, 50%, 40%)', fontSize: 24, fontWeight: 700 },
        }),
        createScenarioShapeElement({
          fillColor: 'rgba(15,143,138,0.12)',
          strokeColor: '#0f8f8a',
        }),
      ],
    })
  ).toBe(true);
  expect(
    isScenarioSlideV3({
      ...slide,
      elements: [
        createScenarioTextElement({
          style: {
            align: 'left',
            color: 'url(https://tracker.test/paint.svg#x)',
            fontSize: 24,
            fontWeight: 700,
          },
        }),
      ],
    })
  ).toBe(false);
  expect(
    isScenarioSlideV3({
      ...slide,
      elements: [createScenarioShapeElement({ fillColor: 'u\\72l(#paint)' })],
    })
  ).toBe(false);
});

it('accepts scenario v3 code, callout, and connector color tokens before rendering', () => {
  const slide = createScenarioSlide();

  expect(
    isScenarioSlideV3({
      ...slide,
      elements: [
        createScenarioCodeElement({
          style: { backgroundColor: 'rgb(10 20 30 / 40%)', fontSize: 24, textColor: '#f6ead9' },
        }),
        createScenarioCalloutElement({
          panel: {
            backgroundColor: '#fff8ed',
            borderColor: '#d6a15b',
            borderWidth: 1,
            textColor: 'transparent',
          },
        }),
        createScenarioLineElement({ strokeColor: 'hsl(210, 50%, 40%)' }),
      ],
    })
  ).toBe(true);
});

it('rejects unsafe scenario v3 code, callout, and connector color tokens before rendering', () => {
  const slide = createScenarioSlide();

  expect(
    isScenarioSlideV3({
      ...slide,
      elements: [
        createScenarioCodeElement({
          style: { backgroundColor: 'url(#paint)', fontSize: 24, textColor: '#f6ead9' },
        }),
      ],
    })
  ).toBe(false);
  expect(
    isScenarioSlideV3({
      ...slide,
      elements: [
        createScenarioCalloutElement({
          panel: {
            backgroundColor: '#fff8ed',
            borderColor: 'u\\72l(#paint)',
            borderWidth: 1,
            textColor: '#2f2a24',
          },
        }),
      ],
    })
  ).toBe(false);
  expect(
    isScenarioSlideV3({
      ...slide,
      elements: [createScenarioLineElement({ strokeColor: 'data:text/html;base64,abc' })],
    })
  ).toBe(false);
});

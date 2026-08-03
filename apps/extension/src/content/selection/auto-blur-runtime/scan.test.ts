// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTO_BLUR_CATEGORIES,
  type AutoBlurDetection,
  type AutoBlurDetector,
} from '../../../features/highlighter/contracts/auto-blur';
import { type FrameData } from '../../../features/highlighter/contracts';
import type { AutoBlurTextSource } from './types';

const visibleTextMocks = vi.hoisted(() => ({
  collectVisibleAutoBlurTextSources: vi.fn(),
  getAutoBlurTextSourceRangeRects: vi.fn((source: AutoBlurTextSource) => source.rects),
}));
const fullPageMocks = vi.hoisted(() => ({
  visitAutoBlurPageViewports: vi.fn(),
}));

vi.mock('./visible-text', () => ({
  collectVisibleAutoBlurTextSources: visibleTextMocks.collectVisibleAutoBlurTextSources,
  getAutoBlurTextSourceRangeRects: visibleTextMocks.getAutoBlurTextSourceRangeRects,
}));

vi.mock('./full-page', () => ({
  visitAutoBlurPageViewports: fullPageMocks.visitAutoBlurPageViewports,
}));

import { scanAutoBlurTargets } from './scan';

function createSource(text: string): AutoBlurTextSource {
  const element = document.createElement('span');
  const textNode = document.createTextNode(text);
  element.appendChild(textNode);
  return {
    element,
    rootOffset: { x: 0, y: 0 },
    rects: [{ height: 16, width: 120, x: 10, y: 20 }],
    text,
    textNode,
  };
}

function createDetection(
  source: AutoBlurTextSource,
  overrides: Partial<AutoBlurDetection>
): AutoBlurDetection {
  return {
    category: AUTO_BLUR_CATEGORIES.email,
    confidence: 0.7,
    end: 16,
    source,
    start: 0,
    value: 'john@example.com',
    ...overrides,
  };
}

function createDetector(detections: AutoBlurDetection[]): AutoBlurDetector {
  return {
    detect: vi.fn(() => detections),
  };
}

describe('scanAutoBlurTargets', () => {
  beforeEach(() => {
    visibleTextMocks.collectVisibleAutoBlurTextSources.mockReset();
    visibleTextMocks.getAutoBlurTextSourceRangeRects.mockReset();
    visibleTextMocks.getAutoBlurTextSourceRangeRects.mockImplementation(
      (source: AutoBlurTextSource) => source.rects
    );
    fullPageMocks.visitAutoBlurPageViewports.mockReset();
  });

  it('dedupes overlapping detections, keeps raw values, and marks existing blur frames', async () => {
    const source = createSource('john@example.com');
    visibleTextMocks.collectVisibleAutoBlurTextSources.mockReturnValue([source]);
    const detector = createDetector([
      createDetection(source, { confidence: 0.7, value: 'john@example.com' }),
      createDetection(source, {
        category: AUTO_BLUR_CATEGORIES.urlOrLogin,
        confidence: 0.9,
        end: 8,
        value: 'https://a.io/path',
      }),
    ]);
    const existingBlurFrame: FrameData = {
      effectMode: 'blur',
      height: 18,
      id: 'frame-1',
      width: 122,
      x: 9,
      y: 19,
    };

    const result = await scanAutoBlurTargets({ frames: [existingBlurFrame] }, detector);

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({
      alreadyBlurred: true,
      category: AUTO_BLUR_CATEGORIES.urlOrLogin,
      value: 'https://a.io/path',
    });
    expect(visibleTextMocks.getAutoBlurTextSourceRangeRects).toHaveBeenCalledWith(source, 0, 8);
  });

  it('uses the complete multiline range instead of only its first rectangle', async () => {
    const source = createSource('john@example.com');
    visibleTextMocks.collectVisibleAutoBlurTextSources.mockReturnValue([source]);
    visibleTextMocks.getAutoBlurTextSourceRangeRects.mockReturnValue([
      { height: 16, width: 80, x: 10, y: 2400 },
      { height: 16, width: 40, x: 10, y: 2420 },
    ]);

    const result = await scanAutoBlurTargets(
      { frames: [] },
      createDetector([createDetection(source, {})])
    );

    expect(result.matches[0]?.rect).toEqual({ height: 36, width: 80, x: 10, y: 2400 });
  });

  it('collects every full-page viewport and normalizes matches to the original scroll', async () => {
    const firstSource = createSource('first@example.com');
    const secondSource = createSource('second@example.com');
    visibleTextMocks.collectVisibleAutoBlurTextSources
      .mockReturnValueOnce([firstSource])
      .mockReturnValueOnce([secondSource]);
    fullPageMocks.visitAutoBlurPageViewports.mockImplementation(async (visit) => {
      visit({ x: 0, y: 0 });
      visit({ x: 0, y: 1_000 });
    });
    const detector: AutoBlurDetector = {
      detect: vi.fn(({ sources }) =>
        sources.map((source: AutoBlurTextSource) =>
          createDetection(source, {
            end: source.text.length,
            value: source.text,
          })
        )
      ),
    };

    const result = await scanAutoBlurTargets({ frames: [], mode: 'full-page' }, detector);

    expect(result.matches.map((match) => match.rect.y)).toEqual([20, 1_020]);
    expect(result.matches.map((match) => match.value)).toEqual([
      'first@example.com',
      'second@example.com',
    ]);
  });

  it('keeps fixed target geometry from the original scroll viewport', async () => {
    const source = createSource('fixed@example.com');
    source.element.style.position = 'fixed';
    visibleTextMocks.collectVisibleAutoBlurTextSources.mockReturnValue([source]);
    visibleTextMocks.getAutoBlurTextSourceRangeRects.mockReturnValue([
      { height: 16, width: 120, x: 10, y: 20 },
    ]);
    fullPageMocks.visitAutoBlurPageViewports.mockImplementation(async (visit) => {
      visit({ x: 0, y: 0 });
      visit({ x: 0, y: -500 });
    });
    const detector = createDetector([createDetection(source, { value: 'fixed@example.com' })]);

    const result = await scanAutoBlurTargets({ frames: [], mode: 'full-page' }, detector);

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.rect.y).toBe(20);
  });
});

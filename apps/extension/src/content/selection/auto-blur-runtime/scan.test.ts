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

vi.mock('./visible-text', () => ({
  collectVisibleAutoBlurTextSources: visibleTextMocks.collectVisibleAutoBlurTextSources,
  getAutoBlurTextSourceRangeRects: visibleTextMocks.getAutoBlurTextSourceRangeRects,
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
    visibleTextMocks.getAutoBlurTextSourceRangeRects.mockClear();
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
});

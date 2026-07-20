// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { collectVisibleAutoBlurTextSources, getAutoBlurTextSourceRangeRects } from './visible-text';

let originalGetClientRects: typeof Range.prototype.getClientRects | undefined;

function createRect(overrides: Partial<DOMRect> = {}): DOMRect {
  return {
    bottom: 30,
    height: 20,
    left: 10,
    right: 70,
    toJSON: () => ({}),
    top: 10,
    width: 60,
    x: 10,
    y: 10,
    ...overrides,
  };
}

function createRectList(rect: DOMRect): DOMRectList {
  return {
    0: rect,
    [Symbol.iterator]: () => [rect][Symbol.iterator](),
    length: 1,
    item: (index) => (index === 0 ? rect : null),
  };
}

describe('collectVisibleAutoBlurTextSources collection', () => {
  beforeEach(() => {
    originalGetClientRects = Range.prototype.getClientRects;
    Object.defineProperty(Range.prototype, 'getClientRects', {
      configurable: true,
      value: vi.fn(() => createRectList(createRect())),
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    if (originalGetClientRects) {
      Object.defineProperty(Range.prototype, 'getClientRects', {
        configurable: true,
        value: originalGetClientRects,
      });
    } else {
      delete (Range.prototype as Partial<Range>).getClientRects;
    }
  });

  it('collects only rendered page text and skips extension UI or hidden nodes', () => {
    document.body.innerHTML = [
      '<main>',
      '<span>visible john@example.com</span>',
      '<span style="display: none">hidden secret@example.com</span>',
      '<div data-ui="content.toolbar.mock">extension secret@example.com</div>',
      '<script>script secret@example.com</script>',
      '</main>',
    ].join('');

    const sources = collectVisibleAutoBlurTextSources();

    expect(sources.map((source) => source.text.trim())).toEqual(['visible john@example.com']);
    expect(sources[0]?.rects).toEqual([{ height: 20, width: 60, x: 10, y: 10 }]);
    expect(sources[0]?.textNode.textContent).toBe('visible john@example.com');
  });
});

describe('collectVisibleAutoBlurTextSources range rects', () => {
  beforeEach(() => {
    originalGetClientRects = Range.prototype.getClientRects;
    Object.defineProperty(Range.prototype, 'getClientRects', {
      configurable: true,
      value: vi.fn(() => createRectList(createRect())),
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    if (originalGetClientRects) {
      Object.defineProperty(Range.prototype, 'getClientRects', {
        configurable: true,
        value: originalGetClientRects,
      });
    } else {
      delete (Range.prototype as Partial<Range>).getClientRects;
    }
  });

  it('creates match rectangles from the detected substring range', () => {
    document.body.innerHTML = '<main><span>visible john@example.com</span></main>';
    const sources = collectVisibleAutoBlurTextSources();
    const setStartSpy = vi.spyOn(Range.prototype, 'setStart');
    const setEndSpy = vi.spyOn(Range.prototype, 'setEnd');

    const rects = getAutoBlurTextSourceRangeRects(sources[0]!, 8, 24);

    expect(rects).toEqual([{ height: 20, width: 60, x: 10, y: 10 }]);
    expect(setStartSpy).toHaveBeenCalledWith(sources[0]?.textNode, 8);
    expect(setEndSpy).toHaveBeenCalledWith(sources[0]?.textNode, 24);
  });
});

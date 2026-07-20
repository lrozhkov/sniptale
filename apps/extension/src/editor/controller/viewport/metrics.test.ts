// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import {
  buildEditorViewportState,
  getEditorStageInsets,
  getEditorViewportMetrics,
} from './metrics';

function createViewport() {
  const viewportElement = document.createElement('div');
  Object.defineProperties(viewportElement, {
    clientHeight: { configurable: true, value: 240 },
    clientWidth: { configurable: true, value: 320 },
    scrollLeft: { configurable: true, value: 12 },
    scrollTop: { configurable: true, value: 16 },
  });
  return viewportElement;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

it('covers viewport metric fallbacks for stage, viewport, and absent elements', () => {
  const viewportElement = createViewport();
  const stageElement = document.createElement('div');
  Object.defineProperties(stageElement, {
    scrollHeight: { configurable: true, value: 500 },
    scrollWidth: { configurable: true, value: 600 },
  });
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({
    paddingBottom: 'bad',
    paddingLeft: '8px',
    paddingRight: '',
    paddingTop: '12px',
  } as CSSStyleDeclaration);

  expect(getEditorStageInsets(stageElement, viewportElement)).toEqual({
    horizontal: 8,
    vertical: 12,
  });
  expect(getEditorStageInsets(null, viewportElement)).toEqual({ horizontal: 8, vertical: 12 });
  expect(getEditorStageInsets(null, null)).toEqual({ horizontal: 0, vertical: 0 });
  expect(
    getEditorViewportMetrics({
      viewportElement,
      stageElement,
      canvasDocumentSize: { width: 160, height: 120 },
      zoomLevel: 1.25,
    })
  ).toEqual(expect.objectContaining({ canvasOffsetLeft: 200, canvasOffsetTop: 175 }));
  expect(
    getEditorViewportMetrics({
      viewportElement,
      stageElement: {} as HTMLElement,
      canvasDocumentSize: { width: 160, height: 120 },
      zoomLevel: 1,
    })
  ).toEqual(expect.objectContaining({ canvasOffsetLeft: 80, canvasOffsetTop: 60 }));
});

it('covers viewport state source and empty-source branches', () => {
  const viewportElement = createViewport();
  const stateWithSource = buildEditorViewportState({
    viewportElement,
    stageElement: null,
    canvasDocumentSize: { width: 160, height: 120 },
    zoomLevel: 1,
    source: { displayHeight: 120, displayWidth: 160, name: 'image.png' } as never,
  });
  const stateWithoutSource = buildEditorViewportState({
    viewportElement,
    stageElement: null,
    canvasDocumentSize: { width: 160, height: 120 },
    zoomLevel: 1,
    source: {} as never,
  });

  expect(stateWithSource.sourceName).toBe('image.png');
  expect(stateWithSource.scrollLeft).toBe(12);
  expect(stateWithoutSource.sourceName).toBeNull();
  expect(stateWithoutSource.sourceWidth).toBe(0);
});

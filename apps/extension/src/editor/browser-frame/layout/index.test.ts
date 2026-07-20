import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../../features/editor/document/constants';
import type {
  BrowserFrameState,
  EditorFrameSettings,
} from '../../../features/editor/document/types';
import { BROWSER_HEADER_HEIGHT } from '../../document/model';
import {
  getBrowserHeaderHeight,
  resolveEditorSceneLayout,
  shouldFitSourceToContent,
  shouldPreserveCanvasForBrowserFrame,
} from './';

function createFrame(overrides: Partial<EditorFrameSettings> = {}): EditorFrameSettings {
  return {
    ...DEFAULT_EDITOR_FRAME_SETTINGS,
    paddingTop: 10,
    paddingRight: 20,
    paddingBottom: 30,
    paddingLeft: 40,
    ...overrides,
  };
}

function createBrowserFrame(overrides: Partial<BrowserFrameState> = {}): BrowserFrameState {
  return {
    ...DEFAULT_BROWSER_FRAME_STATE,
    ...overrides,
  };
}

function expectBrowserHeaderHeightModes() {
  expect(getBrowserHeaderHeight(false)).toBe(0);
  expect(getBrowserHeaderHeight(true)).toBe(BROWSER_HEADER_HEIGHT);
  expect(getBrowserHeaderHeight({ enabled: false })).toBe(0);
  expect(getBrowserHeaderHeight({ enabled: true })).toBe(BROWSER_HEADER_HEIGHT);
}

function expectBrowserFramePreserveCanvasModes() {
  expect(
    shouldPreserveCanvasForBrowserFrame(
      createFrame({ layoutMode: 'expand-canvas' }),
      createBrowserFrame({ enabled: false })
    )
  ).toBe(false);
  expect(
    shouldPreserveCanvasForBrowserFrame(
      createFrame({ layoutMode: 'fit-image' }),
      createBrowserFrame({ enabled: false })
    )
  ).toBe(true);
  expect(
    shouldPreserveCanvasForBrowserFrame(
      createFrame({ layoutMode: 'expand-canvas' }),
      createBrowserFrame({ enabled: true, canvasMode: 'keep-size' })
    )
  ).toBe(true);
}

function expectBrowserFrameFitSourceModes() {
  expect(
    shouldFitSourceToContent(
      createFrame({ layoutMode: 'expand-canvas' }),
      createBrowserFrame({ enabled: false })
    )
  ).toBe(false);
  expect(
    shouldFitSourceToContent(
      createFrame({ layoutMode: 'fit-image' }),
      createBrowserFrame({ enabled: false })
    )
  ).toBe(true);
  expect(
    shouldFitSourceToContent(
      createFrame({ layoutMode: 'expand-canvas' }),
      createBrowserFrame({ enabled: true, contentMode: 'fit-content' })
    )
  ).toBe(true);
}

describe('browser frame layout mode helpers', () => {
  it('derives browser header, preserve-canvas, and fit-source modes from frame and browser settings', () => {
    expectBrowserHeaderHeightModes();
    expectBrowserFramePreserveCanvasModes();
    expectBrowserFrameFitSourceModes();
  });
});

describe('browser frame scene layout', () => {
  it('keeps a plain source layout when browser frame is disabled', () => {
    const layout = resolveEditorSceneLayout({
      frame: createFrame(),
      browserFrame: createBrowserFrame(),
      source: { width: 200, height: 100 },
      hasBrowserFrame: false,
      preserveCanvasSize: false,
      fitSourceToContent: false,
    });

    expect(layout).toEqual({
      canvas: { width: 260, height: 140 },
      content: { left: 40, top: 10, width: 200, height: 100 },
      source: { left: 40, top: 10, width: 200, height: 100 },
      header: null,
    });
  });
});

describe('browser frame scene layout with headers and preserved canvases', () => {
  it('adds browser header space and keeps the source pinned below it in resize mode', () => {
    const layout = resolveEditorSceneLayout({
      frame: createFrame(),
      browserFrame: createBrowserFrame({
        canvasMode: 'resize',
        contentMode: 'push-down',
      }),
      hasBrowserFrame: true,
      source: { width: 200, height: 100 },
      preserveCanvasSize: false,
      fitSourceToContent: false,
    });

    expect(layout.canvas).toEqual({ width: 260, height: 226 });
    expect(layout.content).toEqual({ left: 40, top: 96, width: 200, height: 100 });
    expect(layout.source).toEqual({ left: 40, top: 96, width: 200, height: 100 });
    expect(layout.header).toEqual({ left: 40, top: 10, width: 200, height: 86 });
  });

  it('fits and centers the source inside a preserved canvas without a browser frame', () => {
    const layout = resolveEditorSceneLayout({
      frame: createFrame(),
      browserFrame: createBrowserFrame(),
      source: { width: 200, height: 100 },
      canvas: { width: 500, height: 400 },
      hasBrowserFrame: false,
      preserveCanvasSize: true,
      fitSourceToContent: true,
    });

    expect(layout.canvas).toEqual({ width: 500, height: 400 });
    expect(layout.content).toEqual({ left: 40, top: 10, width: 440, height: 360 });
    expect(layout.source).toEqual({ left: 40, top: 80, width: 440, height: 220 });
    expect(layout.header).toBeNull();
  });
});

it('fits the source to preserved browser content while keeping it aligned to the header edge', () => {
  const layout = resolveEditorSceneLayout({
    frame: createFrame(),
    browserFrame: createBrowserFrame({
      canvasMode: 'resize',
      contentMode: 'fit-content',
    }),
    source: { width: 200, height: 100 },
    canvas: { width: 500, height: 400 },
    hasBrowserFrame: true,
    preserveCanvasSize: true,
    fitSourceToContent: true,
  });

  expect(layout.canvas).toEqual({ width: 500, height: 400 });
  expect(layout.content).toEqual({ left: 40, top: 96, width: 440, height: 274 });
  expect(layout.source).toEqual({ left: 40, top: 96, width: 440, height: 220 });
  expect(layout.header).toEqual({ left: 40, top: 10, width: 440, height: 86 });
});

describe('browser frame minimum-size edge cases', () => {
  it('keeps the canvas size in browser keep-size mode without reserving extra header space', () => {
    const layout = resolveEditorSceneLayout({
      frame: createFrame(),
      browserFrame: createBrowserFrame({
        canvasMode: 'keep-size',
        contentMode: 'push-down',
      }),
      hasBrowserFrame: true,
      source: { width: 200, height: 100 },
      preserveCanvasSize: false,
      fitSourceToContent: false,
    });

    expect(layout.canvas).toEqual({ width: 260, height: 140 });
    expect(layout.content).toEqual({ left: 40, top: 96, width: 200, height: 14 });
    expect(layout.source).toEqual({ left: 40, top: 96, width: 200, height: 100 });
    expect(layout.header).toEqual({ left: 40, top: 10, width: 200, height: 86 });
  });

  it('normalizes tiny source dimensions to the minimum canvas size', () => {
    const layout = resolveEditorSceneLayout({
      frame: createFrame({
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
      }),
      browserFrame: createBrowserFrame(),
      source: { width: 0, height: 0 },
      hasBrowserFrame: false,
      preserveCanvasSize: false,
      fitSourceToContent: false,
    });

    expect(layout.canvas).toEqual({ width: 1, height: 1 });
    expect(layout.content).toEqual({ left: 0, top: 0, width: 1, height: 1 });
    expect(layout.source).toEqual({ left: 0, top: 0, width: 1, height: 1 });
  });
});

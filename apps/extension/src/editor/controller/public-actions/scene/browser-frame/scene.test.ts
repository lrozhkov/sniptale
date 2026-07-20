import { expect, it } from 'vitest';
import {
  hasBrowserFrameSourceSizeChange,
  resolveBrowserFrameRelayoutOptions,
  resolveBrowserFrameScene,
  resolveNextBrowserFramePosition,
  resolveNextBrowserFrameWidth,
} from './layout';

const currentSource = {
  displayHeight: 480,
  displayWidth: 640,
  left: 20,
  top: 50,
};

it('resolves browser-frame source deltas into layer position', () => {
  expect(
    resolveNextBrowserFramePosition({
      currentSource: currentSource as never,
      existingLayer: null,
      nextSource: { left: 30, top: 100 },
    })
  ).toEqual({ left: 30, top: 14 });

  expect(
    resolveNextBrowserFramePosition({
      currentSource: currentSource as never,
      existingLayer: { left: 100, top: 80 } as never,
      nextSource: { left: 35, top: 75 },
    })
  ).toEqual({ left: 115, top: 105 });

  expect(
    resolveNextBrowserFramePosition({
      currentSource: currentSource as never,
      existingLayer: {} as never,
      nextSource: { left: 35, top: 75 },
    })
  ).toEqual({ left: 35, top: 25 });
});

it('resolves browser-frame size changes into layer width', () => {
  expect(
    hasBrowserFrameSourceSizeChange({
      currentSource: currentSource as never,
      nextSource: { height: 480, width: 800 },
    })
  ).toBe(true);
  expect(
    hasBrowserFrameSourceSizeChange({
      currentSource: currentSource as never,
      nextSource: { height: 480, width: 640 },
    })
  ).toBe(false);
  expect(
    resolveNextBrowserFrameWidth({
      currentSource: currentSource as never,
      existingLayer: null,
      nextSource: { height: 720, width: 1280 },
    })
  ).toBe(1280);
  expect(
    resolveNextBrowserFrameWidth({
      currentSource: currentSource as never,
      existingLayer: { getScaledWidth: () => 700 } as never,
      nextSource: { height: 480, width: 640 },
    })
  ).toBe(700);
});

it('maps browser-frame modes to relayout options', () => {
  expect(
    resolveBrowserFrameRelayoutOptions({
      canvasMode: 'keep-size',
      contentMode: 'fit-content',
    } as never)
  ).toEqual({
    fitSourceToContent: true,
    hasBrowserFrame: true,
    preserveCanvasSize: true,
  });

  expect(
    resolveBrowserFrameRelayoutOptions({
      canvasMode: 'resize',
      contentMode: 'push-down',
    } as never)
  ).toEqual({
    fitSourceToContent: false,
    hasBrowserFrame: true,
    preserveCanvasSize: false,
  });
});

it('resolves browser-frame scene layout with default relayout flags', () => {
  const scene = resolveBrowserFrameScene({
    browserFrame: {
      canvasMode: 'resize',
      contentMode: 'push-down',
    } as never,
    currentSource: currentSource as never,
    options: {
      canvasDocumentSize: { height: 600, width: 800 },
      store: {
        getFrame: () => ({ layoutMode: 'fit-image' }),
      },
    } as never,
    relayoutOptions: {},
  });

  expect(scene.source.width).toBeGreaterThan(0);
  expect(scene.source.height).toBeGreaterThan(0);
});

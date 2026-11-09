import { expect, it } from 'vitest';
import { resolveBrowserFrameScene, resolveNextBrowserFramePosition } from './layout';

const currentSource = {
  dataUrl: 'data:image/png;base64,source',
  displayHeight: 480,
  displayWidth: 640,
  id: 'source-1',
  intrinsicHeight: 480,
  intrinsicWidth: 640,
  left: 20,
  locked: false,
  name: null,
  top: 50,
  visible: true,
};

it('resolves browser-frame source deltas into layer position', () => {
  expect(
    resolveNextBrowserFramePosition({
      currentSource,
      existingLayer: null,
      nextSource: { left: 30, top: 100 },
    })
  ).toEqual({ left: 30, top: 100 - (86 * 480) / 900 });

  expect(
    resolveNextBrowserFramePosition({
      currentSource,
      existingLayer: { left: 100, top: 80 } as never,
      nextSource: { left: 35, top: 75 },
    })
  ).toEqual({ left: 35, top: 75 - (86 * 480) / 900 });

  expect(
    resolveNextBrowserFramePosition({
      currentSource,
      existingLayer: {} as never,
      nextSource: { left: 35, top: 75 },
    })
  ).toEqual({ left: 35, top: 75 - (86 * 480) / 900 });
});

it('resolves browser-frame scene layout with default relayout flags', () => {
  const scene = resolveBrowserFrameScene({
    browserFrame: {
      canvasMode: 'resize',
      contentMode: 'push-down',
    } as never,
    currentSource,
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

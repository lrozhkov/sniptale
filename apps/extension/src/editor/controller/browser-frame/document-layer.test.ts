import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createBrowserFrameLayerObjectMock: vi.fn(),
}));

vi.mock('../../objects/browser-frame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/browser-frame')>()),
  createBrowserFrameLayerObject: mocks.createBrowserFrameLayerObjectMock,
}));

import { prepareBrowserFrameLayerReplacement, replaceBrowserFrameLayer } from './document-layer';

function createCanvas(previous: unknown) {
  return {
    add: vi.fn(),
    getActiveObjects: vi.fn(() => [previous]),
    getObjects: vi.fn(() => [previous]),
    moveObjectTo: vi.fn(),
    remove: vi.fn(),
    setActiveObject: vi.fn(),
  };
}

it('replaces browser-frame layer at the existing stack index and preserves active state', () => {
  const previous = { id: 'previous' };
  const next = { id: 'next' };
  const canvas = createCanvas(previous);

  replaceBrowserFrameLayer(canvas as never, previous as never, next as never);

  expect(canvas.remove).toHaveBeenCalledWith(previous);
  expect(canvas.add).toHaveBeenCalledWith(next);
  expect(canvas.moveObjectTo).toHaveBeenCalledWith(next, 0);
  expect(canvas.setActiveObject).toHaveBeenCalledWith(next);
});

it('prepares replacement browser-frame metadata from the previous header', async () => {
  const header = {
    getScaledWidth: vi.fn(() => 320),
    sniptaleId: 'browser-frame-1',
    sniptaleLabel: 'Browser Header 1',
    sniptaleLocked: true,
    visible: false,
  };
  const nextHeader: Record<string, unknown> = {};
  mocks.createBrowserFrameLayerObjectMock.mockImplementation(async (options) => {
    options.prepareObject(nextHeader);
    return nextHeader;
  });

  await prepareBrowserFrameLayerReplacement({
    browserFrame: { enabled: true } as never,
    header: header as never,
    nextSource: { left: 40, top: 60 } as never,
  });

  expect(mocks.createBrowserFrameLayerObjectMock).toHaveBeenCalledWith(
    expect.objectContaining({ left: 40, top: 60, width: 320 })
  );
  expect(nextHeader).toMatchObject({
    sniptaleId: 'browser-frame-1',
    sniptaleLabel: 'Browser Header 1',
    sniptaleLocked: true,
    visible: false,
  });
});

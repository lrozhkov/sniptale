import { beforeEach, expect, it, vi } from 'vitest';
import { updateUserObjectLayout } from './scene-object-layout';

const mocks = vi.hoisted(() => ({
  isUserObject: vi.fn((object: { kind?: string }) => object.kind === 'user'),
}));

vi.mock('../../document/model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../document/model')>()),
  isUserObject: mocks.isUserObject,
}));

function createSourceState() {
  return {
    displayHeight: 50,
    displayWidth: 100,
    left: 10,
    top: 20,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('rescales user objects relative to the resolved source layout', () => {
  const userObject = {
    kind: 'user',
    left: 20,
    scaleX: 1,
    scaleY: 1,
    set: vi.fn(),
    setCoords: vi.fn(),
    top: 30,
  };

  updateUserObjectLayout({
    canvas: { getObjects: () => [userObject] } as never,
    currentSource: createSourceState() as never,
    layoutSource: { height: 100, left: 40, top: 60, width: 200 },
    sourceSizeChanged: true,
  });

  expect(userObject.set).toHaveBeenCalledWith({
    left: 60,
    scaleX: 2,
    scaleY: 2,
    top: 80,
  });
  expect(userObject.setCoords).toHaveBeenCalledOnce();
});

it('keeps browser-frame offsets while resolving source-size scale', () => {
  const browserFrame = {
    getScaledHeight: vi.fn(() => 86),
    getScaledWidth: vi.fn(() => 160),
    height: 86,
    kind: 'user',
    left: 18,
    sniptaleType: 'browser-frame',
    set: vi.fn(),
    setCoords: vi.fn(),
    top: 12,
    width: 160,
  };

  updateUserObjectLayout({
    canvas: { getObjects: () => [browserFrame] } as never,
    currentSource: createSourceState() as never,
    layoutSource: { height: 100, left: 40, top: 60, width: 200 },
    sourceSizeChanged: true,
  });

  expect(browserFrame.set).toHaveBeenCalledWith(
    expect.objectContaining({
      left: 48,
      scaleX: 1.25,
      top: 52,
    })
  );
  expect(browserFrame.setCoords).toHaveBeenCalledOnce();
});

it('keeps existing browser-frame scale when only source position changes', () => {
  const browserFrame = {
    getScaledHeight: vi.fn(() => 86),
    getScaledWidth: vi.fn(() => 160),
    height: 86,
    kind: 'user',
    left: 18,
    sniptaleType: 'browser-frame',
    set: vi.fn(),
    setCoords: vi.fn(),
    top: 12,
    width: 160,
  };

  updateUserObjectLayout({
    canvas: { getObjects: () => [browserFrame] } as never,
    currentSource: createSourceState() as never,
    layoutSource: { height: 100, left: 40, top: 60, width: 200 },
    sourceSizeChanged: false,
  });

  expect(browserFrame.set).toHaveBeenCalledWith(
    expect.objectContaining({
      scaleX: 1,
      scaleY: 1,
    })
  );
});

it('ignores non-user and managed background objects', () => {
  const nonUserObject = { kind: 'frame', set: vi.fn(), setCoords: vi.fn() };
  const backgroundObject = {
    kind: 'user',
    sniptaleRole: 'background',
    sniptaleType: 'background',
    set: vi.fn(),
    setCoords: vi.fn(),
  };

  updateUserObjectLayout({
    canvas: { getObjects: () => [nonUserObject, backgroundObject] } as never,
    currentSource: createSourceState() as never,
    layoutSource: { height: 100, left: 40, top: 60, width: 200 },
    sourceSizeChanged: true,
  });

  expect(nonUserObject.set).not.toHaveBeenCalled();
  expect(backgroundObject.set).not.toHaveBeenCalled();
});

it('uses safe geometry fallbacks for sparse user and browser-frame objects', () => {
  const sparseUserObject = {
    kind: 'user',
    left: 10,
    set: vi.fn(),
    setCoords: vi.fn(),
    top: 20,
  };
  const sparseBrowserFrame = {
    getScaledHeight: vi.fn(() => undefined),
    getScaledWidth: vi.fn(() => undefined),
    kind: 'user',
    sniptaleType: 'browser-frame',
    set: vi.fn(),
    setCoords: vi.fn(),
  };

  updateUserObjectLayout({
    canvas: { getObjects: () => [sparseUserObject, sparseBrowserFrame] } as never,
    currentSource: { ...createSourceState(), displayHeight: 0, displayWidth: 0 } as never,
    layoutSource: { height: 100, left: 40, top: 60, width: 200 },
    sourceSizeChanged: true,
  });

  expect(sparseUserObject.set).toHaveBeenCalledWith(
    expect.objectContaining({
      scaleX: 200,
      scaleY: 100,
    })
  );
  expect(sparseBrowserFrame.set).toHaveBeenCalledWith(
    expect.objectContaining({
      scaleX: 1,
      scaleY: 1,
    })
  );
});

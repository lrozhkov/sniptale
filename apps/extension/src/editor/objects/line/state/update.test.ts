import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyLineControlStyle: vi.fn(),
  applyLinePathStyle: vi.fn(),
  buildLinePathData: vi.fn(() => [['M', 0, 0]]),
  resolveLineFill: vi.fn(() => 'resolved-fill'),
  shouldRenderRoughLine: vi.fn(() => false),
  syncLineMetadata: vi.fn(),
}));

vi.mock('fabric', () => ({
  Path: class Path {
    path: unknown;
    constructor(path: unknown) {
      this.path = path;
    }
  },
}));

vi.mock('../path', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../path')>()),
  buildLinePathData: mocks.buildLinePathData,
}));

vi.mock('../rough', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../rough')>()),
  shouldRenderRoughLine: mocks.shouldRenderRoughLine,
}));

vi.mock('./fill', () => ({
  resolveLineFill: mocks.resolveLineFill,
}));

vi.mock('./metadata', () => ({
  syncLineMetadata: mocks.syncLineMetadata,
}));

vi.mock('./style', () => ({
  applyLineControlStyle: mocks.applyLineControlStyle,
  applyLinePathStyle: mocks.applyLinePathStyle,
}));

import { updateLineObject } from './update';

it('updates line path, preserves translation, syncs metadata, and marks the object dirty', () => {
  const line = {
    left: 20,
    sniptaleLineClosed: false,
    pathOffset: { x: 5, y: 7 },
    set: vi.fn(),
    setCoords: vi.fn(),
    setDimensions: vi.fn(function setDimensions(this: { pathOffset: { x: number; y: number } }) {
      this.pathOffset = { x: 8, y: 9 };
    }),
    top: 30,
  };
  const settings = { color: '#111111' };
  const points = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
  ];

  updateLineObject(line as never, { closed: true, points, settings: settings as never });

  expect(mocks.buildLinePathData).toHaveBeenCalledWith(points, settings, true);
  expect(mocks.applyLinePathStyle).toHaveBeenCalled();
  expect(line.set).toHaveBeenCalledWith(
    expect.objectContaining({
      fill: 'resolved-fill',
      left: 23,
      top: 32,
    })
  );
  expect(mocks.syncLineMetadata).toHaveBeenCalledWith(line, settings, points, true);
  expect(line.set).toHaveBeenCalledWith('dirty', true);
  expect(line.setCoords).toHaveBeenCalledOnce();
});

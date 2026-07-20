import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyImageSettings: vi.fn(),
  getSourceObject: vi.fn(),
  isFrameObject: vi.fn(),
}));

vi.mock('../../objects/image-style', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/image-style')>()),
  applyImageSettings: mocks.applyImageSettings,
}));
vi.mock('../../document/model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../document/model')>()),
  isFrameObject: mocks.isFrameObject,
}));
vi.mock('../document/layers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../document/layers')>()),
  getSourceObject: mocks.getSourceObject,
}));

import { applyEditorFrameDecorations } from './frame-decoration-apply';

function createCanvas() {
  const existingFrame = { id: 'existing-frame', kind: 'frame' };
  return {
    add: vi.fn(),
    getObjects: vi.fn(() => [existingFrame, { id: 'annotation', kind: 'shape' }]),
    remove: vi.fn(),
    sendObjectToBack: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isFrameObject.mockImplementation((object: { kind?: string }) => object.kind === 'frame');
});

it('replaces frame decorations and applies source clip/style ownership', () => {
  const canvas = createCanvas();
  const sourceObject = {
    setCoords: vi.fn(),
  };
  const clipPath = { id: 'clip-path' };
  const nextFrame = { id: 'next-frame' };
  mocks.getSourceObject.mockReturnValue(sourceObject);

  expect(
    applyEditorFrameDecorations({
      canvas: canvas as never,
      frame: { sourceImage: { opacity: 0.6 } } as never,
      prepared: {
        browserFrameObjects: { objects: [], sourceClipPath: clipPath as never },
        frameObjects: [nextFrame as never],
      },
    })
  ).toBe(true);

  expect(canvas.remove).toHaveBeenCalledWith(expect.objectContaining({ id: 'existing-frame' }));
  expect(canvas.add).toHaveBeenCalledWith(nextFrame);
  expect(canvas.sendObjectToBack).toHaveBeenCalledWith(nextFrame);
  expect(nextFrame).toMatchObject({ sniptaleRole: 'frame' });
  expect(sourceObject).toMatchObject({ clipPath, dirty: true });
  expect(sourceObject.setCoords).toHaveBeenCalledOnce();
  expect(mocks.applyImageSettings).toHaveBeenCalledOnce();
});

it('keeps apply ownership bounded when canvas or source object is unavailable', () => {
  expect(
    applyEditorFrameDecorations({
      canvas: null,
      frame: {} as never,
      prepared: { browserFrameObjects: { objects: [], sourceClipPath: null }, frameObjects: [] },
    })
  ).toBe(false);

  const canvas = createCanvas();
  mocks.getSourceObject.mockReturnValue(null);

  expect(
    applyEditorFrameDecorations({
      canvas: canvas as never,
      frame: {} as never,
      prepared: {
        browserFrameObjects: { objects: [], sourceClipPath: null },
        frameObjects: [],
      },
    })
  ).toBe(true);
  expect(mocks.applyImageSettings).not.toHaveBeenCalled();
});

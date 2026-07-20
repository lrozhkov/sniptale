import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findObjectByIdMock: vi.fn(),
  isUserObjectMock: vi.fn(() => true),
}));

vi.mock('../../document/layers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../document/layers')>()),
  findObjectById: mocks.findObjectByIdMock,
}));

vi.mock('../../../document/model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../document/model')>()),
  isUserObject: mocks.isUserObjectMock,
}));

import { toggleLayerVisibility } from './visibility';

describe('layer action visibility state owner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isUserObjectMock.mockReturnValue(true);
  });

  it('hides user objects and discards hidden active objects', () => {
    const object = { sniptaleLocked: false, visible: true };
    const canvas = {
      discardActiveObject: vi.fn(),
      getActiveObject: vi.fn(() => object),
      requestRenderAll: vi.fn(),
    };
    mocks.findObjectByIdMock.mockReturnValue(object);

    expect(toggleLayerVisibility(canvas as never, 'layer-1')).toBe(object);

    expect(object.visible).toBe(false);
    expect(canvas.discardActiveObject).toHaveBeenCalledOnce();
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('keeps locked or non-user visibility immutable', () => {
    const object = { sniptaleLocked: true, visible: true };
    mocks.findObjectByIdMock.mockReturnValue(object);

    expect(toggleLayerVisibility({} as never, 'locked')).toBeNull();
    expect(object.visible).toBe(true);

    mocks.isUserObjectMock.mockReturnValue(false);
    mocks.findObjectByIdMock.mockReturnValue({ sniptaleLocked: false, visible: true });
    expect(toggleLayerVisibility({} as never, 'frame')).toBeNull();
  });
});

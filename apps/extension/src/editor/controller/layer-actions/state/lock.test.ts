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

import { toggleLayerLock } from './lock';

describe('layer action lock state owner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isUserObjectMock.mockReturnValue(true);
  });

  it('toggles lock state and reapplies object preparation', () => {
    const object = { sniptaleLocked: false };
    const canvas = { requestRenderAll: vi.fn() };
    const prepareObject = vi.fn();
    mocks.findObjectByIdMock.mockReturnValue(object);

    expect(toggleLayerLock(canvas as never, 'layer-1', prepareObject)).toBe(object);

    expect(object.sniptaleLocked).toBe(true);
    expect(prepareObject).toHaveBeenCalledWith(object);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('ignores non-user objects', () => {
    mocks.findObjectByIdMock.mockReturnValue({});
    mocks.isUserObjectMock.mockReturnValue(false);

    expect(toggleLayerLock({ requestRenderAll: vi.fn() } as never, 'frame', vi.fn())).toBeNull();
  });
});

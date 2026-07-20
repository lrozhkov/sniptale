// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  normalizeScaledRichShapeObjectMock: vi.fn(() => false),
}));

vi.mock('../../objects/rich-shape', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/rich-shape')>()),
  normalizeScaledRichShapeObject: mocks.normalizeScaledRichShapeObjectMock,
}));

import { createRuntimeEventHandlers } from './runtime';

function createBindings() {
  const canvas = { requestRenderAll: vi.fn() };
  return {
    commitHistory: vi.fn(),
    ensureObjectReachable: vi.fn(),
    getCanvas: vi.fn(() => canvas),
    getHistoryMuted: vi.fn(() => 0),
    getSource: vi.fn(() => null),
    setSource: vi.fn(),
    syncRuntimeState: vi.fn(),
  };
}

it('normalizes rich shapes after resize and keeps their controls length-oriented while scaling', () => {
  const bindings = createBindings();
  const handlers = createRuntimeEventHandlers(bindings as never);
  const modified = { sniptaleType: 'rich-shape', setCoords: vi.fn() };
  const scaling = { sniptaleType: 'rich-shape', setCoords: vi.fn() };

  mocks.normalizeScaledRichShapeObjectMock.mockReturnValueOnce(true);
  handlers.handleObjectModified({ target: modified } as never);
  handlers.handleObjectScaling({ target: scaling } as never);

  expect(modified.setCoords).toHaveBeenCalledOnce();
  expect(scaling.setCoords).toHaveBeenCalledOnce();
  expect(bindings.ensureObjectReachable).toHaveBeenCalledWith(modified);
  expect(bindings.ensureObjectReachable).toHaveBeenCalledWith(scaling);
  expect(bindings.commitHistory).toHaveBeenCalledOnce();
  expect(bindings.syncRuntimeState).toHaveBeenCalledOnce();
  expect(bindings.getCanvas().requestRenderAll).toHaveBeenCalledOnce();
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isArrowObject: vi.fn((_object: unknown) => false),
  isLineObject: vi.fn((_object: unknown) => false),
  setArrowEditMode: vi.fn(),
  setLineEditMode: vi.fn(),
}));

vi.mock('../../objects/arrow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/arrow')>()),
  isArrowObject: mocks.isArrowObject,
  setArrowEditMode: mocks.setArrowEditMode,
}));

vi.mock('../../objects/line', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/line')>()),
  isLineObject: mocks.isLineObject,
  setLineEditMode: mocks.setLineEditMode,
}));

import { createSelectionChangeHandler } from './runtime.selection';

describe('runtime selection handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('closes deselected arrow and line edit modes before syncing runtime state', () => {
    const syncRuntimeState = vi.fn();
    const arrow = { sniptaleArrowEditMode: true };
    const line = { sniptaleLineEditMode: true };
    mocks.isArrowObject.mockImplementation((object) => object === arrow);
    mocks.isLineObject.mockImplementation((object) => object === line);

    createSelectionChangeHandler({ syncRuntimeState })({
      deselected: [arrow as never, line as never],
    });

    expect(mocks.setArrowEditMode).toHaveBeenCalledWith(arrow, false);
    expect(mocks.setLineEditMode).toHaveBeenCalledWith(line, false);
    expect(syncRuntimeState).toHaveBeenCalledOnce();
  });
});

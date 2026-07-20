import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  updateTextCalloutHoverCursor: vi.fn(),
}));

vi.mock('./text-callout', async () => ({
  ...(await vi.importActual<typeof import('./text-callout')>('./text-callout')),
  updateTextCalloutHoverCursor: mocks.updateTextCalloutHoverCursor,
}));

import { createMouseMoveBeforeHandler } from './runtime.hover';

describe('runtime hover handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards pointer events to text-callout hover ownership when canvas exists', () => {
    const canvas = { id: 'canvas' };
    const target = { id: 'target' };
    const event = { e: { type: 'move' }, target } as never;

    createMouseMoveBeforeHandler({ getCanvas: () => canvas as never })(event);

    expect(mocks.updateTextCalloutHoverCursor).toHaveBeenCalledWith(canvas, event);
  });

  it('guards missing canvas', () => {
    createMouseMoveBeforeHandler({ getCanvas: () => null })({ e: {} } as never);

    expect(mocks.updateTextCalloutHoverCursor).not.toHaveBeenCalled();
  });
});

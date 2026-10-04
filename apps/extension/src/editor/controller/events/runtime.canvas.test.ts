import { describe, expect, it, vi } from 'vitest';
import { createBeforeRenderHandler } from './runtime.canvas';

describe('runtime canvas handler', () => {
  it('clears a live draft and its last frame without clearing on every object move', () => {
    const clearContext = vi.fn();
    const contextTop = { id: 'top-context', clearRect: vi.fn() };
    const mainContext = {} as CanvasRenderingContext2D;
    let draft = { object: { visible: false } };
    const handler = createBeforeRenderHandler({
      getCanvas: () =>
        ({
          clearContext,
          contextTop,
          getContext: () => mainContext,
          width: 2000,
          height: 1600,
        }) as never,
      getDrawSession: () => draft as never,
    });

    handler({ ctx: mainContext });
    expect(clearContext).toHaveBeenCalledWith(contextTop);
    draft = null as never;
    handler({ ctx: mainContext });
    expect(clearContext).toHaveBeenCalledTimes(1);
    expect(contextTop.clearRect).toHaveBeenCalledWith(0, 0, 2000, 1600);
    handler({ ctx: mainContext });
    expect(clearContext).toHaveBeenCalledTimes(1);
    expect(contextTop.clearRect).toHaveBeenCalledTimes(1);
  });

  it('does not clear the interactive overlay for a preview export render', () => {
    const contextTop = { clearRect: vi.fn() };
    const clearContext = vi.fn();
    const mainContext = {} as CanvasRenderingContext2D;
    const handler = createBeforeRenderHandler({
      getCanvas: () => ({ clearContext, contextTop, getContext: () => mainContext }) as never,
      getDrawSession: () => ({ object: { visible: false } }) as never,
    });

    handler({ ctx: {} as CanvasRenderingContext2D });

    expect(clearContext).not.toHaveBeenCalled();
    expect(contextTop.clearRect).not.toHaveBeenCalled();
  });

  it('guards missing canvas or contextTop', () => {
    createBeforeRenderHandler({ getCanvas: () => null, getDrawSession: () => null })({
      ctx: {} as CanvasRenderingContext2D,
    });
    createBeforeRenderHandler({
      getCanvas: () => ({ clearContext: vi.fn() }) as never,
      getDrawSession: () => null,
    })({ ctx: {} as CanvasRenderingContext2D });
  });
});

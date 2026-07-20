import { describe, expect, it, vi } from 'vitest';
import { createBeforeRenderHandler } from './runtime.canvas';

describe('runtime canvas handler', () => {
  it('captures contextTop before clearing the canvas overlay context', () => {
    const clearContext = vi.fn();
    const contextTop = { id: 'top-context' };
    const handler = createBeforeRenderHandler({
      getCanvas: () => ({ clearContext, contextTop }) as never,
    });

    handler();

    expect(clearContext).toHaveBeenCalledWith(contextTop);
  });

  it('guards missing canvas or contextTop', () => {
    createBeforeRenderHandler({ getCanvas: () => null })();
    createBeforeRenderHandler({ getCanvas: () => ({ clearContext: vi.fn() }) as never })();
  });
});

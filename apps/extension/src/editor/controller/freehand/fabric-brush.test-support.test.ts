import { describe, expect, it, vi } from 'vitest';

import { PencilBrush, Point, setFabricBrushMockHooks } from './fabric-brush.test-support';

describe('fabric brush test support', () => {
  it('supports absent hooks and point equality checks', () => {
    const brush = new PencilBrush({});

    setFabricBrushMockHooks({});
    brush.onMouseDown({ x: 1, y: 2 });
    brush.onMouseMove({ x: 3, y: 4 });

    expect(brush.onMouseUp()).toBe(false);
    expect(brush.needsFullRender()).toBe(false);
    expect(new Point(1, 2).eq({ x: 1, y: 2 })).toBe(true);
    expect(new Point(1, 2).eq({ x: 2, y: 1 })).toBe(false);
  });

  it('delegates present hooks', () => {
    const finalizeAndAddPath = vi.fn();
    const saveAndTransform = vi.fn();
    const superRender = vi.fn();
    const brush = new PencilBrush({});
    const context = {};

    setFabricBrushMockHooks({ finalizeAndAddPath, saveAndTransform, superRender });
    brush.onMouseUp();
    brush._saveAndTransform(context);
    brush._render(context);

    expect(finalizeAndAddPath).toHaveBeenCalledOnce();
    expect(saveAndTransform).toHaveBeenCalledWith(context);
    expect(superRender).toHaveBeenCalledWith(context);
  });
});

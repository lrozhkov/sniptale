import { Control } from 'fabric';
import { describe, expect, it, vi } from 'vitest';

import { applyEditorObjectInteractionControls } from './apply';
import { applyEditorObjectControlDefaults } from './base';
import { patchCornerControl, resolveCornerVisualSize } from './corner';
import { patchRotateControl } from './rotate';

function createControlSet() {
  return {
    bl: new Control(),
    br: new Control(),
    mb: new Control(),
    ml: new Control(),
    mr: new Control(),
    mt: new Control(),
    mtr: new Control({ withConnection: true }),
    tl: new Control(),
    tr: new Control(),
  };
}

describe('editor object interaction control owners', () => {
  it('keeps shared Fabric defaults separate from control rendering patches', () => {
    const object = { set: vi.fn() };

    applyEditorObjectControlDefaults(object as never);

    expect(object.set).toHaveBeenCalledWith(
      expect.objectContaining({ borderScaleFactor: 1.35, cornerStyle: 'circle' })
    );
  });

  it('patches corner and rotate controls through their visual owners', () => {
    const corner = new Control();
    const rotate = new Control({ withConnection: true });

    expect(resolveCornerVisualSize({ width: 24, height: 24 } as never, false)).toBe(9);
    patchCornerControl(corner, 'tl');
    patchRotateControl(rotate);

    expect(corner.sizeX).toBe(17);
    expect(corner.render).toBeTypeOf('function');
    expect(rotate.withConnection).toBe(false);
    expect(rotate.offsetY).toBe(-32);
  });

  it('applies owner patches only when the object has the default box control surface', () => {
    const controls = createControlSet();
    const object = { controls, set: vi.fn() };

    applyEditorObjectInteractionControls(object as never);

    expect(controls.tl.render).toBeTypeOf('function');
    expect(controls.mt.shouldActivate).toBeTypeOf('function');
    expect(controls.mtr.render).toBeTypeOf('function');
  });
});

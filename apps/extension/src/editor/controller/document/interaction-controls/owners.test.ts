// @vitest-environment jsdom
import { Control } from 'fabric';
import { describe, expect, it, vi } from 'vitest';

import { applyEditorObjectInteractionControls } from './apply';
import { applyEditorObjectControlDefaults } from './base';
import { patchCornerControl } from './corner';
import { patchRotateControl } from './rotate';
import { patchEdgeControl } from '../interaction-border-controls';

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
      expect.objectContaining({ borderScaleFactor: 1.25, cornerStyle: 'circle' })
    );
  });

  it('patches corner and rotate controls through their visual owners', () => {
    const corner = new Control();
    const rotate = new Control({ withConnection: true });

    patchCornerControl(corner, 'tl');
    patchRotateControl(rotate);

    expect(corner.sizeX).toBe(22);
    expect(corner.render).toBeTypeOf('function');
    expect(rotate.withConnection).toBe(false);
    expect(rotate.offsetY).toBe(-20);
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

it.each(['tl', 'mr'] as const)('keeps captured %s blue when hover identity changes', (key) => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 40;
  const context = canvas.getContext('2d')!;
  const control = new Control();
  if (key === 'tl') patchCornerControl(control, key);
  else patchEdgeControl(control, key);
  const object = {
    controls: { [key]: control },
    __corner: '',
    canvas: { _currentTransform: null as unknown },
  };
  const core = () => {
    context.clearRect(0, 0, 40, 40);
    control.render.call(control, context, 20, 20, {}, object as never);
    return [...context.getImageData(20, 20, 1, 1).data];
  };
  expect(core()).toEqual([255, 255, 255, 255]);
  object.canvas._currentTransform = { target: object, corner: key };
  expect(core()).toEqual([37, 99, 235, 255]);
  object.__corner = 'another-handle';
  expect(core()).toEqual([37, 99, 235, 255]);
  object.canvas._currentTransform = null;
  expect(core()).toEqual([255, 255, 255, 255]);
});

it('keeps the painted corner identical before and during hover for every object size', () => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 40;
  const context = canvas.getContext('2d')!;
  for (const size of [4, 24, 58, 300]) {
    const controls = createControlSet();
    const object = { width: size, height: size, controls, set: vi.fn(), __corner: '' };
    applyEditorObjectInteractionControls(object as never);
    const paint = () => {
      context.clearRect(0, 0, 40, 40);
      controls.tl.render.call(controls.tl, context, 20, 20, {}, object as never);
      return [...context.getImageData(0, 0, 40, 40).data];
    };
    const before = paint();
    object.__corner = 'tl';
    expect(paint()).toEqual(before);
    expect(before.some((channel) => channel > 0)).toBe(true);
  }
});

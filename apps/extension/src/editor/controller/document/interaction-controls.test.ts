import { Control } from 'fabric';
import { expect, it, vi } from 'vitest';

import { applyEditorObjectInteractionControls } from './interaction-controls';

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

it('applies Miro-style corner-only visual controls with hidden edge resize targets', () => {
  const controls = createControlSet();
  const object = {
    borderColor: '#f97316',
    controls,
    cornerColor: '#f8fafc',
    cornerStrokeColor: '#f97316',
    set: vi.fn(),
  };

  applyEditorObjectInteractionControls(object as never);

  expect(object.set).toHaveBeenCalledWith({
    borderScaleFactor: 1.35,
    cornerSize: 13,
    cornerStyle: 'circle',
    snapAngle: 15,
    snapThreshold: 4,
  });
  expect(controls.mt.sizeX).toBe(22);
  expect(controls.mr.render).toBeTypeOf('function');
  expect(controls.mr.shouldActivate).toBeTypeOf('function');
  expect(controls.tl.sizeX).toBe(17);
  expect(controls.mtr.withConnection).toBe(false);
  expect(controls.mtr.offsetY).toBe(-32);
});

it('renders hover-expanded corner and rotation controls while keeping edge controls invisible', () => {
  const controls = createControlSet();
  const object = {
    __corner: 'tl',
    borderColor: '#111827',
    controls,
    cornerColor: '#ffffff',
    cornerStrokeColor: '#f97316',
    set: vi.fn(),
  };
  const ctx = {
    arc: vi.fn(),
    beginPath: vi.fn(),
    fill: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    stroke: vi.fn(),
    translate: vi.fn(),
  };

  applyEditorObjectInteractionControls(object as never);
  controls.tl.render?.call(controls.tl, ctx as never, 10, 12, undefined, object as never);
  controls.mr.render?.call(controls.mr, ctx as never, 10, 12, undefined, object as never);
  object.__corner = 'mtr';
  controls.mtr.render?.call(controls.mtr, ctx as never, 20, 22, undefined, object as never);

  expect(ctx.arc).toHaveBeenCalledWith(0, 0, 8.5, 0, Math.PI * 2);
  expect(ctx.scale).toHaveBeenCalled();
  expect(ctx.translate).toHaveBeenCalledWith(20, 22);
});

it('renders default-size controls when no handle is actively hovered', () => {
  const controls = createControlSet();
  const object = { controls, set: vi.fn() };
  const ctx = {
    arc: vi.fn(),
    beginPath: vi.fn(),
    fill: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    stroke: vi.fn(),
    translate: vi.fn(),
  };

  applyEditorObjectInteractionControls(object as never);
  controls.tl.render?.call(controls.tl, ctx as never, 1, 2, undefined, object as never);
  controls.mtr.render?.call(controls.mtr, ctx as never, 3, 4, undefined, object as never);

  expect(ctx.arc).toHaveBeenCalledWith(0, 0, 6.5, 0, Math.PI * 2);
  expect(ctx.lineTo).toHaveBeenCalledWith(21, 8);
});

it('shrinks corner handles smoothly for compact selected objects', () => {
  const controls = createControlSet();
  const object = {
    controls,
    getScaledHeight: () => 28,
    getScaledWidth: () => 36,
    set: vi.fn(),
  };
  const ctx = {
    arc: vi.fn(),
    beginPath: vi.fn(),
    fill: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    stroke: vi.fn(),
    translate: vi.fn(),
  };

  applyEditorObjectInteractionControls(object as never);
  controls.tl.render?.call(controls.tl, ctx as never, 1, 2, undefined, object as never);

  expect(ctx.arc).toHaveBeenCalledWith(0, 0, 4.5, 0, Math.PI * 2);
});

it('activates hidden edge resize controls along the whole border except corner handle zones', () => {
  const controls = createControlSet();
  const object = {
    canvas: { getActiveObject: vi.fn() },
    controls,
    getCoords: () => [
      { x: 100, y: 100 },
      { x: 300, y: 100 },
      { x: 300, y: 220 },
      { x: 100, y: 220 },
    ],
    isControlVisible: vi.fn(() => true),
    set: vi.fn(),
  };
  object.canvas.getActiveObject.mockReturnValue(object);

  applyEditorObjectInteractionControls(object as never);

  expect(
    controls.mt.shouldActivate?.('mt', object as never, { x: 170, y: 104 } as never, {} as never)
  ).toBe(true);
  expect(
    controls.mt.shouldActivate?.('mt', object as never, { x: 112, y: 102 } as never, {} as never)
  ).toBe(false);
  expect(
    controls.mt.shouldActivate?.('mt', object as never, { x: 170, y: 130 } as never, {} as never)
  ).toBe(false);
  expect(
    controls.mr.shouldActivate?.('mr', object as never, { x: 294, y: 165 } as never, {} as never)
  ).toBe(true);
});

it('leaves custom control sets untouched after applying shared Fabric defaults', () => {
  const object = { controls: { tl: new Control() }, set: vi.fn() };
  const render = object.controls.tl.render;

  applyEditorObjectInteractionControls(object as never);

  expect(object.set).toHaveBeenCalledWith(
    expect.objectContaining({ cornerStyle: 'circle', snapAngle: 15 })
  );
  expect(object.controls.tl.render).toBe(render);
});

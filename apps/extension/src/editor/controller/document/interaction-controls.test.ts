// @vitest-environment jsdom

import { Canvas, Control, FabricObject } from 'fabric';
import { expect, it, vi } from 'vitest';

import { applyEditorObjectInteractionControls } from './interaction-controls/apply';

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

it('applies fixed corner and side controls with larger pointer targets', () => {
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
    borderScaleFactor: 1.25,
    cornerSize: 9,
    cornerStyle: 'circle',
    snapAngle: 15,
    snapThreshold: 4,
  });
  expect(controls.mt.sizeX).toBe(22);
  expect(controls.mr.render).toBeTypeOf('function');
  expect(controls.mr.shouldActivate).toBeTypeOf('function');
  expect(controls.tl.sizeX).toBe(22);
  expect(controls.mtr.withConnection).toBe(false);
  expect(controls.mtr.offsetY).toBe(-20);
});

it('uses diagonal cursors for default box corners even on elongated objects', () => {
  const canvas = new Canvas(document.createElement('canvas'));
  const object = new FabricObject({ width: 600, height: 12 });
  canvas.add(object);
  applyEditorObjectInteractionControls(object);
  object.setCoords();
  const control = object.controls['tl']!;

  expect(
    control.cursorStyleHandler(
      new MouseEvent('mousemove'),
      control,
      object,
      object.calcOCoords()['tl']!
    )
  ).toBe('nwse-resize');
});

it('renders fixed corners, visible side controls and an unbacked rotation icon during hover', () => {
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
    roundRect: vi.fn(),
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

  expect(ctx.roundRect).toHaveBeenCalledWith(-4.5, -4.5, 9, 9, 1.5);
  expect(ctx.roundRect).toHaveBeenCalledWith(-3, -6, 6, 12, 3);
  expect(ctx.scale).toHaveBeenCalled();
  expect(ctx.translate).toHaveBeenCalledWith(20, 22);
});

it('renders default-size controls when no handle is actively hovered', () => {
  const controls = createControlSet();
  const object = { controls, set: vi.fn() };
  const ctx = {
    arc: vi.fn(),
    roundRect: vi.fn(),
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

  expect(ctx.roundRect).toHaveBeenCalledWith(-4.5, -4.5, 9, 9, 1.5);
  expect(ctx.lineTo).toHaveBeenCalledWith(19.95, 15);
});

it('keeps corner handles readable on compact selected objects', () => {
  const controls = createControlSet();
  const object = {
    controls,
    getScaledHeight: () => 28,
    getScaledWidth: () => 36,
    set: vi.fn(),
  };
  const ctx = {
    arc: vi.fn(),
    roundRect: vi.fn(),
    beginPath: vi.fn(),
    fill: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    stroke: vi.fn(),
    translate: vi.fn(),
  };

  applyEditorObjectInteractionControls(object as never);
  controls.tl.render?.call(controls.tl, ctx as never, 1, 2, undefined, object as never);

  expect(ctx.roundRect).toHaveBeenCalledWith(-4.5, -4.5, 9, 9, 1.5);
});

it('activates side handles near their visible centers without stealing corner gestures', () => {
  const controls = createControlSet();
  const object = {
    canvas: { getActiveObject: vi.fn(), viewportTransform: [1, 0, 0, 1, 0, 0] },
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
    controls.mt.shouldActivate?.('mt', object as never, { x: 200, y: 104 } as never, {} as never)
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

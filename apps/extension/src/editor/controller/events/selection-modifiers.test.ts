// @vitest-environment jsdom

import { ActiveSelection, Canvas, Rect, type FabricObject, type TPointerEvent } from 'fabric';
import { expect, it } from 'vitest';
import {
  beginEditorSelectionModifierGesture,
  finishEditorSelectionModifierGesture,
  finishEditorSelectionModifierMouseDown,
} from './selection-modifiers';

class SelectionTestCanvas extends Canvas {
  applyMultiSelection(event: TPointerEvent, target: FabricObject): boolean {
    return this.handleMultiSelection(event, target);
  }
}

function createCanvasObjects() {
  const canvas = new SelectionTestCanvas(document.createElement('canvas'), {
    selectionKey: 'ctrlKey',
  });
  const first = new Rect({ height: 20, width: 20 });
  const second = new Rect({ height: 20, left: 40, width: 20 });
  const third = new Rect({ height: 20, left: 80, width: 20 });
  canvas.add(first, second, third);
  return { canvas, first, second, third };
}

it('adds with Shift click, retains selected members, and toggles with Ctrl click', () => {
  const { canvas, first, second } = createCanvasObjects();
  canvas.setActiveObject(first);
  const shift = new MouseEvent('mousedown', { button: 0, shiftKey: true });
  const add = beginEditorSelectionModifierGesture({
    activeTool: 'select',
    canvas,
    event: shift,
    target: second,
  });
  expect(canvas.selectionKey).toBe('shiftKey');
  expect(canvas.applyMultiSelection(shift, second)).toBe(true);
  finishEditorSelectionModifierMouseDown(canvas, add);
  expect(canvas.selectionKey).toBe('ctrlKey');
  expect(new Set(canvas.getActiveObjects())).toEqual(new Set([first, second]));

  const retain = beginEditorSelectionModifierGesture({
    activeTool: 'select',
    canvas,
    event: shift,
    target: second,
  });
  expect(retain).toBeNull();
  expect(canvas.applyMultiSelection(shift, second)).toBe(false);
  expect(canvas.selectionKey).toBe('ctrlKey');
  expect(new Set(canvas.getActiveObjects())).toEqual(new Set([first, second]));

  const ctrl = new MouseEvent('mousedown', { button: 0, ctrlKey: true });
  expect(canvas.applyMultiSelection(ctrl, second)).toBe(true);
  expect(canvas.getActiveObjects()).toEqual([first]);
  canvas.dispose();
});

it('adds with Shift marquee and toggles with Ctrl marquee', () => {
  const { canvas, first, second, third } = createCanvasObjects();
  canvas.setActiveObject(first);
  const add = beginEditorSelectionModifierGesture({
    activeTool: 'select',
    canvas,
    event: new MouseEvent('mousedown', { button: 0, shiftKey: true }),
  });
  canvas.setActiveObject(second);
  expect(finishEditorSelectionModifierGesture(canvas, add)).toBe(true);
  expect(new Set(canvas.getActiveObjects())).toEqual(new Set([first, second]));

  const toggle = beginEditorSelectionModifierGesture({
    activeTool: 'select',
    canvas,
    event: new MouseEvent('mousedown', { button: 0, ctrlKey: true }),
  });
  canvas.setActiveObject(new ActiveSelection([second, third], { canvas }));
  expect(finishEditorSelectionModifierGesture(canvas, toggle)).toBe(true);
  expect(new Set(canvas.getActiveObjects())).toEqual(new Set([first, third]));
  canvas.dispose();
});

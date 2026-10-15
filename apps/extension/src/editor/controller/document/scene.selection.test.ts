// @vitest-environment jsdom

import { ActiveSelection, Canvas, Rect, util } from 'fabric';
import { expect, it, vi } from 'vitest';

import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../../features/editor/document/constants';
import type { SourceState } from '../../document/model/source-state';
import { relayoutEditorScene } from './scene';

function createScene() {
  const canvas = new Canvas(document.createElement('canvas'), { renderOnAddRemove: false });
  const source = new Rect({ left: 32, top: 32, width: 320, height: 180, strokeWidth: 0 });
  source.sniptaleId = 'source';
  source.sniptaleType = 'source-image';
  const first = new Rect({ left: 62, top: 52, width: 40, height: 20, strokeWidth: 0 });
  const second = new Rect({ left: 162, top: 102, width: 30, height: 40, strokeWidth: 0 });
  canvas.add(source, first, second);
  const state: SourceState = {
    id: 'source',
    dataUrl: '',
    name: null,
    intrinsicWidth: 320,
    intrinsicHeight: 180,
    left: 32,
    top: 32,
    displayWidth: 320,
    displayHeight: 180,
    visible: true,
    locked: false,
  };
  return { canvas, first, second, source, state };
}

it.each([
  { fit: false, transformed: false, selectSource: false, stroked: false },
  { fit: true, transformed: false, selectSource: false, stroked: false },
  { fit: true, transformed: true, selectSource: false, stroked: false },
  { fit: true, transformed: false, selectSource: true, stroked: false },
  { fit: true, transformed: false, selectSource: false, stroked: true },
])('relayouts retained multi-selection in canvas coordinates: %j', async (mode) => {
  const selected = createScene();
  const reference = createScene();
  if (mode.stroked) {
    for (const scene of [selected, reference]) {
      scene.first.set({ strokeWidth: 1, strokeUniform: true });
      scene.second.set({ strokeWidth: 1, strokeUniform: true });
    }
  }
  const members = mode.selectSource
    ? [selected.source, selected.first, selected.second]
    : [selected.first, selected.second];
  const selection = new ActiveSelection(members, { canvas: selected.canvas });
  selected.canvas.setActiveObject(selection);
  if (mode.transformed) {
    selection.set({ angle: 17, scaleX: 1.3, scaleY: 0.8 });
    selection.setCoords();
  }
  const originals = [selected.source, selected.first, selected.second];
  const references = [reference.source, reference.first, reference.second];
  originals.forEach((object, index) => {
    const target = references[index];
    if (target) util.applyTransformToObject(target, object.calcTransformMatrix());
  });
  const changes = vi.fn();
  selected.canvas.on('selection:created', changes);
  selected.canvas.on('selection:updated', changes);
  selected.canvas.on('selection:cleared', changes);
  const browserFrame = {
    ...DEFAULT_BROWSER_FRAME_STATE,
    enabled: true,
    contentMode: mode.fit ? ('fit-content' as const) : ('push-down' as const),
    canvasMode: mode.fit ? ('keep-size' as const) : ('resize' as const),
  };
  const relayout = (scene: ReturnType<typeof createScene>) =>
    relayoutEditorScene(
      scene.canvas,
      scene.state,
      { width: 384, height: 244 },
      DEFAULT_EDITOR_FRAME_SETTINGS,
      browserFrame,
      { hasBrowserFrame: true }
    );
  try {
    const expected = relayout(reference);
    const actual = relayout(selected);
    expect(selected.canvas.getActiveObject()).toBe(selection);
    expect(selected.canvas.getActiveObjects()).toEqual(members);
    expect(changes).not.toHaveBeenCalled();
    expect(actual).toEqual(expected);
    originals.forEach((object, index) => {
      const target = references[index];
      if (!target) throw new Error('Missing reference object');
      object.calcTransformMatrix().forEach((value, component) => {
        expect(value).toBeCloseTo(target.calcTransformMatrix()[component]!, 8);
      });
    });
    const bounds = selection.getBoundingRect();
    for (const object of members) {
      const child = object.getBoundingRect();
      expect(child.left).toBeGreaterThanOrEqual(bounds.left - 1e-8);
      expect(child.top).toBeGreaterThanOrEqual(bounds.top - 1e-8);
      expect(child.left + child.width).toBeLessThanOrEqual(bounds.left + bounds.width + 1e-8);
      expect(child.top + child.height).toBeLessThanOrEqual(bounds.top + bounds.height + 1e-8);
    }
    selected.canvas.discardActiveObject();
    originals.forEach((object, index) => {
      const target = references[index];
      if (!target) throw new Error('Missing reference object');
      object.calcTransformMatrix().forEach((value, component) => {
        expect(value).toBeCloseTo(target.calcTransformMatrix()[component]!, 8);
      });
    });
  } finally {
    await selected.canvas.dispose();
    await reference.canvas.dispose();
  }
});

it('restores the same selection members if synchronous scene relayout fails', async () => {
  const scene = createScene();
  const members = [scene.first, scene.second];
  const selection = new ActiveSelection(members, { canvas: scene.canvas });
  scene.canvas.setActiveObject(selection);
  const failure = new Error('Object layout failed');
  vi.spyOn(scene.canvas, 'getObjects').mockImplementationOnce(() => {
    throw failure;
  });
  try {
    expect(() =>
      relayoutEditorScene(
        scene.canvas,
        scene.state,
        { width: 384, height: 244 },
        DEFAULT_EDITOR_FRAME_SETTINGS,
        { ...DEFAULT_BROWSER_FRAME_STATE, enabled: true },
        { hasBrowserFrame: true }
      )
    ).toThrow(failure);
    expect(scene.canvas.getActiveObject()).toBe(selection);
    expect(selection.getObjects()).toEqual(members);
    expect(scene.first.group).toBe(selection);
    expect(scene.second.group).toBe(selection);
  } finally {
    await scene.canvas.dispose();
  }
});

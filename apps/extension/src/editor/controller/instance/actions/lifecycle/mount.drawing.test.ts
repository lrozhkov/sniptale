// @vitest-environment jsdom

import { FabricImage, Rect } from 'fabric';
import { Blob as NativeBlob } from 'node:buffer';
import { createCanvas, loadImage } from 'canvas';
import { expect, it, vi } from 'vitest';
import { createImageEditorController } from '../../../core/root';
import type { EditorControllerInstance } from '../../types';
import { executeRasterCompute } from '../../../../raster-editing/compute';
import { createEditorSnapshotHistory } from '../../../history';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../../../../features/editor/document/constants';
import { useEditorStore } from '../../../../state/useEditorStore';
import { applyBaseInteractionPatch } from '../../../document/objects/interaction-patches';
import { createMountedCanvas } from './mount';

it('configures canonical drawing selection and transform modifiers', () => {
  const canvas = createMountedCanvas(document.createElement('canvas'));

  expect(canvas.selectionKey).toBe('ctrlKey');
  expect(canvas.uniformScaling).toBe(false);
  expect(canvas.uniScaleKey).toBe('shiftKey');
  expect(canvas.centeredKey).toBe('ctrlKey');
  expect(canvas.enablePointerEvents).toBe(true);
  expect(canvas.fireMiddleClick).toBe(false);
  expect(canvas.targetFindTolerance).toBe(5);
  expect(canvas.upperCanvasEl.draggable).toBe(false);

  canvas.dispose();
});

function dispatchPointer(
  canvas: ReturnType<typeof createMountedCanvas>,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  x: number,
  y: number,
  ctrlKey = false
) {
  canvas.upperCanvasEl.dispatchEvent(
    new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y, ctrlKey })
  );
}

function marquee(canvas: ReturnType<typeof createMountedCanvas>, right: number, bottom: number) {
  dispatchPointer(canvas, 'pointerdown', 10, 10);
  dispatchPointer(canvas, 'pointermove', right, bottom);
  dispatchPointer(canvas, 'pointerup', right, bottom);
}

it('marquee selects enclosed layers and excludes intersecting layers and a locked source', async () => {
  const canvas = createMountedCanvas(document.createElement('canvas'));
  document.body.append(canvas.wrapperEl);
  canvas.setDimensions({ width: 600, height: 400 });
  const source = new Rect({
    originX: 'left',
    originY: 'top',
    left: 20,
    top: 20,
    width: 520,
    height: 320,
    sniptaleType: 'source-image',
  });
  applyBaseInteractionPatch(source, { arrowInteraction: null, arrowObject: false, locked: true });
  const enclosed = new Rect({
    originX: 'left',
    originY: 'top',
    left: 30,
    top: 30,
    width: 40,
    height: 40,
    strokeWidth: 0,
  });
  const intersecting = new Rect({
    originX: 'left',
    originY: 'top',
    left: 100,
    top: 60,
    width: 120,
    height: 120,
  });
  const large = new Rect({
    originX: 'left',
    originY: 'top',
    left: 20,
    top: 20,
    width: 500,
    height: 300,
    sniptaleType: 'background',
  });
  canvas.add(source, large, enclosed, intersecting);
  try {
    marquee(canvas, 150, 150);
    expect(canvas.getActiveObjects()).toEqual([enclosed]);
    canvas.discardActiveObject();
    marquee(canvas, 550, 350);
    expect(new Set(canvas.getActiveObjects())).toEqual(new Set([large, enclosed, intersecting]));
    expect(source.selectable).toBe(false);
    canvas.discardActiveObject();
    applyBaseInteractionPatch(source, {
      arrowInteraction: null,
      arrowObject: false,
      locked: false,
    });
    marquee(canvas, 550, 350);
    expect(new Set(canvas.getActiveObjects())).toEqual(
      new Set([source, large, enclosed, intersecting])
    );
  } finally {
    await canvas.dispose();
  }
});

it('uses transformed corners for containment and preserves click and Ctrl add selection', async () => {
  const canvas = createMountedCanvas(document.createElement('canvas'));
  document.body.append(canvas.wrapperEl);
  canvas.setDimensions({ width: 600, height: 400 });
  const rotated = new Rect({
    originX: 'left',
    originY: 'top',
    left: 130,
    top: 80,
    width: 80,
    height: 40,
    angle: 45,
    scaleX: 1.5,
    strokeWidth: 0,
  });
  const separate = new Rect({
    originX: 'left',
    originY: 'top',
    left: 300,
    top: 50,
    width: 40,
    height: 40,
  });
  canvas.add(rotated, separate);
  const originalCorners = rotated.getCoords();
  try {
    marquee(canvas, 200, 200);
    expect(canvas.getActiveObjects()).toEqual([]);
    marquee(canvas, 230, 210);
    expect(canvas.getActiveObjects()).toEqual([rotated]);
    dispatchPointer(canvas, 'pointerdown', 320, 70, true);
    dispatchPointer(canvas, 'pointerup', 320, 70, true);
    expect(new Set(canvas.getActiveObjects())).toEqual(new Set([rotated, separate]));
    rotated.getCoords().forEach((point, index) => {
      expect(point.x).toBeCloseTo(originalCorners[index]!.x, 8);
      expect(point.y).toBeCloseTo(originalCorners[index]!.y, 8);
    });
    canvas.discardActiveObject();
    dispatchPointer(canvas, 'pointerdown', 320, 70);
    dispatchPointer(canvas, 'pointerup', 320, 70);
    expect(canvas.getActiveObjects()).toEqual([separate]);
  } finally {
    await canvas.dispose();
  }
});

async function mountedRasterController() {
  vi.stubGlobal('Blob', NativeBlob);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  vi.spyOn(FabricImage, 'fromURL').mockImplementation(async (url, options) => {
    options?.signal?.throwIfAborted();
    const decoded = await loadImage(url);
    const bitmap = document.createElement('canvas');
    bitmap.width = decoded.width;
    bitmap.height = decoded.height;
    const native = createCanvas(decoded.width, decoded.height).getContext('2d');
    native.drawImage(decoded, 0, 0);
    const context = bitmap.getContext('2d')!;
    const pixels = context.createImageData(decoded.width, decoded.height);
    pixels.data.set(native.getImageData(0, 0, decoded.width, decoded.height).data);
    context.putImageData(pixels, 0, 0);
    return new FabricImage(bitmap);
  });
  const bitmap = document.createElement('canvas');
  bitmap.width = bitmap.height = 4;
  const brush = bitmap.getContext('2d')!;
  brush.fillStyle = '#ff0000';
  brush.fillRect(0, 0, 4, 4);
  const original = bitmap.toDataURL('image/png');
  const previousFrame = useEditorStore.getState().frame;
  useEditorStore.setState({
    frame: { ...DEFAULT_EDITOR_FRAME_SETTINGS, layoutMode: 'fit-image' },
    browserFrame: { ...DEFAULT_BROWSER_FRAME_STATE },
  });
  const rootController = createImageEditorController({
    createRasterCompute: () => ({ run: executeRasterCompute, cancel: vi.fn(), dispose: vi.fn() }),
  });
  const controller: EditorControllerInstance = rootController;
  const viewport = document.createElement('div'),
    stage = document.createElement('div'),
    element = document.createElement('canvas');
  viewport.append(stage);
  stage.append(element);
  document.body.append(viewport);
  rootController.mount(element, viewport, stage);
  const canvas = controller.canvas!;
  controller.canvasDocumentSize = { width: 20, height: 20 };
  canvas.setDimensions({ width: 20, height: 20 });
  const source = new FabricImage(bitmap, { originX: 'left', originY: 'top', left: 2, top: 3 });
  source.sniptaleId = 'mounted-source';
  source.sniptaleType = 'source-image';
  source.sniptaleRole = 'source';
  source.sniptaleLocked = true;
  source.sniptaleContentLocked = false;
  controller.source = {
    id: 'mounted-source',
    dataUrl: original,
    name: 'source.png',
    intrinsicWidth: 4,
    intrinsicHeight: 4,
    left: 0,
    top: 0,
    displayWidth: 4,
    displayHeight: 4,
    visible: true,
    locked: true,
  };
  controller.prepareObject(source);
  canvas.add(source);
  canvas.setActiveObject(source);
  controller.syncRuntimeState();
  controller.history = createEditorSnapshotHistory(rootController.exportDocument());
  return {
    rootController,
    controller,
    canvas,
    source,
    original,
    runtime: rootController.getRasterRuntime()!,
    dispose() {
      rootController.dispose();
      viewport.remove();
      useEditorStore.setState({ frame: previousFrame });
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    },
  };
}

it('publishes selected source pixels, fragment preparation and both flips through the mounted controller', async () => {
  const mounted = await mountedRasterController();
  const { controller, runtime, source, canvas } = mounted;
  try {
    expect(runtime.getSnapshot()).toMatchObject({
      available: true,
      targetId: source.sniptaleId,
      permission: 'allowed',
    });
    controller.activeTool = 'pencil';
    runtime.setTool('fill');
    expect(controller.activeTool).toBe('select');
    expect(useEditorStore.getState().activeTool).toBe('select');

    runtime.selectAll();
    runtime.updateSettings({ color: '#0000ff' });
    await runtime.fillSelected();
    expect(runtime.getSnapshot().error).toBeNull();
    expect([...source.toCanvasElement().getContext('2d')!.getImageData(0, 0, 1, 1).data]).toEqual([
      0, 0, 255, 255,
    ]);
    expect(controller.source).toMatchObject({
      left: 2,
      top: 3,
      displayWidth: 4,
      displayHeight: 4,
      locked: true,
    });
    expect(controller.history?.getState().index).toBe(1);
    runtime.selectAll();
    await runtime.copySelected();
    const copy = canvas.getActiveObject();
    expect(copy).toBeInstanceOf(FabricImage);
    expect(copy).not.toBe(source);
    expect(copy?.sniptaleType).toBe('image');
    expect(copy?.objectCaching).toBe(false);
    expect(controller.history?.getState().index).toBe(2);
    canvas.setActiveObject(source);
    runtime.refresh();
    await runtime.flipHorizontal();
    await runtime.flipVertical();
    expect(source.flipX).toBe(true);
    expect(source.flipY).toBe(true);
    expect(controller.history?.getState().index).toBe(4);
  } finally {
    mounted.dispose();
  }
});

it('publishes a prepared background edit through mounted frame history without replacing source pixels', async () => {
  const mounted = await mountedRasterController();
  const { rootController, controller, runtime, canvas, source, original } = mounted;
  try {
    expect(
      await rootController.applyFrameSettings(
        {
          ...useEditorStore.getState().frame,
          backgroundMode: 'image',
          backgroundImageFit: 'stretch',
          backgroundImageData: original,
        },
        { allowBackgroundContentEditing: true }
      )
    ).toBe(true);
    const previous = canvas.getObjects().find((object) => object.sniptaleRole === 'background')!;
    canvas.setActiveObject(previous);
    await runtime.adapter.hydrateTarget();
    runtime.refresh();
    expect(runtime.getSnapshot()).toMatchObject({
      targetKind: 'background',
      permission: 'allowed',
    });
    const before = controller.history!.getState().index;
    runtime.setTool('fill');
    runtime.selectAll();
    runtime.updateSettings({ color: '#00ff00' });
    await runtime.fillSelected();
    expect(runtime.getSnapshot().error).toBeNull();
    const background = canvas.getObjects().find((object) => object.sniptaleRole === 'background')!;
    expect(background).not.toBe(previous);
    expect(background.sniptaleRasterOriginalData).toBe(original);
    expect(useEditorStore.getState().frame.backgroundImageData).toBe(
      background.sniptaleBackgroundImageData
    );
    expect(controller.history!.getState().index).toBe(before + 1);
    expect(source.getSrc()).toBe(original);
    const derived = await FabricImage.fromURL(useEditorStore.getState().frame.backgroundImageData!);
    try {
      expect([
        ...derived.toCanvasElement().getContext('2d')!.getImageData(0, 0, 1, 1).data,
      ]).toEqual([0, 255, 0, 255]);
    } finally {
      derived.dispose();
    }
    const refused = new AbortController();
    refused.abort();
    expect(
      await rootController.applyFrameSettings(
        { ...useEditorStore.getState().frame, backgroundImageData: original },
        { signal: refused.signal }
      )
    ).toBe(false);
    expect(controller.history!.getState().index).toBe(before + 1);
    expect(canvas.getObjects().includes(background)).toBe(true);
  } finally {
    mounted.dispose();
  }
});

it('admits mounted raster gestures only in Select without pan and cancels drafts without history', async () => {
  const mounted = await mountedRasterController();
  const { controller, runtime, canvas, source } = mounted;
  try {
    vi.spyOn(canvas.upperCanvasEl, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 20, 20)
    );
    const matrix = runtime.getTarget()!.geometry.sourceToScene,
      viewport = canvas.viewportTransform;
    const sceneX = matrix[0] + matrix[2] + matrix[4],
      sceneY = matrix[1] + matrix[3] + matrix[5];
    const point = {
      x: viewport[0] * sceneX + viewport[2] * sceneY + viewport[4],
      y: viewport[1] * sceneX + viewport[3] * sceneY + viewport[5],
    };
    const press = () =>
      canvas.upperCanvasEl.dispatchEvent(
        Object.assign(
          new MouseEvent('pointerdown', {
            bubbles: true,
            button: 0,
            clientX: point.x,
            clientY: point.y,
          }),
          { pointerId: 11, isPrimary: true }
        )
      );
    canvas.upperCanvasEl.addEventListener(
      'pointerdown',
      (event) => event.stopImmediatePropagation(),
      true
    );
    runtime.setTool('erase');
    const before = controller.history!.getState().index;
    controller.isSpacePressed = true;
    press();
    expect(runtime.getSnapshot().busy).toBe(false);
    controller.isSpacePressed = false;
    controller.activeTool = 'pencil';
    press();
    expect(runtime.getSnapshot().busy).toBe(false);
    controller.activeTool = 'select';
    press();
    expect(runtime.getSnapshot().busy).toBe(true);
    runtime.cancel();
    await Promise.resolve();
    expect(runtime.getSnapshot()).toMatchObject({ busy: false, error: null });
    expect(controller.history!.getState().index).toBe(before);
    expect(source.sniptaleRasterVisibilityData).toBeUndefined();
    runtime.setTool('crop');
    await vi.waitFor(() => expect(runtime.getSnapshot().busy).toBe(false));
    expect(runtime.beginGesture({ x: 0, y: 0 })).toBe(true);
    runtime.moveGesture({ x: 2, y: 2 });
    runtime.cancelCrop();
    expect(runtime.getSnapshot()).toMatchObject({ busy: false, cropPending: false });
    expect(controller.history!.getState().index).toBe(before);
  } finally {
    mounted.dispose();
  }
});

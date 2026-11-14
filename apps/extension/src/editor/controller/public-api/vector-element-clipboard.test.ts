// @vitest-environment jsdom
import { ActiveSelection, Canvas, FabricImage, Group, Rect } from 'fabric';
import { afterEach, expect, it, vi } from 'vitest';
import { createEditorVectorInstance } from '../../../features/editor/document/vector-element';
import { prepareEditorVectorDefinition } from '../../objects/vector-elements/prepare';
import {
  createEditorVectorRuntime,
  getEditorVectorDefinition,
  updateEditorVectorRuntime,
} from '../../objects/vector-elements/runtime';
import { useEditorStore } from '../../state/useEditorStore';
import { collectEditorVectorDefinitions } from '../document/vector-elements';
import { createEditorVectorClipboard } from './vector-element-clipboard';
import { readEditorDrawingObject } from '../../drawing/object/metadata';
import { createEditorVectorCommands, type EditorVectorCommandContext } from './vector-elements';
const assetRef = {
  assetId: 'vector-asset',
  createdAt: 1,
  location: { kind: 'opfs' as const, objectKey: 'vector-object' },
  mimeType: 'application/json',
  sha256: null,
  size: 100,
};
const provenance = {
  sourceId: 'local',
  prefix: null,
  name: null,
  author: null,
  authorUrl: null,
  license: null,
  licenseUrl: null,
};
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="20" height="20" fill="red" stroke="blue" stroke-width="2"/></svg>';
const canvases: Canvas[] = [];
afterEach(async () => {
  await Promise.all(canvases.splice(0).map((canvas) => canvas.dispose()));
});
function fixture() {
  const canvas = new Canvas(undefined, { renderOnAddRemove: false });
  canvases.push(canvas);
  const controller: EditorVectorCommandContext = {
    canvas,
    source: {
      id: 'source',
      name: null,
      dataUrl: '',
      intrinsicWidth: 500,
      intrinsicHeight: 400,
      left: 0,
      top: 0,
      displayWidth: 500,
      displayHeight: 400,
      visible: true,
      locked: false,
    },
    layerMutationToken: 0,
    zoomLevel: 1,
    autosaveService: { adoptVectorAssets: vi.fn() },
    prepareObject: vi.fn(),
    nextLabelIndex: () => 1,
    commitHistory: vi.fn(),
    syncRuntimeState: vi.fn(),
    switchToSelectTool: vi.fn(),
    ensureBrowserFrameOnTop: vi.fn(),
    withHistoryMuted: (callback) => callback(),
    buildViewportState: () => ({
      zoomPercent: 100,
      canvasWidth: 500,
      canvasHeight: 400,
      sourceWidth: 500,
      sourceHeight: 400,
      sourceName: null,
      viewportWidth: 300,
      viewportHeight: 200,
      scrollLeft: 0,
      scrollTop: 0,
      scaledCanvasWidth: 500,
      scaledCanvasHeight: 400,
      canvasOffsetLeft: 0,
      canvasOffsetTop: 0,
    }),
  };
  return { canvas, controller };
}
async function vector(canvas: Canvas) {
  const definition = await prepareEditorVectorDefinition(svg, provenance);
  const instance = createEditorVectorInstance(definition.id);
  instance.overrides.strokeScale = 2;
  const object = await createEditorVectorRuntime(definition, instance);
  object.sniptaleId = 'original';
  canvas.add(object);
  canvas.setActiveObject(object);
  return { object, definition };
}
it('pastes a grouped vector closure after deletion and keeps its palette editable', async () => {
  const { canvas, controller } = fixture();
  const { object, definition } = await vector(canvas);
  const group = new Group([object]);
  group.sniptaleType = 'group';
  group.sniptaleRole = 'annotation';
  group.sniptaleId = 'group';
  canvas.remove(object);
  canvas.add(group);
  canvas.setActiveObject(group);
  const publish = vi.fn().mockResolvedValue(assetRef);
  const clipboard = createEditorVectorClipboard(controller, { publish }, vi.fn());
  expect(await clipboard.copyVectorSelection()).toBe(true);
  canvas.remove(group);
  canvas.discardActiveObject();
  expect(collectEditorVectorDefinitions(canvas)).toEqual({});
  expect(await clipboard.pasteVectorSelection({ x: 150, y: 100 })).toBe(true);
  const pasted = canvas.getActiveObject();
  if (!(pasted instanceof Group)) throw new Error('Missing pasted group');
  const pastedVector = pasted.item(0);
  if (!(pastedVector instanceof Group)) throw new Error('Missing pasted vector');
  expect(pasted.sniptaleId).not.toBe('group');
  expect(pastedVector.sniptaleId).not.toBe('original');
  expect(getEditorVectorDefinition(pastedVector)).toEqual(definition);
  const changed = createEditorVectorInstance(definition.id);
  changed.overrides.colors[definition.slots[0]!.id] = '#00ff00';
  updateEditorVectorRuntime(pastedVector, changed);
  expect(object.sniptaleVectorElement?.overrides.colors).toEqual({});
  expect(publish).toHaveBeenCalledOnce();
  expect(controller.autosaveService?.adoptVectorAssets).toHaveBeenCalledWith(
    new Map([[definition.id, assetRef]])
  );
  expect(controller.commitHistory).toHaveBeenCalledOnce();
  expect(await clipboard.pasteVectorSelection()).toBe(true);
  expect(controller.commitHistory).toHaveBeenCalledTimes(2);
  expect(canvas.getObjects()).toHaveLength(2);
  group.dispose();
});
it('leaves the document untouched on failed publication, then retries from the same clipboard', async () => {
  const { canvas, controller } = fixture();
  const { object } = await vector(canvas);
  const publish = vi
    .fn()
    .mockRejectedValueOnce(new Error('Disk unavailable'))
    .mockResolvedValue(assetRef);
  const clipboard = createEditorVectorClipboard(controller, { publish }, vi.fn());
  await clipboard.copyVectorSelection();
  await expect(clipboard.pasteVectorSelection()).rejects.toThrow('Disk unavailable');
  expect(canvas.getObjects()).toEqual([object]);
  expect(controller.commitHistory).not.toHaveBeenCalled();
  expect(await clipboard.pasteVectorSelection()).toBe(true);
  expect(canvas.getObjects()).toHaveLength(2);
});
it('rejects a late paste after project replacement without discarding copied resources', async () => {
  const { canvas, controller } = fixture();
  const { object } = await vector(canvas);
  let release: () => void = () => {};
  let reached: () => void = () => {};
  const started = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const publish = vi.fn(
    () =>
      new Promise<typeof assetRef>((resolve) => {
        release = () => resolve(assetRef);
        reached();
      })
  );
  const clipboard = createEditorVectorClipboard(controller, { publish }, vi.fn());
  await clipboard.copyVectorSelection();
  const paste = clipboard.pasteVectorSelection();
  await started;
  controller.source = { ...controller.source!, id: 'new-project' };
  release();
  expect(await paste).toBe(false);
  expect(controller.autosaveService?.adoptVectorAssets).not.toHaveBeenCalled();
  expect(canvas.getObjects()).toEqual([object]);
  expect(controller.commitHistory).not.toHaveBeenCalled();
});
it('cancels drafts before copying, so pasted strokes and opacity use accepted values', async () => {
  const { canvas, controller } = fixture();
  const { object, definition } = await vector(canvas);
  const publish = vi.fn().mockResolvedValue(assetRef);
  const commands = createEditorVectorCommands(controller, { publish });
  const clipboard = createEditorVectorClipboard(
    controller,
    { publish },
    commands.cancelVectorStyleEdit
  );
  const edit = await commands.beginVectorStyleEdit();
  edit!.preview({ strokeScale: 5, opacity: 0.1, colors: { [definition.slots[0]!.id]: '#00ff00' } });
  expect(await clipboard.copyVectorSelection()).toBe(true);
  expect(object.opacity).toBe(1);
  expect(await clipboard.pasteVectorSelection()).toBe(true);
  const clone = canvas.getActiveObject();
  expect(clone?.sniptaleVectorElement).toEqual(object.sniptaleVectorElement);
  expect(clone?.opacity).toBe(1);
  expect(edit!.commit()).toBe(false);
  expect(controller.commitHistory).toHaveBeenCalledOnce();
});

it('keeps world rotation, scale, and relative geometry when copying a transformed multi-selection', async () => {
  const { canvas, controller } = fixture();
  const { object: first } = await vector(canvas);
  const { object: second } = await vector(canvas);
  first.set({ left: 30, top: 40 });
  second.set({ left: 130, top: 80 });
  const selection = new ActiveSelection([first, second], { canvas });
  canvas.setActiveObject(selection);
  selection.set({ angle: 32, scaleX: 1.5, scaleY: 1.5 });
  const expected = [first.calcTransformMatrix(), second.calcTransformMatrix()];
  const clipboard = createEditorVectorClipboard(
    controller,
    { publish: vi.fn().mockResolvedValue(assetRef) },
    vi.fn()
  );
  expect(await clipboard.copyVectorSelection()).toBe(true);
  expect(await clipboard.pasteVectorSelection({ x: 250, y: 200 })).toBe(true);
  const pasted = canvas.getActiveObjects().map((object) => object.calcTransformMatrix());
  for (let index = 0; index < 2; index += 1)
    for (let component = 0; component < 4; component += 1)
      expect(pasted[index]![component]).toBeCloseTo(expected[index]![component]!, 9);
  // Fabric clone serialization rounds positions to four decimal places.
  expect(pasted[1]![4]! - pasted[0]![4]!).toBeCloseTo(expected[1]![4]! - expected[0]![4]!, 3);
  expect(pasted[1]![5]! - pasted[0]![5]!).toBeCloseTo(expected[1]![5]! - expected[0]![5]!, 3);
});

it('keeps the current inspector after pasted selection invokes the real select-tool store action', async () => {
  const { canvas, controller } = fixture();
  await vector(canvas);
  controller.switchToSelectTool = () => useEditorStore.getState().setActiveTool('select');
  const clipboard = createEditorVectorClipboard(
    controller,
    { publish: vi.fn().mockResolvedValue(assetRef) },
    vi.fn()
  );
  await clipboard.copyVectorSelection();
  useEditorStore.getState().setInspector('elements');
  expect(await clipboard.pasteVectorSelection()).toBe(true);
  expect(useEditorStore.getState()).toMatchObject({ inspector: 'elements', activeTool: 'select' });
  useEditorStore.getState().setInspector('tool');
});

it('reports live availability and retains copied vectors after deleting originals', async () => {
  const { canvas, controller } = fixture();
  const { object } = await vector(canvas);
  const clipboard = createEditorVectorClipboard(
    controller,
    { publish: vi.fn().mockResolvedValue(assetRef) },
    vi.fn()
  );
  expect(clipboard.getAvailability()).toEqual({ canCopy: true, canPaste: false });
  expect(await clipboard.copyVectorSelection()).toBe(true);
  canvas.remove(object);
  canvas.discardActiveObject();
  expect(clipboard.getAvailability()).toEqual({ canCopy: false, canPaste: true });
  expect(await clipboard.pasteVectorSelection()).toBe(true);
  expect(canvas.getActiveObject()?.sniptaleType).toBe('vector-element');
  object.dispose();
});

it('copies grouped vectors and ordinary vector annotations with independent identities', async () => {
  const { canvas, controller } = fixture();
  const { object } = await vector(canvas);
  const rectangle = new Rect({ left: 50, top: 20, width: 30, height: 15, fill: '#112233' });
  rectangle.sniptaleId = 'ordinary-rectangle';
  rectangle.sniptaleType = 'shape';
  rectangle.sniptaleRole = 'annotation';
  rectangle.sniptaleDrawingJson = JSON.stringify({
    version: 1,
    object: {
      id: 'ordinary-rectangle',
      kind: 'rectangle',
      bounds: { x: 50, y: 20, width: 30, height: 15 },
      color: '#112233',
      fillColor: null,
      width: 4,
    },
  });
  canvas.remove(object);
  const group = new Group([object, rectangle]);
  group.sniptaleType = 'group';
  group.sniptaleRole = 'annotation';
  group.sniptaleId = 'mixed-vector-group';
  canvas.add(group);
  canvas.setActiveObject(group);
  const clipboard = createEditorVectorClipboard(
    controller,
    { publish: vi.fn().mockResolvedValue(assetRef) },
    vi.fn()
  );
  expect(clipboard.getAvailability().canCopy).toBe(true);
  expect(await clipboard.copyVectorSelection()).toBe(true);
  canvas.remove(group);
  canvas.discardActiveObject();
  expect(await clipboard.pasteVectorSelection()).toBe(true);
  const pasted = canvas.getActiveObject();
  if (!(pasted instanceof Group)) throw new Error('Missing copied group');
  expect(pasted.getObjects().map((child) => child.sniptaleType)).toEqual([
    'vector-element',
    'shape',
  ]);
  expect(pasted.item(1)).toMatchObject({ fill: '#112233', width: 30, height: 15 });
  expect(pasted.item(1).sniptaleId).not.toBe('ordinary-rectangle');
  expect(readEditorDrawingObject(pasted.item(1))?.id).toBe(pasted.item(1).sniptaleId);
  expect(pasted.item(0).sniptaleVectorElement).toEqual(object.sniptaleVectorElement);
  group.dispose();
});

it('refuses a raster-containing group before replacing an accepted vector clipboard', async () => {
  const { canvas, controller } = fixture();
  const { object } = await vector(canvas);
  const clipboard = createEditorVectorClipboard(
    controller,
    { publish: vi.fn().mockResolvedValue(assetRef) },
    vi.fn()
  );
  expect(await clipboard.copyVectorSelection()).toBe(true);
  const image = new FabricImage(document.createElement('canvas'));
  image.sniptaleType = 'image';
  image.sniptaleRole = 'annotation';
  canvas.remove(object);
  const group = new Group([object, image]);
  group.sniptaleType = 'group';
  group.sniptaleRole = 'annotation';
  canvas.add(group);
  canvas.setActiveObject(group);
  expect(clipboard.getAvailability()).toEqual({ canCopy: false, canPaste: true });
  expect(await clipboard.copyVectorSelection()).toBe(false);
  canvas.remove(group);
  canvas.discardActiveObject();
  expect(await clipboard.pasteVectorSelection()).toBe(true);
  expect(canvas.getObjects()).toHaveLength(1);
  expect(canvas.getActiveObject()?.sniptaleType).toBe('vector-element');
  group.dispose();
});

it.each(['source-image', 'background'] as const)(
  'refuses a selection containing a %s root without accepting a clipboard',
  async (type) => {
    const { canvas, controller } = fixture();
    const { object } = await vector(canvas);
    const protectedRoot = new Rect({ width: 100, height: 100 });
    protectedRoot.sniptaleType = type;
    canvas.add(protectedRoot);
    canvas.setActiveObject(new ActiveSelection([object, protectedRoot], { canvas }));
    const clipboard = createEditorVectorClipboard(
      controller,
      { publish: vi.fn().mockResolvedValue(assetRef) },
      vi.fn()
    );
    expect(clipboard.getAvailability()).toEqual({ canCopy: false, canPaste: false });
    expect(await clipboard.copyVectorSelection()).toBe(false);
    expect(controller.commitHistory).not.toHaveBeenCalled();
  }
);

it('does not copy locked vectors or replace their completed clipboard payload', async () => {
  const { canvas, controller } = fixture();
  const { object } = await vector(canvas);
  const clipboard = createEditorVectorClipboard(
    controller,
    { publish: vi.fn().mockResolvedValue(assetRef) },
    vi.fn()
  );
  expect(await clipboard.copyVectorSelection()).toBe(true);
  object.sniptaleLocked = true;
  expect(clipboard.getAvailability()).toEqual({ canCopy: false, canPaste: true });
  expect(await clipboard.copyVectorSelection()).toBe(false);
  object.sniptaleLocked = false;
  expect(await clipboard.pasteVectorSelection()).toBe(true);
});

it('keeps actual vector viewport Rect clips copyable with the complete vector closure', async () => {
  const { canvas, controller } = fixture();
  const { object } = await vector(canvas);
  expect(object.clipPath).toBeInstanceOf(Rect);
  const clipboard = createEditorVectorClipboard(
    controller,
    { publish: vi.fn().mockResolvedValue(assetRef) },
    vi.fn()
  );
  expect(clipboard.getAvailability().canCopy).toBe(true);
  expect(await clipboard.copyVectorSelection()).toBe(true);
  expect(await clipboard.pasteVectorSelection()).toBe(true);
  expect(canvas.getActiveObject()?.clipPath).toBeInstanceOf(Rect);
});

it('keeps a retired clipboard alive until its pending paste releases it', async () => {
  const { canvas, controller } = fixture();
  const { object: first } = await vector(canvas);
  let release: () => void = () => {};
  let reached: () => void = () => {};
  const started = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const publish = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<typeof assetRef>((resolve) => {
          release = () => resolve(assetRef);
          reached();
        })
    )
    .mockResolvedValue(assetRef);
  const clipboard = createEditorVectorClipboard(controller, { publish }, vi.fn());
  expect(await clipboard.copyVectorSelection()).toBe(true);
  const disposed = vi.spyOn(Group.prototype, 'dispose');
  try {
    const paste = clipboard.pasteVectorSelection();
    await started;
    const { object: second, definition } = await vector(canvas);
    second.sniptaleId = 'second';
    updateEditorVectorRuntime(second, {
      ...createEditorVectorInstance(definition.id),
      overrides: { colors: { c0: '#00ff00' }, strokeScale: 1 },
    });
    expect(await clipboard.copyVectorSelection()).toBe(true);
    expect(disposed).not.toHaveBeenCalled();
    release();
    expect(await paste).toBe(true);
    const pasted = canvas.getActiveObject();
    expect(pasted?.sniptaleVectorElement?.overrides.colors).toEqual({});
    const retired = disposed.mock.contexts.filter(
      (value: unknown): value is Group =>
        value instanceof Group && value.sniptaleType === 'vector-element'
    );
    expect(retired).toHaveLength(1);
    expect(retired[0]?.sniptaleId).toBe('original');
    expect(retired[0]).not.toBe(first);
    expect(retired[0]).not.toBe(pasted);
    expect(await clipboard.pasteVectorSelection()).toBe(true);
    expect(canvas.getActiveObject()?.sniptaleVectorElement?.overrides.colors).toEqual({
      c0: '#00ff00',
    });
    expect(controller.commitHistory).toHaveBeenCalledTimes(2);
  } finally {
    disposed.mockRestore();
  }
});

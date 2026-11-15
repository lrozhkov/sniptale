// @vitest-environment jsdom
import { exportEditorDocumentViaController } from './document/export';
import { ActiveSelection, Canvas, Color, FabricImage, Group, type FabricObject } from 'fabric';
import { afterEach, expect, it, vi } from 'vitest';
import { createEditorVectorInstance } from '../../../features/editor/document/vector-element';
import * as preparation from '../../objects/vector-elements/prepare';
import {
  createEditorVectorRuntime,
  updateEditorVectorRuntime,
} from '../../objects/vector-elements/runtime';
import { useEditorStore } from '../../state/useEditorStore';
import { CUSTOM_JSON_PROPS } from '../../document/model/custom-json-props';
import { serializeEditorCanvasObject } from '../document/serialization';
import { bindEditorVectorCanvas, prepareEditorVectorCanvasLoad } from '../document/vector-elements';
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
  name: 'sample',
  author: null,
  authorUrl: null,
  license: null,
  licenseUrl: null,
};
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 12"><path fill="red" stroke="blue" d="M1 1h20v10h-20z"/></svg>';
const canvases: Canvas[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
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
      intrinsicWidth: 800,
      intrinsicHeight: 600,
      left: 0,
      top: 0,
      displayWidth: 800,
      displayHeight: 600,
      visible: true,
      locked: false,
    },
    layerMutationToken: 1,
    zoomLevel: 1,
    autosaveService: { adoptVectorAssets: vi.fn() },
    prepareObject: vi.fn(),
    nextLabelIndex: () => 1,
    commitHistory: vi.fn(),
    syncRuntimeState: vi.fn(),
    switchToSelectTool: vi.fn(),
    withHistoryMuted: (callback) => callback(),
    ensureBrowserFrameOnTop: vi.fn(),
    buildViewportState: () => ({
      zoomPercent: 100,
      canvasWidth: 800,
      canvasHeight: 600,
      sourceWidth: 800,
      sourceHeight: 600,
      sourceName: null,
      viewportWidth: 300,
      viewportHeight: 200,
      scrollLeft: 50,
      scrollTop: 20,
      scaledCanvasWidth: 800,
      scaledCanvasHeight: 600,
      canvasOffsetLeft: 0,
      canvasOffsetTop: 0,
    }),
  };
  return { canvas, controller };
}

it('gives an unnamed local vector a localized numbered layer label', async () => {
  const { canvas, controller } = fixture();
  const definition = await preparation.prepareEditorVectorDefinition(svg, {
    ...provenance,
    name: null,
  });
  const commands = createEditorVectorCommands(controller, { publish: vi.fn(async () => assetRef) });
  expect(await commands.insertVectorElement(definition)).toBe(true);
  expect(canvas.getActiveObject()?.sniptaleLabel).toMatch(/^(Vector|Вектор) 1$/u);
});

async function vector(canvas: Canvas, source = svg) {
  const definition = await preparation.prepareEditorVectorDefinition(source, provenance);
  const object = await createEditorVectorRuntime(
    definition,
    createEditorVectorInstance(definition.id)
  );
  canvas.add(object);
  canvas.setActiveObject(object);
  return { definition, object };
}

it('publishes before insertion and selects one independently editable vector with one history entry', async () => {
  const { canvas, controller } = fixture();
  const definition = await preparation.prepareEditorVectorDefinition(svg, provenance);
  let release: () => void = () => {
    throw new Error('Publication has not started');
  };
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
  const commands = createEditorVectorCommands(controller, { publish });
  const insertion = commands.insertVectorElement(definition);
  await started;
  expect(canvas.getObjects()).toHaveLength(0);
  expect(controller.commitHistory).not.toHaveBeenCalled();
  release();
  expect(await insertion).toBe(true);
  const object = canvas.getActiveObject();
  expect(object).toBeInstanceOf(Group);
  expect(object).toMatchObject({
    left: 200,
    top: 120,
    scaleX: 5,
    scaleY: 5,
    sniptaleType: 'vector-element',
  });
  expect(controller.switchToSelectTool).toHaveBeenCalledOnce();
  expect(controller.commitHistory).toHaveBeenCalledOnce();
  expect(publish).toHaveBeenCalledWith(definition);
  expect(controller.autosaveService?.adoptVectorAssets).toHaveBeenCalledWith(
    new Map([[definition.id, assetRef]])
  );
});

it.each(['source', 'canvas', 'token'] as const)(
  'rejects a stale %s after publication without inserting into another document',
  async (cause) => {
    const { canvas, controller } = fixture();
    const definition = await preparation.prepareEditorVectorDefinition(svg, provenance);
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
    const pending = createEditorVectorCommands(controller, { publish }).insertVectorElement(
      definition,
      { x: 10, y: 20 }
    );
    await started;
    if (cause === 'source') controller.source = { ...controller.source!, id: 'replacement' };
    if (cause === 'canvas') controller.canvas = null;
    if (cause === 'token') controller.layerMutationToken += 1;
    release();
    expect(await pending).toBe(false);
    expect(controller.autosaveService?.adoptVectorAssets).not.toHaveBeenCalled();
    expect(canvas.getObjects()).toHaveLength(0);
    expect(controller.commitHistory).not.toHaveBeenCalled();
  }
);

it('keeps canvas/history unchanged on publication refusal and permits retry', async () => {
  const { canvas, controller } = fixture();
  const definition = await preparation.prepareEditorVectorDefinition(svg, provenance);
  const publish = vi
    .fn()
    .mockRejectedValueOnce(new Error('Publication refused'))
    .mockResolvedValue(assetRef);
  const commands = createEditorVectorCommands(controller, { publish });
  await expect(commands.insertVectorElement(definition)).rejects.toThrow('Publication refused');
  expect(canvas.getObjects()).toHaveLength(0);
  expect(controller.commitHistory).not.toHaveBeenCalled();
  expect(await commands.insertVectorElement(definition, { x: 75, y: 30 })).toBe(true);
  expect(canvas.getActiveObject()).toMatchObject({ left: 75, top: 30 });
  expect(controller.commitHistory).toHaveBeenCalledOnce();
});

it('refuses forged profile metadata before publication', async () => {
  const { canvas, controller } = fixture();
  const definition = await preparation.prepareEditorVectorDefinition(svg, provenance);
  const publish = vi.fn();
  await expect(
    createEditorVectorCommands(controller, { publish }).insertVectorElement({
      ...definition,
      svg: '<svg><script/></svg>',
    })
  ).rejects.toThrow();
  expect(publish).not.toHaveBeenCalled();
  expect(canvas.getObjects()).toHaveLength(0);
});

it('previews many palette/opacity frames without parsing or serializing drafts, then commits once', async () => {
  const { canvas, controller } = fixture();
  const { definition, object } = await vector(canvas);
  const original = structuredClone(object.sniptaleVectorElement);
  const session = await createEditorVectorCommands(controller, {
    publish: vi.fn(),
  }).beginVectorStyleEdit();
  const validate = vi.spyOn(preparation, 'validateEditorVectorDefinition');
  const slot = definition.slots[0]!.id;
  expect(session).not.toBeNull();
  expect(session!.preview({ colors: { [slot]: '#00ff00' }, opacity: 0.4, strokeScale: 2 })).toBe(
    true
  );
  expect(session!.preview({ colors: { [slot]: '#0000ff' }, opacity: 0.2 })).toBe(true);
  expect(object.opacity).toBe(0.2);
  expect(object.sniptaleVectorElement).toEqual(original);
  expect(serializeEditorCanvasObject(object)).toMatchObject({
    opacity: 1,
    sniptaleVectorElement: original,
  });
  expect(validate).not.toHaveBeenCalled();
  expect(controller.commitHistory).not.toHaveBeenCalled();
  expect(session!.commit()).toBe(true);
  expect(object.sniptaleVectorElement?.overrides).toEqual({
    colors: { [slot]: '#0000ff' },
    strokeScale: 2,
  });
  expect(serializeEditorCanvasObject(object).opacity).toBe(0.2);
  expect(controller.commitHistory).toHaveBeenCalledOnce();
  expect(session!.commit()).toBe(false);
});

it('cancels on selection replacement and never creates history for the canceled gesture', async () => {
  const { canvas, controller } = fixture();
  const { definition, object } = await vector(canvas);
  const { object: other } = await vector(canvas);
  canvas.setActiveObject(object);
  const session = await createEditorVectorCommands(controller, {
    publish: vi.fn(),
  }).beginVectorStyleEdit();
  const original = structuredClone(object.sniptaleVectorElement);
  session!.preview({ colors: { [definition.slots[0]!.id]: '#00ff00' }, opacity: 0 });
  canvas.setActiveObject(other);
  expect(object.opacity).toBe(1);
  expect(object.sniptaleVectorElement).toEqual(original);
  expect(session!.commit()).toBe(false);
  expect(controller.commitHistory).not.toHaveBeenCalled();
});

it('applies one palette to same-asset multi-selection and resets source style without changing siblings', async () => {
  const { canvas, controller } = fixture();
  const { definition, object: first } = await vector(canvas);
  const { object: second } = await vector(canvas);
  const { object: sibling } = await vector(canvas);
  canvas.setActiveObject(new ActiveSelection([first, second], { canvas }));
  const commands = createEditorVectorCommands(controller, { publish: vi.fn() });
  const edit = await commands.beginVectorStyleEdit();
  const slot = definition.slots[0]!.id;
  edit!.preview({ colors: { [slot]: '#00ff00' }, strokeScale: 3 });
  edit!.commit();
  expect(first.sniptaleVectorElement).toEqual(second.sniptaleVectorElement);
  expect(sibling.sniptaleVectorElement?.overrides.colors).toEqual({});
  const reset = await commands.beginVectorStyleEdit();
  reset!.preview({ reset: true });
  reset!.commit();
  expect(first.sniptaleVectorElement).toEqual(createEditorVectorInstance(definition.id));
  expect(controller.commitHistory).toHaveBeenCalledTimes(2);
});

it('permits opacity only for mixed assets and rejects invalid palette patches atomically', async () => {
  const { canvas, controller } = fixture();
  const { object: first, definition } = await vector(canvas);
  const { object: second } = await vector(canvas, svg.replace('red', 'green'));
  canvas.setActiveObject(new ActiveSelection([first, second], { canvas }));
  const session = await createEditorVectorCommands(controller, {
    publish: vi.fn(),
  }).beginVectorStyleEdit();
  expect(session!.preview({ colors: { [definition.slots[0]!.id]: '#00ff00' } })).toBe(false);
  expect(session!.preview({ strokeScale: 2 })).toBe(false);
  expect(session!.preview({ opacity: 0.5 })).toBe(true);
  expect(session!.commit()).toBe(true);
  expect(first.opacity).toBe(0.5);
  expect(second.opacity).toBe(0.5);
  expect(first.sniptaleVectorElement?.overrides.colors).toEqual({});
  expect(controller.commitHistory).toHaveBeenCalledOnce();
});

it('cancels the preceding gesture and prepares unbound clones only at gesture start', async () => {
  const { canvas, controller } = fixture();
  const { definition, object } = await vector(canvas);
  const clone = await object.clone([...CUSTOM_JSON_PROPS]);
  canvas.add(clone);
  canvas.setActiveObject(clone);
  const commands = createEditorVectorCommands(controller, { publish: vi.fn() });
  const first = await commands.beginVectorStyleEdit();
  first!.preview({ opacity: 0.4 });
  const second = await commands.beginVectorStyleEdit();
  expect(clone.opacity).toBe(1);
  expect(first!.commit()).toBe(false);
  expect(second!.preview({ colors: { [definition.slots[0]!.id]: '#ff00ff' } })).toBe(true);
  second!.cancel();
  expect(clone.sniptaleVectorElement).toEqual(createEditorVectorInstance(definition.id));
  expect(controller.commitHistory).not.toHaveBeenCalled();
  updateEditorVectorRuntime(object, createEditorVectorInstance(definition.id));
});

it('rejects an insertion when a document transition completed while publication was pending', async () => {
  const { runEditorDocumentTransition } = await import('../history/transition-queue');
  const { canvas, controller } = fixture();
  const definition = await preparation.prepareEditorVectorDefinition(svg, provenance);
  let release: () => void = () => {};
  let reached: () => void = () => {};
  const started = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const publisher = {
    publish: vi.fn(
      () =>
        new Promise<typeof assetRef>((resolve) => {
          release = () => resolve(assetRef);
          reached();
        })
    ),
  };
  const insertion = createEditorVectorCommands(controller, publisher).insertVectorElement(
    definition
  );
  await started;
  await runEditorDocumentTransition(canvas, async () => {});
  release();
  expect(await insertion).toBe(false);
  expect(controller.autosaveService?.adoptVectorAssets).not.toHaveBeenCalled();
  expect(canvas.getObjects()).toHaveLength(0);
  expect(controller.commitHistory).not.toHaveBeenCalled();
});

it('refuses commands during a pending document transition and cancels a stale gesture', async () => {
  const { runEditorDocumentTransition } = await import('../history/transition-queue');
  const { canvas, controller } = fixture();
  const { definition, object } = await vector(canvas);
  const publish = vi.fn();
  const commands = createEditorVectorCommands(controller, { publish });
  const edit = await commands.beginVectorStyleEdit();
  edit!.preview({ opacity: 0.3 });
  let release: () => void = () => {};
  const transition = runEditorDocumentTransition(
    canvas,
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      })
  );
  expect(await commands.insertVectorElement(definition)).toBe(false);
  expect(await commands.beginVectorStyleEdit()).toBeNull();
  expect(edit!.commit()).toBe(false);
  expect(object.opacity).toBe(1);
  expect(publish).not.toHaveBeenCalled();
  expect(controller.commitHistory).not.toHaveBeenCalled();
  release();
  await transition;
});

it('clones accepted vector style when duplicate interrupts an active draft', async () => {
  const { duplicateEditorSelection } =
    await import('../public-actions/selection/objects/duplicate');
  const { canvas, controller } = fixture();
  const { object } = await vector(canvas);
  const commands = createEditorVectorCommands(controller, { publish: vi.fn() });
  const edit = await commands.beginVectorStyleEdit();
  edit!.preview({ strokeScale: 4, opacity: 0.1 });
  await commands.duplicateWithAcceptedVectorStyle(() =>
    duplicateEditorSelection({
      canvas,
      prepareObject: controller.prepareObject,
      nextLabelIndex: () => 2,
      commitHistory: controller.commitHistory,
      syncRuntimeState: controller.syncRuntimeState,
    })
  );
  const clone = canvas.getActiveObject();
  expect(object.opacity).toBe(1);
  expect(clone?.opacity).toBe(1);
  expect(clone?.sniptaleVectorElement).toEqual(object.sniptaleVectorElement);
  expect(edit!.commit()).toBe(false);
  expect(controller.commitHistory).toHaveBeenCalledOnce();
});

it('preserves the live inspector at insertion acceptance through the real select-tool store side effect', async () => {
  const { canvas, controller } = fixture();
  const definition = await preparation.prepareEditorVectorDefinition(svg, provenance);
  controller.switchToSelectTool = () => useEditorStore.getState().setActiveTool('select');
  useEditorStore.getState().setInspector('elements');
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
  const pending = createEditorVectorCommands(controller, { publish }).insertVectorElement(
    definition
  );
  await started;
  useEditorStore.getState().setInspector('image-size');
  release();
  expect(await pending).toBe(true);
  expect(useEditorStore.getState()).toMatchObject({
    inspector: 'image-size',
    activeTool: 'select',
  });
  expect(canvas.getActiveObject()?.sniptaleType).toBe('vector-element');
  useEditorStore.getState().setInspector('tool');
});

it.each([false, true])(
  'keeps an open style session through actual document capture only for an unchanged Fabric source, changed=%s',
  async (changed) => {
    const { canvas, controller } = fixture();
    const element = document.createElement('canvas');
    element.width = 800;
    element.height = 600;
    const image = new FabricImage(element, { left: 0, top: 0, originX: 'left', originY: 'top' });
    image.sniptaleType = 'source-image';
    image.sniptaleRole = 'source';
    image.sniptaleId = 'source';
    image.sniptaleLocked = false;
    canvas.add(image);
    if (!controller.source) throw new Error('Missing source');
    controller.source.dataUrl = element.toDataURL();
    const originalSource = controller.source;
    const { object } = await vector(canvas);
    const accepted = structuredClone(object.sniptaleVectorElement);
    const commands = createEditorVectorCommands(controller, {
      publish: vi.fn(async () => assetRef),
    });
    const edit = await commands.beginVectorStyleEdit();
    if (!edit) throw new Error('Missing vector style edit');
    if (changed) image.set('left', 20);
    const capturedDocument = exportEditorDocumentViaController({
      canvas,
      canvasDocumentSize: { width: 800, height: 600 },
      get source() {
        return controller.source;
      },
      setSource(source) {
        controller.source = source;
      },
    });
    expect(capturedDocument.version).toBe(4);
    expect(capturedDocument.vectorDefinitions).toBeDefined();
    expect(controller.commitHistory).not.toHaveBeenCalled();
    expect(object.sniptaleVectorElement).toEqual(accepted);
    if (changed) {
      expect(controller.source).not.toBe(originalSource);
      expect(controller.source?.left).toBe(20);
      expect(edit.preview({ colors: { c0: '#00ff00' } })).toBe(false);
      expect(edit.commit()).toBe(false);
      expect(controller.commitHistory).not.toHaveBeenCalled();
    } else {
      expect(controller.source).toBe(originalSource);
      expect(edit.preview({ colors: { c0: '#00ff00' } })).toBe(true);
      expect(edit.commit()).toBe(true);
      expect(object.sniptaleVectorElement?.overrides.colors).toEqual({ c0: '#00ff00' });
      expect(controller.commitHistory).toHaveBeenCalledOnce();
    }
  }
);

function vectorPaintedLeaf(object: FabricObject): FabricObject {
  if (object instanceof Group) {
    for (const child of object.getObjects()) {
      if (child instanceof Group) return vectorPaintedLeaf(child);
      if (child.stroke) return child;
    }
  }
  throw new Error('Missing painted vector leaf');
}

it(
  'preserves insertion palette, alpha, opacity and stroke scale ' +
    'through serialization and runtime restoration',
  async () => {
    const { canvas, controller } = fixture();
    const definition = await preparation.prepareEditorVectorDefinition(svg, provenance);
    const originalDefinition = structuredClone(definition);
    const colors = { [definition.slots[0]!.id]: '#00ff0080' };
    const publish = vi.fn(async () => assetRef);
    const commands = createEditorVectorCommands(controller, { publish });
    expect(
      await commands.insertVectorElement(definition, { x: 75, y: 30 }, colors, {
        opacity: 0.6,
        strokeScale: 1.5,
      })
    ).toBe(true);
    const object = canvas.getActiveObject();
    if (!object) throw new Error('Missing inserted vector');
    const instance = {
      ...createEditorVectorInstance(definition.id),
      overrides: { colors, strokeScale: 1.5 },
    };
    expect(object.sniptaleVectorElement).toEqual(instance);
    expect(object.opacity).toBe(0.6);
    const leaf = vectorPaintedLeaf(object);
    expect(typeof leaf.fill).toBe('string');
    expect(new Color(typeof leaf.fill === 'string' ? leaf.fill : '').toHexa()).toBe('00FF0080');
    expect(leaf.strokeWidth).toBe(1.5);
    const serialized = serializeEditorCanvasObject(object);
    expect(serialized).toMatchObject({
      opacity: 0.6,
      sniptaleVectorElement: instance,
      objects: [],
    });
    const prepared = await prepareEditorVectorCanvasLoad(
      JSON.stringify({ version: '7.2.0', objects: [serialized] }),
      { [definition.id]: definition }
    );
    const restored = fixture().canvas;
    await restored.loadFromJSON(prepared.canvasJson);
    await bindEditorVectorCanvas(restored, prepared.definitions);
    const revived = restored.getObjects()[0];
    if (!revived) throw new Error('Missing restored vector');
    expect(revived.sniptaleVectorElement).toEqual(instance);
    expect(revived.opacity).toBe(0.6);
    expect(revived).toMatchObject({ left: 75, top: 30 });
    const restoredLeaf = vectorPaintedLeaf(revived);
    expect(new Color(typeof restoredLeaf.fill === 'string' ? restoredLeaf.fill : '').toHexa()).toBe(
      '00FF0080'
    );
    expect(restoredLeaf.strokeWidth).toBe(1.5);
    expect(restoredLeaf.stroke).toBe(leaf.stroke);
    expect(definition).toEqual(originalDefinition);
    expect(publish).toHaveBeenCalledExactlyOnceWith(definition);
    expect(controller.commitHistory).toHaveBeenCalledOnce();
  }
);

it('captures insertion style before awaits so caller mutation cannot change accepted artwork', async () => {
  const { canvas, controller } = fixture();
  const definition = await preparation.prepareEditorVectorDefinition(svg, provenance);
  const slot = definition.slots[0]!.id;
  const colors = { [slot]: '#00ff0080' };
  const style = { opacity: 0.6, strokeScale: 1.5 };
  let release: () => void = () => {
    throw new Error('Publication has not started');
  };
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
  const pending = createEditorVectorCommands(controller, { publish }).insertVectorElement(
    definition,
    undefined,
    colors,
    style
  );
  colors[slot] = '#ff0000';
  style.opacity = 0.2;
  style.strokeScale = 2;
  await started;
  colors[slot] = '#0000ff';
  style.opacity = 0.1;
  style.strokeScale = 3;
  expect(canvas.getObjects()).toHaveLength(0);
  expect(controller.commitHistory).not.toHaveBeenCalled();
  release();
  expect(await pending).toBe(true);
  expect(canvas.getActiveObject()).toMatchObject({
    opacity: 0.6,
    sniptaleVectorElement: { overrides: { colors: { [slot]: '#00ff0080' }, strokeScale: 1.5 } },
  });
  expect(controller.commitHistory).toHaveBeenCalledOnce();
});

it.each([
  ['negative opacity', { opacity: -0.1, strokeScale: 1 }, {}],
  ['opacity above one', { opacity: 1.1, strokeScale: 1 }, {}],
  ['nonfinite opacity', { opacity: Number.NaN, strokeScale: 1 }, {}],
  ['stroke below minimum', { opacity: 1, strokeScale: 0 }, {}],
  ['stroke above maximum', { opacity: 1, strokeScale: 101 }, {}],
  ['nonfinite stroke', { opacity: 1, strokeScale: Number.POSITIVE_INFINITY }, {}],
  ['invalid palette color', { opacity: 1, strokeScale: 1 }, { c0: 'url(https://unsafe.example/)' }],
  ['unknown palette slot', { opacity: 1, strokeScale: 1 }, { missing: '#00ff00' }],
] as const)('refuses %s before asset publication or history', async (_name, style, colors) => {
  const { canvas, controller } = fixture();
  const definition = await preparation.prepareEditorVectorDefinition(svg, provenance);
  const publish = vi.fn(async () => assetRef);
  const commands = createEditorVectorCommands(controller, { publish });
  const insertion = commands.insertVectorElement(definition, undefined, colors, style);
  if (Object.keys(colors).length)
    await expect(insertion).rejects.toBeInstanceOf(preparation.EditorVectorValidationError);
  else await expect(insertion).resolves.toBe(false);
  expect(canvas.getObjects()).toHaveLength(0);
  expect(controller.commitHistory).not.toHaveBeenCalled();
  expect(controller.autosaveService?.adoptVectorAssets).not.toHaveBeenCalled();
  expect(publish).not.toHaveBeenCalled();
});

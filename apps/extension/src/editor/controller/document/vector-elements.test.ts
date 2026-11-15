// @vitest-environment jsdom
import { CUSTOM_JSON_PROPS } from '../../document/model';
import { Canvas, Group, Path, Rect } from 'fabric';
import { expect, it, vi } from 'vitest';
import {
  DEFAULT_EDITOR_FRAME_SETTINGS,
  DEFAULT_BROWSER_FRAME_STATE,
} from '../../../features/editor/document/constants';
import { buildEditorCanvasDocument } from './export';
import { createEditorVectorInstance } from '../../../features/editor/document/vector-element';
import { prepareEditorVectorDefinition } from '../../objects/vector-elements/prepare';
import {
  createEditorVectorRuntime,
  updateEditorVectorRuntime,
  previewEditorVectorRuntime,
  previewEditorVectorOpacity,
  commitEditorVectorOpacity,
  cancelEditorVectorOpacity,
} from '../../objects/vector-elements/runtime';
import { serializeCanvasObjects, serializeEditorCanvasObject } from './serialization';
import {
  collectEditorVectorDefinitions,
  prepareEditorVectorCanvasLoad,
  bindEditorVectorCanvas,
} from './vector-elements';

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
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="1" y="2" width="20" height="19" fill="red"/></svg>';

it('keeps ordinary group serialization and nested full path geometry compatible with Fabric', () => {
  const path = new Path('M0 0L20 10L40 0');
  const group = new Group([new Rect({ width: 10, height: 5 }), new Group([path])], {
    subTargetCheck: true,
    interactive: true,
  });
  expect(serializeEditorCanvasObject(group)).toEqual(
    group.toObject([
      'sniptaleRole',
      'sniptaleType',
      'sniptaleId',
      // No custom metadata is present; undefined values do not affect structural comparison.
    ])
  );
  group.includeDefaultValues = false;
  const actual = serializeEditorCanvasObject(group);
  expect(JSON.parse(JSON.stringify(actual))).toEqual(JSON.parse(JSON.stringify(group.toObject())));
});

it('stores nested ordered placeholders, definitions once, and restores clones and palettes offline', async () => {
  const definition = await prepareEditorVectorDefinition(svg, provenance);
  const vector = await createEditorVectorRuntime(
    definition,
    createEditorVectorInstance(definition.id)
  );
  vector.set({ left: 30, top: 20, angle: 17, scaleX: 2, flipY: true });
  const outer = new Group([
    new Rect({ width: 5, height: 8 }),
    new Group([vector]),
    new Rect({ width: 7, height: 9 }),
  ]);
  outer.sniptaleRole = 'annotation';
  const canvas = new Canvas(undefined, { renderOnAddRemove: false });
  const restored = new Canvas(undefined, { renderOnAddRemove: false });
  try {
    canvas.add(outer);
    expect(collectEditorVectorDefinitions(canvas)).toEqual({ [definition.id]: definition });
    const clone = await outer.clone([...CUSTOM_JSON_PROPS]);
    canvas.add(clone);
    const definitions = collectEditorVectorDefinitions(canvas);
    expect(Object.keys(definitions)).toEqual([definition.id]);
    const json = serializeCanvasObjects(canvas);
    const serialized = JSON.parse(json);
    expect(serialized.objects).toHaveLength(2);
    expect(serialized.objects[0].objects.map((object: { type: string }) => object.type)).toEqual([
      'Rect',
      'Group',
      'Rect',
    ]);
    expect(serialized.objects[0].objects[1].objects[0].objects).toEqual([]);
    expect(serialized.objects[1].objects[1].objects[0].objects).toEqual([]);
    expect(json).not.toContain('<svg');
    const network = vi.spyOn(globalThis, 'fetch');
    const load = await prepareEditorVectorCanvasLoad(json, definitions);
    await restored.loadFromJSON(load.canvasJson);
    await bindEditorVectorCanvas(restored, load.definitions);
    expect(network).not.toHaveBeenCalled();
    network.mockRestore();
    expect(serializeCanvasObjects(restored)).toBe(json);
    const loadedOuter = restored.item(0);
    if (!(loadedOuter instanceof Group)) throw new Error('Missing group');
    const nested = loadedOuter.item(1);
    if (!(nested instanceof Group)) throw new Error('Missing nested group');
    const loaded = nested.item(0);
    if (!(loaded instanceof Group)) throw new Error('Missing vector');
    updateEditorVectorRuntime(loaded, {
      ...createEditorVectorInstance(definition.id),
      overrides: { colors: { c0: '#00ff00' }, strokeScale: 1 },
    });
    expect(loaded.sniptaleVectorElement?.overrides.colors).toEqual({ c0: '#00ff00' });
    expect(collectEditorVectorDefinitions(restored)).toEqual(definitions);
  } finally {
    await canvas.dispose();
    await restored.dispose();
  }
});

it('refuses unsafe or mismatched definitions before a canvas load can start', async () => {
  const definition = await prepareEditorVectorDefinition(svg, provenance);
  const placeholder = {
    type: 'Group',
    sniptaleType: 'vector-element',
    sniptaleVectorElement: createEditorVectorInstance(definition.id),
    objects: [],
  };
  const json = JSON.stringify({ objects: [placeholder] });
  await expect(prepareEditorVectorCanvasLoad(json, {})).rejects.toThrow();
  await expect(
    prepareEditorVectorCanvasLoad(json, {
      [definition.id]: { ...definition, svg: '<svg><script/></svg>' },
    })
  ).rejects.toThrow();
  await expect(
    prepareEditorVectorCanvasLoad(
      JSON.stringify({ objects: [{ ...placeholder, objects: [{ type: 'Rect' }] }] }),
      { [definition.id]: definition }
    )
  ).rejects.toThrow();
});

it('selects logical v4 only for documents containing vector instances', async () => {
  const canvas = new Canvas(undefined, { renderOnAddRemove: false });
  const options = {
    canvas,
    source: {
      id: 'source',
      dataUrl: 'data:image/png;base64,QUJDRA==',
      name: null,
      intrinsicWidth: 24,
      intrinsicHeight: 24,
      left: 0,
      top: 0,
      displayWidth: 24,
      displayHeight: 24,
      visible: true,
      locked: true,
    },
    canvasDocumentSize: { width: 24, height: 24 },
    frame: DEFAULT_EDITOR_FRAME_SETTINGS,
    browserFrame: DEFAULT_BROWSER_FRAME_STATE,
  };
  try {
    expect(buildEditorCanvasDocument(options).version).toBe(2);
    const definition = await prepareEditorVectorDefinition(svg, provenance);
    const runtime = await createEditorVectorRuntime(
      definition,
      createEditorVectorInstance(definition.id)
    );
    canvas.add(runtime);
    const document = buildEditorCanvasDocument(options);
    expect(document.version).toBe(4);
    expect(document.vectorDefinitions).toEqual({ [definition.id]: definition });
    expect(JSON.parse(document.canvasJson).objects[0].objects).toEqual([]);
    canvas.remove(runtime);
    expect(buildEditorCanvasDocument(options)).not.toHaveProperty('vectorDefinitions');
    expect(buildEditorCanvasDocument(options).version).toBe(2);
  } finally {
    await canvas.dispose();
  }
});

it('captures accepted palette and opacity during previews, then captures commit and cancel states', async () => {
  const definition = await prepareEditorVectorDefinition(svg, provenance);
  const instance = createEditorVectorInstance(definition.id);
  const runtime = await createEditorVectorRuntime(definition, instance);
  runtime.set('opacity', 0.6);
  const group = new Group([runtime]);
  const capture = () => {
    const serialized = serializeEditorCanvasObject(group) as {
      objects?: Array<{ opacity: number; sniptaleVectorElement: unknown }>;
    };
    return serialized.objects![0]!;
  };
  const preview = { ...instance, overrides: { colors: { c0: '#00ff00' }, strokeScale: 1 } };
  try {
    previewEditorVectorRuntime(runtime, preview);
    previewEditorVectorOpacity(runtime, 0.2);
    expect(runtime.opacity).toBe(0.2);
    expect(capture()).toMatchObject({ opacity: 0.6, sniptaleVectorElement: instance });
    previewEditorVectorOpacity(runtime, 0.3);
    expect(capture().opacity).toBe(0.6);
    updateEditorVectorRuntime(runtime, preview);
    commitEditorVectorOpacity(runtime);
    expect(capture()).toMatchObject({ opacity: 0.3, sniptaleVectorElement: preview });
    previewEditorVectorRuntime(runtime, instance);
    previewEditorVectorOpacity(runtime, 0.9);
    previewEditorVectorRuntime(runtime, preview);
    cancelEditorVectorOpacity(runtime);
    expect(runtime.opacity).toBe(0.3);
    expect(capture()).toMatchObject({ opacity: 0.3, sniptaleVectorElement: preview });
    runtime.set('opacity', 0);
    previewEditorVectorOpacity(runtime, 0.7);
    expect(capture().opacity).toBe(0);
    cancelEditorVectorOpacity(runtime);
    expect(capture().opacity).toBe(0);
  } finally {
    group.dispose();
  }
});

it.each(['before', 'after'] as const)(
  'collects an unbound clone %s its bound original without a prior canvas cache',
  async (order) => {
    const definition = await prepareEditorVectorDefinition(svg, provenance);
    const original = await createEditorVectorRuntime(
      definition,
      createEditorVectorInstance(definition.id)
    );
    const clone = await original.clone([...CUSTOM_JSON_PROPS]);
    const canvas = new Canvas(undefined, { renderOnAddRemove: false });
    try {
      canvas.add(...(order === 'before' ? [clone, original] : [original, clone]));
      expect(collectEditorVectorDefinitions(canvas)).toEqual({ [definition.id]: definition });
      canvas.remove(original);
      expect(collectEditorVectorDefinitions(canvas)).toEqual({ [definition.id]: definition });
      canvas.remove(clone);
      expect(collectEditorVectorDefinitions(canvas)).toEqual({});
    } finally {
      await canvas.dispose();
      original.dispose();
      clone.dispose();
    }
  }
);

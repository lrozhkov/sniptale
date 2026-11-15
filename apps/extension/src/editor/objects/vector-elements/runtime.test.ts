// @vitest-environment jsdom
import { FabricObject, Group, Path, Rect, StaticCanvas } from 'fabric';
import { describe, expect, it, vi } from 'vitest';
import { createEditorVectorInstance } from '../../../features/editor/document/vector-element';
import { prepareEditorVectorDefinition } from './prepare';
import {
  adoptEditorVectorRuntime,
  cancelEditorVectorOpacity,
  commitEditorVectorOpacity,
  createEditorVectorRuntime,
  getEditorVectorDefinition,
  getEditorVectorAcceptedOpacity,
  previewEditorVectorOpacity,
  previewEditorVectorRuntime,
  updateEditorVectorRuntime,
  withEditorVectorAcceptedRendering,
} from './runtime';

const provenance = {
  sourceId: 'local',
  prefix: null,
  name: null,
  author: null,
  authorUrl: null,
  license: null,
  licenseUrl: null,
};
const source =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" opacity="0.8">' +
  '<g opacity="0.5" transform="translate(5 6)">' +
  '<rect x="10" y="10" width="60" height="60" rx="4" fill="currentColor"/>' +
  '<g opacity="0.7">' +
  '<path fill="blue" fill-opacity="0.4" stroke="red" stroke-width="2" d="M30 30h60v60h-60z"/>' +
  '</g>' +
  '</g>' +
  '</svg>';

function leaves(object: FabricObject): FabricObject[] {
  return object instanceof Group ? object.getObjects().flatMap(leaves) : [object];
}

describe('vector runtime projection', () => {
  it('renders visible isolated SVG pixels when Fabric defaults use center origins', async () => {
    const originX = FabricObject.ownDefaults.originX;
    const originY = FabricObject.ownDefaults.originY;
    FabricObject.ownDefaults.originX = 'center';
    FabricObject.ownDefaults.originY = 'center';
    const canvas = new StaticCanvas(document.createElement('canvas'), {
      width: 100,
      height: 100,
      enableRetinaScaling: false,
    });
    try {
      const definition = await prepareEditorVectorDefinition(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g opacity="0.5"><rect x="10" y="10" width="60" height="60" fill="red"/><rect x="30" y="30" width="60" height="60" fill="blue"/></g></svg>',
        provenance
      );
      const group = await createEditorVectorRuntime(
        definition,
        createEditorVectorInstance(definition.id)
      );
      canvas.add(group);
      canvas.renderAll();
      expect(Array.from(canvas.getContext().getImageData(40, 40, 1, 1).data)).toEqual([
        0, 0, 255, 128,
      ]);
      expect(Array.from(canvas.getContext().getImageData(20, 20, 1, 1).data)).toEqual([
        255, 0, 0, 128,
      ]);
      expect(Array.from(canvas.getContext().getImageData(95, 95, 1, 1).data)).toEqual([0, 0, 0, 0]);
    } finally {
      if (originX === undefined) delete FabricObject.ownDefaults.originX;
      else FabricObject.ownDefaults.originX = originX;
      if (originY === undefined) delete FabricObject.ownDefaults.originY;
      else FabricObject.ownDefaults.originY = originY;
      await canvas.dispose();
    }
  });

  it('retains isolated own opacity, true primitives, transforms and intrinsic padding', async () => {
    const definition = await prepareEditorVectorDefinition(source, provenance);
    const group = await createEditorVectorRuntime(
      definition,
      createEditorVectorInstance(definition.id)
    );
    expect(group.width).toBe(100);
    expect(group.height).toBe(100);
    expect(group.left).toBe(0);
    expect(group.top).toBe(0);
    expect(group.originX).toBe('left');
    expect(group.originY).toBe('top');
    expect(group.clipPath?.originX).toBe('center');
    expect(group.clipPath?.originY).toBe('center');
    expect(group.clipPath?.left).toBe(0);
    expect(group.clipPath?.top).toBe(0);
    expect(group.opacity).toBe(1);
    const artwork = group.item(0);
    expect(artwork).toBeInstanceOf(Group);
    expect(artwork.opacity).toBe(0.8);
    if (!(artwork instanceof Group)) throw new Error('Missing artwork group.');
    const inner = artwork.item(0);
    expect(inner.opacity).toBe(0.5);
    expect(inner.objectCaching).toBe(true);
    artwork.ownCaching = true;
    expect(inner.needsItsOwnCache()).toBe(true);
    expect(inner.shouldCache()).toBe(true);
    const objects = leaves(group);
    expect(objects[0]).toBeInstanceOf(Rect);
    expect(objects[1]).toBeInstanceOf(Path);
    expect(objects.map((object) => object.opacity)).toEqual([1, 1]);
    expect(objects[0]?.getBoundingRect().left).toBeCloseTo(15, 5);
    expect(objects[0]?.getBoundingRect().top).toBeCloseTo(16, 5);
    expect(getEditorVectorDefinition(group)).toEqual(definition);
  });

  it('changes cached linked paint without parsing, geometry mutation or another instance changing', async () => {
    const definition = await prepareEditorVectorDefinition(source, provenance);
    const instance = createEditorVectorInstance(definition.id);
    const first = await createEditorVectorRuntime(definition, instance);
    const second = await createEditorVectorRuntime(definition, instance);
    const firstLeaves = leaves(first);
    const geometry = firstLeaves.map((object) => object.calcTransformMatrix());
    const unchanged = JSON.stringify(definition);
    const acceptedMetadata = first.sniptaleVectorElement;
    const colors = Object.fromEntries(definition.slots.map((slot) => [slot.id, '#00ff00']));
    const parse = vi.spyOn(DOMParser.prototype, 'parseFromString').mockImplementation(() => {
      throw new Error('Palette must not parse.');
    });
    try {
      previewEditorVectorRuntime(first, { ...instance, overrides: { colors, strokeScale: 3 } });
      expect(first.sniptaleVectorElement).toBe(acceptedMetadata);
      expect(firstLeaves[0]?.fill).toBe('rgba(0,255,0,1)');
      expect(firstLeaves[1]?.fill).toBe('rgba(0,255,0,0.4)');
      expect(firstLeaves[1]?.strokeWidth).toBe(6);
      expect(leaves(second)[1]?.strokeWidth).toBe(2);
      expect(leaves(second)[1]?.fill).toBe('rgba(0,0,255,0.4)');
      expect(firstLeaves.map((object) => object.calcTransformMatrix())).toEqual(geometry);
      expect(JSON.stringify(definition)).toBe(unchanged);
      updateEditorVectorRuntime(first, instance);
      expect(firstLeaves[1]?.fill).toBe('rgba(0,0,255,0.4)');
      expect(firstLeaves[1]?.strokeWidth).toBe(2);
      expect(parse).not.toHaveBeenCalled();
    } finally {
      parse.mockRestore();
    }
  });

  it('rebinds clone paint and base stroke widths and rejects invalid overrides before mutation', async () => {
    const definition = await prepareEditorVectorDefinition(source, provenance);
    const instance = createEditorVectorInstance(definition.id);
    const styled = { ...instance, overrides: { colors: { c0: '#ff0000' }, strokeScale: 2 } };
    const original = await createEditorVectorRuntime(definition, styled);
    previewEditorVectorRuntime(original, {
      ...instance,
      overrides: { colors: {}, strokeScale: 3 },
    });
    const clone = await original.clone();
    await adoptEditorVectorRuntime(clone, definition, styled);
    expect(getEditorVectorDefinition(clone)?.id).toBe(definition.id);
    expect(leaves(clone)[1]?.strokeWidth).toBe(4);
    updateEditorVectorRuntime(clone, instance);
    expect(leaves(clone)[1]?.strokeWidth).toBe(2);
    expect(leaves(original)[1]?.strokeWidth).toBe(6);
    const previous = clone.sniptaleVectorElement;
    expect(() =>
      updateEditorVectorRuntime(clone, {
        ...instance,
        overrides: { colors: { c999: '#ffffff' }, strokeScale: 1 },
      })
    ).toThrow('invalid-definition');
    expect(clone.sniptaleVectorElement).toBe(previous);
  });

  it('checks the full profile and digest before Fabric can consume stored SVG', async () => {
    const definition = await prepareEditorVectorDefinition(source, provenance);
    await expect(
      createEditorVectorRuntime(
        { ...definition, svg: '<svg><script/></svg>' },
        createEditorVectorInstance(definition.id)
      )
    ).rejects.toThrow();
  });

  it('keeps accepted opacity serializable during repeated drafts and restores zero on cancel', async () => {
    const definition = await prepareEditorVectorDefinition(source, provenance);
    const group = await createEditorVectorRuntime(
      definition,
      createEditorVectorInstance(definition.id)
    );
    const metadata = group.sniptaleVectorElement;
    group.set('opacity', 0);
    previewEditorVectorOpacity(group, 0.7);
    previewEditorVectorOpacity(group, 1);
    expect(group.opacity).toBe(1);
    expect(getEditorVectorAcceptedOpacity(group)).toBe(0);
    expect(JSON.stringify({ opacity: getEditorVectorAcceptedOpacity(group) })).toBe(
      '{"opacity":0}'
    );
    expect(group.sniptaleVectorElement).toBe(metadata);
    expect(group.item(0).opacity).toBe(0.8);
    cancelEditorVectorOpacity(group);
    expect(group.opacity).toBe(0);
    expect(getEditorVectorAcceptedOpacity(group)).toBe(0);
    cancelEditorVectorOpacity(group);
    expect(group.opacity).toBe(0);
  });

  it('commits opacity drafts independently and begins the next draft from the committed value', async () => {
    const definition = await prepareEditorVectorDefinition(source, provenance);
    const instance = createEditorVectorInstance(definition.id);
    const first = await createEditorVectorRuntime(definition, instance);
    const second = await createEditorVectorRuntime(definition, instance);
    const metadata = first.sniptaleVectorElement;
    previewEditorVectorOpacity(first, 0);
    previewEditorVectorOpacity(second, 0.6);
    commitEditorVectorOpacity(first);
    expect(getEditorVectorAcceptedOpacity(first)).toBe(0);
    expect(getEditorVectorAcceptedOpacity(second)).toBe(1);
    expect(second.opacity).toBe(0.6);
    previewEditorVectorOpacity(first, 0.5);
    expect(getEditorVectorAcceptedOpacity(first)).toBe(0);
    cancelEditorVectorOpacity(first);
    expect(first.opacity).toBe(0);
    commitEditorVectorOpacity(second);
    expect(getEditorVectorAcceptedOpacity(second)).toBe(0.6);
    expect(first.sniptaleVectorElement).toBe(metadata);
    commitEditorVectorOpacity(first);
    expect(first.opacity).toBe(0);
  });

  it('refuses invalid opacity before opening or changing a draft', async () => {
    const definition = await prepareEditorVectorDefinition(source, provenance);
    const group = await createEditorVectorRuntime(
      definition,
      createEditorVectorInstance(definition.id)
    );
    for (const value of [NaN, Infinity, -Infinity, -0.1, 1.1]) {
      expect(() => previewEditorVectorOpacity(group, value)).toThrow('invalid-definition');
      expect(group.opacity).toBe(1);
      expect(getEditorVectorAcceptedOpacity(group)).toBe(1);
    }
    previewEditorVectorOpacity(group, 0.4);
    expect(() => previewEditorVectorOpacity(group, NaN)).toThrow('invalid-definition');
    expect(group.opacity).toBe(0.4);
    expect(getEditorVectorAcceptedOpacity(group)).toBe(1);
    cancelEditorVectorOpacity(group);
    expect(group.opacity).toBe(1);
  });
});

it('temporarily projects only active drafts and preserves accepted metadata and draft lifetime', async () => {
  const definition = await prepareEditorVectorDefinition(source, provenance);
  const accepted = createEditorVectorInstance(definition.id);
  const object = await createEditorVectorRuntime(definition, accepted);
  const idle = await createEditorVectorRuntime(definition, accepted);
  const read = () =>
    leaves(object).map((leaf) => ({
      fill: leaf.fill,
      stroke: leaf.stroke,
      width: leaf.strokeWidth,
    }));
  const acceptedPaint = read();
  const metadata = structuredClone(object.sniptaleVectorElement);
  const draft = { ...accepted, overrides: { colors: { c0: '#00ff00' }, strokeScale: 2 } };
  previewEditorVectorRuntime(object, draft);
  previewEditorVectorOpacity(object, 0.2);
  const draftPaint = read();
  const idlePaint = vi.spyOn(leaves(idle)[0]!, 'set');
  const idleRoot = vi.spyOn(idle, 'set');
  try {
    const result = withEditorVectorAcceptedRendering([new Group([object]), idle], () => {
      expect(read()).toEqual(acceptedPaint);
      expect(object.opacity).toBe(1);
      expect(object.sniptaleVectorElement).toEqual(metadata);
      return 'drawn';
    });
    expect(result).toBe('drawn');
    expect(idlePaint).not.toHaveBeenCalled();
    expect(idleRoot).not.toHaveBeenCalled();
    expect(read()).toEqual(draftPaint);
    expect(object.opacity).toBe(0.2);
    expect(getEditorVectorAcceptedOpacity(object)).toBe(1);
    expect(object.sniptaleVectorElement).toEqual(metadata);
    updateEditorVectorRuntime(object, draft);
    commitEditorVectorOpacity(object);
    withEditorVectorAcceptedRendering([object], () => {
      expect(read()).toEqual(draftPaint);
      expect(object.opacity).toBe(0.2);
    });
  } finally {
    idlePaint.mockRestore();
    idleRoot.mockRestore();
    object.dispose();
    idle.dispose();
  }
});

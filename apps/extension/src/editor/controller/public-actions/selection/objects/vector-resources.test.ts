// @vitest-environment jsdom
import { Canvas, Group } from 'fabric';
import { expect, it } from 'vitest';
import { createEditorVectorInstance } from '../../../../../features/editor/document/vector-element';
import { CUSTOM_JSON_PROPS } from '../../../../document/model/custom-json-props';
import { prepareEditorVectorDefinition } from '../../../../objects/vector-elements/prepare';
import {
  createEditorVectorRuntime,
  getEditorVectorDefinition,
  updateEditorVectorRuntime,
} from '../../../../objects/vector-elements/runtime';
import { bindClonedVectorResources, collectSelectionVectorDefinitions } from './vector-resources';

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

it('captures one selected definition table recursively and rebinds clones after originals are removed', async () => {
  const canvas = new Canvas(undefined, { renderOnAddRemove: false });
  try {
    const definition = await prepareEditorVectorDefinition(svg, provenance);
    const instance = createEditorVectorInstance(definition.id);
    instance.overrides.strokeScale = 3;
    const first = await createEditorVectorRuntime(definition, instance);
    const second = await createEditorVectorRuntime(definition, instance);
    const group = new Group([first, new Group([second])]);
    group.sniptaleType = 'group';
    const unrelatedDefinition = await prepareEditorVectorDefinition(
      svg.replace('red', 'green'),
      provenance
    );
    const unrelated = await createEditorVectorRuntime(
      unrelatedDefinition,
      createEditorVectorInstance(unrelatedDefinition.id)
    );
    canvas.add(group, unrelated);
    const definitions = collectSelectionVectorDefinitions(canvas, [group]);
    expect(Object.keys(definitions)).toEqual([definition.id]);
    const clone = await group.clone([...CUSTOM_JSON_PROPS]);
    canvas.remove(group, unrelated);
    await bindClonedVectorResources([clone], definitions);
    const clonedFirst = clone.item(0);
    expect(clonedFirst).toBeInstanceOf(Group);
    if (!(clonedFirst instanceof Group)) throw new Error('Missing vector clone');
    expect(getEditorVectorDefinition(clonedFirst)).toEqual(definition);
    const changed = structuredClone(instance);
    changed.overrides.colors[definition.slots[0]!.id] = '#00ff00';
    updateEditorVectorRuntime(clonedFirst, changed);
    expect(clonedFirst.sniptaleVectorElement).toEqual(changed);
    expect(first.sniptaleVectorElement).toEqual(instance);
    expect(JSON.stringify(clonedFirst.toObject())).not.toContain('<svg');
    clone.dispose();
    group.dispose();
    unrelated.dispose();
  } finally {
    await canvas.dispose();
  }
});

it('rejects an unbound clone with a missing definition before changing its metadata', async () => {
  const definition = await prepareEditorVectorDefinition(svg, provenance);
  const original = await createEditorVectorRuntime(
    definition,
    createEditorVectorInstance(definition.id)
  );
  const clone = await original.clone([...CUSTOM_JSON_PROPS]);
  try {
    const instance = structuredClone(clone.sniptaleVectorElement);
    await expect(bindClonedVectorResources([clone], {})).rejects.toThrow();
    expect(clone.sniptaleVectorElement).toEqual(instance);
  } finally {
    original.dispose();
    clone.dispose();
  }
});

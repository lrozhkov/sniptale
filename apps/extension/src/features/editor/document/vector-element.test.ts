import { describe, expect, it } from 'vitest';
import {
  computeEditorVectorDefinitionDigest,
  createEditorVectorInstance,
  isEditorVectorColor,
  isEditorVectorDefinition,
  isEditorVectorInstance,
  isEditorVectorProvenance,
  serializeEditorVectorDefinition,
  validateEditorVectorDefinitionDigest,
  type EditorVectorDefinition,
} from './vector-element';

const fixture: EditorVectorDefinition = {
  version: 1,
  id: 'a'.repeat(64),
  viewBox: { minX: 0, minY: 0, width: 24, height: 24 },
  svg: '<svg xmlns="http://www.w3.org/2000/svg"/>',
  slots: [
    {
      id: 'c0',
      kind: 'current-color',
      originalColor: '#000000',
      bindings: [{ nodeId: 'v2', attribute: 'fill' }],
    },
  ],
  capabilities: { palette: true, strokeScale: false },
  provenance: {
    sourceId: 'local',
    prefix: null,
    name: null,
    author: null,
    authorUrl: null,
    license: null,
    licenseUrl: null,
  },
};

describe('portable vector contracts', () => {
  it('admits exact structural records without claiming SVG safety', () => {
    expect(isEditorVectorDefinition(fixture)).toBe(true);
    expect(isEditorVectorDefinition({ ...fixture, svg: '<script/>' })).toBe(true);
    expect(isEditorVectorDefinition({ ...fixture, extra: true })).toBe(false);
    expect(
      isEditorVectorDefinition({ ...fixture, viewBox: { ...fixture.viewBox, width: Infinity } })
    ).toBe(false);
    expect(
      isEditorVectorDefinition({ ...fixture, viewBox: { ...fixture.viewBox, height: 0 } })
    ).toBe(false);
    expect(
      isEditorVectorDefinition({
        ...fixture,
        slots: [{ ...fixture.slots[0], bindings: [{ nodeId: 'v1', attribute: 'href' }] }],
      })
    ).toBe(false);
    expect(
      isEditorVectorDefinition({ ...fixture, slots: [fixture.slots[0], fixture.slots[0]] })
    ).toBe(false);
    expect(
      isEditorVectorDefinition({ ...fixture, provenance: { ...fixture.provenance, receivedAt: 1 } })
    ).toBe(false);
    expect(isEditorVectorProvenance({ ...fixture.provenance, name: 'x\n' })).toBe(false);
    expect(isEditorVectorProvenance(null)).toBe(false);
  });

  it('accepts only bounded concrete instance colors and stroke multipliers', () => {
    const instance = createEditorVectorInstance(fixture.id);
    expect(isEditorVectorInstance(instance)).toBe(true);
    expect(
      isEditorVectorInstance({
        ...instance,
        overrides: { colors: { c0: '#ff001180' }, strokeScale: 0.01 },
      })
    ).toBe(true);
    for (const strokeScale of [0, NaN, Infinity, -1, 101])
      expect(isEditorVectorInstance({ ...instance, overrides: { colors: {}, strokeScale } })).toBe(
        false
      );
    for (const color of ['red', 'currentColor', 'url(x)', '#FFF', '#ffffff;'])
      expect(isEditorVectorColor(color)).toBe(false);
    expect(() => createEditorVectorInstance('bad')).toThrow();
  });

  it('hashes and serializes identically despite object key insertion order', async () => {
    const id = await computeEditorVectorDefinitionDigest(fixture);
    const definition = { ...fixture, id };
    const reordered = { ...definition, viewBox: { height: 24, width: 24, minY: 0, minX: 0 } };
    expect(serializeEditorVectorDefinition(reordered)).toBe(
      serializeEditorVectorDefinition(definition)
    );
    expect(await validateEditorVectorDefinitionDigest(reordered)).toBe(true);
    expect(await validateEditorVectorDefinitionDigest({ ...definition, svg: 'tampered' })).toBe(
      false
    );
    expect(await validateEditorVectorDefinitionDigest(null)).toBe(false);
  });
});

describe('canonical vector metadata grammar', () => {
  it.each(['#000000', '#abcdef', '#01234567', '#abcdef09'])(
    'accepts bounded canonical color %s',
    (color) => {
      expect(isEditorVectorColor(color)).toBe(true);
    }
  );
  it.each([
    '#ABCDEF',
    '#123',
    '#12345',
    '#1234567',
    '#123456789',
    '#gggggg',
    '#123456\n',
    '#12345678\n',
    `#${'a'.repeat(100000)}x`,
  ])('rejects noncanonical color case %#', (color) => {
    expect(isEditorVectorColor(color)).toBe(false);
  });
  it('preserves all provenance control-character refusals and bounded Unicode text', () => {
    for (let code = 0; code < 32; code++) {
      expect(
        isEditorVectorProvenance({
          ...fixture.provenance,
          name: `before${String.fromCharCode(code)}after`,
        })
      ).toBe(false);
    }
    expect(
      isEditorVectorProvenance({ ...fixture.provenance, name: ` ${String.fromCharCode(127)}😀Имя` })
    ).toBe(true);
    expect(isEditorVectorProvenance({ ...fixture.provenance, name: 'x'.repeat(2048) })).toBe(true);
    expect(isEditorVectorProvenance({ ...fixture.provenance, name: 'x'.repeat(2049) })).toBe(false);
    expect(isEditorVectorProvenance({ ...fixture.provenance, name: 'x'.repeat(100000) })).toBe(
      false
    );
  });
});

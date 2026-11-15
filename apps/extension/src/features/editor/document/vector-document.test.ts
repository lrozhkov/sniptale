import { expect, it } from 'vitest';
import { inspectEditorVectorCanvas, isEditorVectorDocumentData } from './vector-document';
import type { EditorVectorDefinition } from './vector-element';

const id = 'a'.repeat(64);
const definition: EditorVectorDefinition = {
  version: 1,
  id,
  viewBox: { minX: 0, minY: 0, width: 24, height: 24 },
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path id="v0" fill="#000000" d="M0 0H24V24Z"/></svg>',
  slots: [
    {
      id: 'c0',
      kind: 'current-color',
      originalColor: '#000000',
      bindings: [{ nodeId: 'v0', attribute: 'fill' }],
    },
  ],
  capabilities: { palette: true, strokeScale: false },
  provenance: {
    sourceId: null,
    prefix: null,
    name: null,
    author: null,
    authorUrl: null,
    license: null,
    licenseUrl: null,
  },
};
const instance = { version: 1, definitionId: id, overrides: { colors: {}, strokeScale: 1 } };
const vector = () => ({
  type: 'Group',
  sniptaleType: 'vector-element',
  sniptaleVectorElement: structuredClone(instance),
  objects: [],
});
const document = (object: unknown) => JSON.stringify({ objects: [object] });

it('admits nested placeholders with one shared definition and preserves legacy documents', () => {
  expect(
    isEditorVectorDocumentData(document({ type: 'Group', objects: [vector(), vector()] }), 4, {
      [id]: definition,
    })
  ).toBe(true);
  expect(isEditorVectorDocumentData(document({ type: 'Rect' }), 2, undefined)).toBe(true);
  expect(isEditorVectorDocumentData(document({ type: 'Rect' }), 3, undefined)).toBe(true);
});
it('refuses missing, foreign, unused and legacy definitions before loading geometry', () => {
  expect(isEditorVectorDocumentData(document(vector()), 4, undefined)).toBe(false);
  expect(isEditorVectorDocumentData(document(vector()), 3, { [id]: definition })).toBe(false);
  expect(isEditorVectorDocumentData(document(vector()), 2, undefined)).toBe(false);
  expect(isEditorVectorDocumentData(document({ type: 'Rect' }), 4, { [id]: definition })).toBe(
    false
  );
  expect(isEditorVectorDocumentData(document(vector()), 4, { ['b'.repeat(64)]: definition })).toBe(
    false
  );
});
it('refuses unrecognized palette overrides and unsupported stroke scaling', () => {
  const value = vector();
  value.sniptaleVectorElement.overrides.colors = { c99: '#ff0000' };
  expect(isEditorVectorDocumentData(document(value), 4, { [id]: definition })).toBe(false);
  value.sniptaleVectorElement.overrides.colors = { c0: '#ff0000' };
  expect(isEditorVectorDocumentData(document(value), 4, { [id]: definition })).toBe(true);
  value.sniptaleVectorElement.overrides.strokeScale = 2;
  expect(isEditorVectorDocumentData(document(value), 4, { [id]: definition })).toBe(false);
});
it('refuses hidden derived children, unsupported clips and mismatched object discriminators', () => {
  const value = vector();
  expect(
    inspectEditorVectorCanvas(
      { objects: [{ ...value, objects: [{ type: 'Path' }] }] },
      new Set([id])
    ).valid
  ).toBe(false);
  expect(
    inspectEditorVectorCanvas({ objects: [{ type: 'Rect', clipPath: value }] }, new Set([id])).valid
  ).toBe(false);
  expect(
    inspectEditorVectorCanvas({ objects: [{ ...value, sniptaleType: 'group' }] }, new Set([id]))
      .valid
  ).toBe(false);
});
it('refuses excessive nesting without recursive stack exhaustion', () => {
  let object: unknown = vector();
  for (let index = 0; index < 45; index++) object = { objects: [object] };
  expect(inspectEditorVectorCanvas(object, new Set([id])).valid).toBe(false);
});

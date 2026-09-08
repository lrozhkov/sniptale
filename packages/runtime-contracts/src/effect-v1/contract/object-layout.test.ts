import { describe, expect, it } from 'vitest';
import { validateEffectV1Document, normalizeEffectV1ToTemplate } from '../index';
import { createEffectV1TestDocument } from './test-support';

const layout = { width: 640, height: 280, resize: 'reflow' };

describe('stable object layout admission', () => {
  it('retains geometry through validation and normalization', () => {
    const result = validateEffectV1Document({
      ...createEffectV1TestDocument(),
      objectLayout: layout,
    });
    expect(result.ok).toBe(true);
    expect(normalizeEffectV1ToTemplate(result.document!).effectV1).toMatchObject({
      objectLayout: layout,
    });
  });
  it.each([
    { ...layout, width: 0 },
    { ...layout, height: Infinity },
    { ...layout, width: 16385 },
    { ...layout, resize: 'stretch' },
    { ...layout, unknown: true },
    { ...layout, handles: [] },
  ])('rejects invalid layout %j', (objectLayout) => {
    expect(validateEffectV1Document({ ...createEffectV1TestDocument(), objectLayout }).ok).toBe(
      false
    );
  });
});

const handle = {
  id: 'tip',
  label: { en: 'Tip', ru: 'Указатель' },
  xControl: 'tipX',
  yControl: 'tipY',
  padding: 16,
};
function handleDocument() {
  return {
    ...createEffectV1TestDocument(),
    objectLayout: { width: 380, height: 120, resize: 'scale', handles: [handle] },
    controls: ['tipX', 'tipY'].map((id) => ({
      id,
      label: { en: id },
      kind: 'number',
      defaultValue: 0,
      min: -1000000,
      max: 1000000,
    })),
    program: {
      kind: 'graph',
      version: 1,
      commands: [
        {
          op: 'fillRect',
          x: { op: 'read', path: 'controls.tipX' },
          y: { op: 'read', path: 'controls.tipY' },
          width: 10,
          height: 10,
          fill: '#fff',
        },
      ],
    },
  };
}

it('admits bounded external handles and retains their declarations', () => {
  const result = validateEffectV1Document(handleDocument());
  expect(result.diagnostics).toEqual([]);
  expect(result.document?.objectLayout?.handles).toEqual([handle]);
});
it.each([
  { ...handle, yControl: 'tipX' },
  { ...handle, xControl: 'missing' },
  { ...handle, padding: -1 },
  { ...handle, padding: Infinity },
  { ...handle, extra: true },
])('rejects invalid external handle %j', (invalid) => {
  const document = handleDocument();
  expect(
    validateEffectV1Document({
      ...document,
      objectLayout: { ...document.objectLayout, handles: [invalid] },
    }).ok
  ).toBe(false);
});
it('rejects duplicate handles, reflow handles and non-standalone layout', () => {
  const document = handleDocument();
  for (const objectLayout of [
    { ...document.objectLayout, handles: [handle, handle] },
    { ...document.objectLayout, resize: 'reflow' },
  ]) {
    expect(validateEffectV1Document({ ...document, objectLayout }).ok).toBe(false);
  }
  expect(validateEffectV1Document({ ...document, kind: 'targetEffect' }).ok).toBe(false);
});

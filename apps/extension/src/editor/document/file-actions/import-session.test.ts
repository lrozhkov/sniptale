import { expect, it } from 'vitest';
import { DEFAULT_BROWSER_FRAME_STATE } from '../../../features/editor/document/constants';
import { createEditorDocumentFixture } from '../page-session/document.test-support';
import { parseImportedEditorDocument } from './import-session';

const base = { sourceWidth: 801, sourceHeight: 601, canvasWidth: 801, canvasHeight: 601 };
function session(compositionBase: typeof base) {
  return JSON.stringify({
    ...createEditorDocumentFixture(),
    browserFrame: { ...DEFAULT_BROWSER_FRAME_STATE, compositionBase },
  });
}

it('accepts legacy sessions and bounded composition baselines', () => {
  expect(() =>
    parseImportedEditorDocument(JSON.stringify(createEditorDocumentFixture()))
  ).not.toThrow();
  expect(parseImportedEditorDocument(session(base)).browserFrame?.compositionBase).toEqual(base);
  expect(() =>
    parseImportedEditorDocument(
      session({ sourceWidth: 32768, sourceHeight: 1, canvasWidth: 10000, canvasHeight: 10000 })
    )
  ).not.toThrow();
});

it.each([
  { ...base, sourceWidth: 32769 },
  { ...base, sourceHeight: 32769 },
  { ...base, canvasWidth: 32769 },
  { ...base, canvasHeight: 32769 },
  { ...base, sourceWidth: 10001, sourceHeight: 10000 },
  { ...base, canvasWidth: 10001, canvasHeight: 10000 },
])('rejects oversized composition geometry before opening a session: %j', (compositionBase) => {
  expect(() => parseImportedEditorDocument(session(compositionBase))).toThrow();
});

it('accepts and rejects common scene baselines at the session boundary', () => {
  const fixture = createEditorDocumentFixture();
  const encode = (compositionBase: unknown) => JSON.stringify({ ...fixture, compositionBase });
  expect(parseImportedEditorDocument(encode(base)).compositionBase).toEqual(base);
  for (const invalid of [
    null,
    {},
    { ...base, sourceWidth: 0 },
    { ...base, canvasWidth: 32769 },
    { ...base, sourceWidth: 10001, sourceHeight: 10000 },
    { ...base, canvasWidth: 10001, canvasHeight: 10000 },
  ]) {
    expect(() => parseImportedEditorDocument(encode(invalid))).toThrow();
  }
});

it('retains signed canvas extents without accepting signed legacy bitmap dimensions', () => {
  const fixture = createEditorDocumentFixture();
  for (const canvasWidth of [-20, 0, 100]) {
    const compositionBase = { ...base, canvasWidth, canvasHeight: canvasWidth };
    expect(
      parseImportedEditorDocument(JSON.stringify({ ...fixture, compositionBase })).compositionBase
    ).toEqual(compositionBase);
  }
  expect(() => parseImportedEditorDocument(session({ ...base, canvasWidth: -20 }))).toThrow();
  expect(() =>
    parseImportedEditorDocument(
      JSON.stringify({ ...fixture, compositionBase: { ...base, canvasWidth: -32769 } })
    )
  ).toThrow();
  expect(() =>
    parseImportedEditorDocument(
      JSON.stringify({
        ...fixture,
        compositionBase: { ...base, canvasWidth: -10001, canvasHeight: 10000 },
      })
    )
  ).toThrow();
});

it('imports retained raster PNG resources and rejects unsafe or partial state before loading', () => {
  const image = 'data:image/png;base64,QUJDRA==';
  const object = {
    type: 'image',
    src: image,
    sniptaleRasterState: {
      version: 1,
      width: 12,
      height: 8,
      crop: { x: 2, y: 1, width: 8, height: 6 },
    },
    sniptaleRasterOriginalData: image,
    sniptaleRasterColorData: image,
    sniptaleRasterVisibilityData: image,
    sniptaleRasterKeyData: image,
  };
  const encode = (value: unknown) =>
    JSON.stringify({
      ...createEditorDocumentFixture(),
      version: 3,
      canvasJson: JSON.stringify({ objects: [value] }),
    });
  expect(parseImportedEditorDocument(encode(object)).version).toBe(3);
  for (const patch of [
    { sniptaleRasterOriginalData: 'https://example.com/source.png' },
    { sniptaleRasterColorData: 'javascript:alert(1)' },
    { sniptaleRasterVisibilityData: 'data:image/jpeg;base64,QUJDRA==' },
    { sniptaleRasterState: undefined },
  ]) {
    expect(() => parseImportedEditorDocument(encode({ ...object, ...patch }))).toThrow();
  }
});

it('imports rich shapes with a zero line width without changing their source data', async () => {
  const { createDefaultRichShapeObject } =
    await import('../../../features/editor/document/rich-shape');
  const shape = createDefaultRichShapeObject();
  const richShapes = [
    { ...shape, style: { ...shape.style, line: { ...shape.style.line, width: 0 } } },
  ];
  const document = { ...createEditorDocumentFixture(), richShapes };
  expect(parseImportedEditorDocument(JSON.stringify(document))).toEqual(document);
});

it.each([
  { name: 'coordinate', properties: { left: 131073 } },
  { name: 'dimension', properties: { width: 32769 } },
  { name: 'zero scale', properties: { scaleX: 0 } },
  { name: 'excessive scale', properties: { scaleY: 101 } },
  { name: 'negative opacity', properties: { opacity: -1 } },
  { name: 'excessive opacity', properties: { opacity: 101 } },
  { name: 'negative line width', properties: { strokeWidth: -1 } },
  { name: 'excessive line width', properties: { strokeWidth: 32769 } },
  { name: 'remote source', properties: { src: 'https://example.test/source.png' } },
  { name: 'excessive text', properties: { text: 'x'.repeat(200001) } },
])('rejects unsafe imported canvas $name before it can enter the editor', ({ properties }) => {
  const document = {
    ...createEditorDocumentFixture(),
    canvasJson: JSON.stringify({ objects: [{ type: 'rect', ...properties }] }),
  };
  expect(() => parseImportedEditorDocument(JSON.stringify(document))).toThrow();
});

it('refuses oversized session text and invalid document JSON with their existing errors', () => {
  expect(() => parseImportedEditorDocument(' '.repeat(50 * 1024 * 1024 + 1))).toThrow();
  expect(() => parseImportedEditorDocument('{broken')).toThrow();
});

it('refuses source positions and background URLs outside the session admission contract', () => {
  const fixture = createEditorDocumentFixture();
  for (const document of [
    { ...fixture, sourceLeft: 131073 },
    { ...fixture, sourceTop: -131073 },
    {
      ...fixture,
      frame: { ...fixture.frame, backgroundImageData: 'https://example.test/background.png' },
    },
  ])
    expect(() => parseImportedEditorDocument(JSON.stringify(document))).toThrow();
});

it('refuses an imported canvas that exceeds the traversal or object budget', () => {
  const fixture = createEditorDocumentFixture();
  const wide = { objects: Array.from({ length: 5001 }, () => ({ type: 'rect' })) };
  let nested: unknown = 'leaf';
  for (let index = 0; index < 42; index++) nested = { child: nested };
  for (const canvas of [wide, { objects: [{ type: 'rect', custom: nested }] }]) {
    expect(() =>
      parseImportedEditorDocument(
        JSON.stringify({ ...fixture, canvasJson: JSON.stringify(canvas) })
      )
    ).toThrow();
  }
});

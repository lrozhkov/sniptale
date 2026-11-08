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

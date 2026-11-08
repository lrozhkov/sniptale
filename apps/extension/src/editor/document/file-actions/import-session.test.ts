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

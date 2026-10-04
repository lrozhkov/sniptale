// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createEditorDocumentFixture } from '../../document/page-session/document.test-support';
import { useEditorStore } from '../../state/useEditorStore';
import { prepareAppliedDocument } from './prepare-applied';
import { applyPreparedEditorDocumentState } from './lifecycle-helpers';
import type { EditorDocument } from '../../../features/editor/document/types';

function apply(document: EditorDocument) {
  const prepared = prepareAppliedDocument(document);
  const setHistory = vi.fn();
  const setOriginalDocument = vi.fn();
  applyPreparedEditorDocumentState({
    prepared,
    source: prepared.source,
    canvasObjects: [],
    applyOptions: { resetHistory: true, updateOriginal: true },
    hasHistory: false,
    applyToolMode: vi.fn(),
    setActiveTool: vi.fn(),
    setCanvasDocumentSize: vi.fn(),
    setCropState: vi.fn(),
    setHistory,
    setOriginalDocument,
    setSource: vi.fn(),
  });
  return { setHistory, setOriginalDocument };
}

afterEach(() => useEditorStore.getState().setPageTitle(''));

it('includes a legacy aggregate caption in the initial history baseline', () => {
  useEditorStore.getState().setPageTitle('Legacy caption');
  const document = createEditorDocumentFixture();
  const { setHistory, setOriginalDocument } = apply(document);
  expect(setHistory).toHaveBeenCalledWith(
    expect.objectContaining({
      displayName: 'Legacy caption',
      sourceName: document.sourceName,
      sourceImageData: document.sourceImageData,
      canvasJson: document.canvasJson,
      canvasWidth: document.canvasWidth,
      canvasHeight: document.canvasHeight,
    })
  );
  expect(setOriginalDocument).toHaveBeenCalledWith(setHistory.mock.calls[0]?.[0]);
  expect(useEditorStore.getState().pageTitle).toBe('Legacy caption');
});

it('restores the caption when applying an undo or redo document without renaming the source', () => {
  const document = createEditorDocumentFixture();
  for (const displayName of ['Old.png', 'New.png']) {
    const { setHistory } = apply({ ...document, displayName });
    expect(useEditorStore.getState().pageTitle).toBe(displayName);
    expect(setHistory.mock.calls[0]?.[0]).toMatchObject({
      displayName,
      sourceName: document.sourceName,
    });
  }
});

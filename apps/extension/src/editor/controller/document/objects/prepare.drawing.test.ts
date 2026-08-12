// @vitest-environment jsdom

import { Group, Rect, Textbox } from 'fabric';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyBaseInteractionPatch: vi.fn(),
  applyEditorDrawingInteractionControls: vi.fn(),
  applyEditorObjectInteractionControls: vi.fn(),
  applyLineLikeRichShapeControls: vi.fn(),
  attachEditorTextboxLifecycle: vi.fn(),
  refreshPreparedObjectGeometry: vi.fn(),
}));

vi.mock('../interaction-controls/apply', () => ({
  applyEditorActiveSelectionInteractionControls: vi.fn(),
  applyEditorObjectInteractionControls: mocks.applyEditorObjectInteractionControls,
}));
vi.mock('./geometry-refresh', () => ({
  refreshPreparedObjectGeometry: mocks.refreshPreparedObjectGeometry,
}));
vi.mock('./interaction-patches', () => ({
  applyBaseInteractionPatch: mocks.applyBaseInteractionPatch,
}));
vi.mock('./rich-shape-controls', () => ({
  applyLineLikeRichShapeControls: mocks.applyLineLikeRichShapeControls,
}));
vi.mock('./textbox-lifecycle', () => ({
  attachEditorTextboxLifecycle: mocks.attachEditorTextboxLifecycle,
}));
vi.mock('../../../drawing/object/controls/apply', () => ({
  applyEditorDrawingActiveSelectionChrome: vi.fn(),
  applyEditorDrawingInteractionControls: mocks.applyEditorDrawingInteractionControls,
}));

import { prepareEditorObject } from './prepare';

beforeEach(() => vi.clearAllMocks());

it('prepares group children and applies canonical interaction owners', () => {
  const child = new Rect();
  vi.spyOn(child, 'set');
  const group = new Group([child]);

  prepareEditorObject(group, { onTextboxExitCommit: vi.fn(), onTextboxExitEmpty: vi.fn() });

  expect(child.set).toHaveBeenCalledWith({ evented: false, selectable: false });
  expect(mocks.applyBaseInteractionPatch).toHaveBeenCalledWith(
    group,
    expect.objectContaining({ locked: false })
  );
  expect(mocks.applyEditorObjectInteractionControls).toHaveBeenCalledTimes(2);
  expect(mocks.applyEditorDrawingInteractionControls).toHaveBeenCalledWith(group);
  expect(mocks.refreshPreparedObjectGeometry).toHaveBeenCalledWith(group);
});

it('wires shared drawing text commit and empty callbacks', () => {
  const text = new Textbox('Text');
  const onTextboxExitCommit = vi.fn();
  const onTextboxExitEmpty = vi.fn();

  prepareEditorObject(text, { onTextboxExitCommit, onTextboxExitEmpty });

  const lifecycle = mocks.attachEditorTextboxLifecycle.mock.calls[0]?.[1];
  expect(lifecycle).toBeDefined();
  lifecycle?.onEmpty();
  lifecycle?.onCommit(text);
  expect(onTextboxExitEmpty).toHaveBeenCalledWith(text);
  expect(onTextboxExitCommit).toHaveBeenCalledWith(text);
});

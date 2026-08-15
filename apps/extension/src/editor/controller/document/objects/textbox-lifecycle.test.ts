// @vitest-environment jsdom

import { Textbox } from 'fabric';
import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  translate: vi.fn(() => 'Default textbox text'),
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: mocks.translate,
}));

import {
  attachEditorTextboxLifecycle,
  beginEditorTextboxEditing,
  cancelEditorTextboxEditing,
} from './textbox-lifecycle';
import {
  readEditorDrawingObject,
  writeEditorDrawingObject,
} from '../../../drawing/object/metadata';

function createTextbox(text: string, previous?: () => void) {
  const textbox = Object.assign(new Textbox(text, { height: 40, left: 10, top: 20, width: 120 }), {
    sniptaleEditingExitedHandler: previous,
  });
  vi.spyOn(textbox, 'off');
  return textbox;
}

it('replaces old editing handlers and routes empty/default text to empty lifecycle', () => {
  const previous = vi.fn();
  const onEmpty = vi.fn();
  const textbox = createTextbox('Default textbox text', previous);

  attachEditorTextboxLifecycle(textbox, {
    onCommit: vi.fn(),
    onEmpty,
  });
  textbox.fire('editing:exited');

  expect(textbox.off).toHaveBeenCalledWith('editing:exited', previous);
  expect(onEmpty).toHaveBeenCalledOnce();
});

it('restores an existing text snapshot and suppresses commit when Escape cancels editing', () => {
  const onCommit = vi.fn();
  const onEmpty = vi.fn();
  const textbox = createTextbox('Original');
  const originalWidth = textbox.width;
  attachEditorTextboxLifecycle(textbox, { onCommit, onEmpty });
  beginEditorTextboxEditing(textbox);
  textbox.isEditing = true;
  textbox.text = 'Changed';
  textbox.width = 240;

  cancelEditorTextboxEditing(textbox);

  expect(textbox.text).toBe('Original');
  expect(textbox.width).toBe(originalWidth);
  expect(onCommit).not.toHaveBeenCalled();
  expect(onEmpty).not.toHaveBeenCalled();
});

it('captures and restores text plus drawing metadata after Fabric already entered editing', () => {
  const onCommit = vi.fn();
  const textbox = createTextbox('Original');
  const originalDrawing = {
    id: 'text-1',
    kind: 'text' as const,
    bounds: { x: 10, y: 20, width: 120, height: 40 },
    text: 'Original',
    color: '#111111',
    backgroundColor: null,
    fontFamily: 'handwritten' as const,
    fontSize: 24,
  };
  writeEditorDrawingObject(textbox, originalDrawing);
  const originalDrawingJson = textbox.sniptaleDrawingJson;
  attachEditorTextboxLifecycle(textbox, { onCommit, onEmpty: vi.fn() });
  textbox.isEditing = true;

  beginEditorTextboxEditing(textbox);
  textbox.text = 'Changed';
  writeEditorDrawingObject(textbox, { ...originalDrawing, text: 'Changed' });
  cancelEditorTextboxEditing(textbox);

  expect(textbox.text).toBe('Original');
  expect(textbox.sniptaleDrawingJson).toBe(originalDrawingJson);
  expect(readEditorDrawingObject(textbox)).toEqual(originalDrawing);
  expect(onCommit).not.toHaveBeenCalled();
});

it('removes a cancelled empty draft without committing history', () => {
  const onCommit = vi.fn();
  const onEmpty = vi.fn();
  const textbox = createTextbox('');
  attachEditorTextboxLifecycle(textbox, { onCommit, onEmpty });
  beginEditorTextboxEditing(textbox);
  textbox.isEditing = true;
  textbox.text = 'Draft';

  cancelEditorTextboxEditing(textbox);

  expect(textbox.text).toBe('');
  expect(onEmpty).toHaveBeenCalledOnce();
  expect(onCommit).not.toHaveBeenCalled();
});

it('commits textbox lifecycle when text contains user content', () => {
  const onCommit = vi.fn();
  const textbox = createTextbox('Real note');

  attachEditorTextboxLifecycle(textbox, {
    onCommit,
    onEmpty: vi.fn(),
  });
  textbox.fire('editing:exited');

  expect(onCommit).toHaveBeenCalledWith(textbox);
});

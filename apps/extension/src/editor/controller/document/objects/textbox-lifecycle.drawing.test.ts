// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import { Textbox } from 'fabric';
import { attachEditorTextboxLifecycle } from './textbox-lifecycle';

it('commits non-empty drawing text and removes empty text through one lifecycle', () => {
  const textbox = new Textbox('');
  const onEmpty = vi.fn();
  const onCommit = vi.fn();
  attachEditorTextboxLifecycle(textbox, { onEmpty, onCommit });
  textbox.sniptaleDrawingTextAutoWidth = true;
  textbox.fire('editing:exited');
  expect(onEmpty).toHaveBeenCalledOnce();
  expect(onCommit).not.toHaveBeenCalled();

  textbox.text = 'Shared drawing text';
  textbox.fire('editing:exited');
  expect(onCommit).toHaveBeenCalledOnce();
  expect(onCommit).toHaveBeenCalledWith(textbox);
  expect(textbox.sniptaleDrawingTextAutoWidth).toBe(false);
});

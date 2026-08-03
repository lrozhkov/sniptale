// @vitest-environment jsdom

import { afterEach, expect, it } from 'vitest';
import { createCalloutTranscriptInsertion } from './voice-transcript';

afterEach(() => {
  document.body.replaceChildren();
  window.getSelection()?.removeAllRanges();
});

function placeCaret(node: Node, offset: number): void {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

it('streams one replaceable voice span at the rich-text caret without removing markup', () => {
  const editable = document.createElement('div');
  editable.contentEditable = 'true';
  editable.innerHTML = '<b>Before</b><i>after</i>';
  document.body.append(editable);
  const beforeText = editable.querySelector('b')?.firstChild;
  if (!beforeText) throw new Error('Expected bold text fixture');
  placeCaret(beforeText, 6);
  const insertion = createCalloutTranscriptInsertion(editable);

  expect(insertion.apply({ isFinal: false, sequence: 0, text: 'draft' })).toBe(true);
  expect(editable.textContent).toBe('Before draft after');
  expect(insertion.apply({ isFinal: false, sequence: 1, text: 'spoken' })).toBe(true);
  expect(editable.textContent).toBe('Before spoken after');
  expect(insertion.apply({ isFinal: true, sequence: 2, text: 'spoken ' })).toBe(true);
  expect(editable.innerHTML).toContain('<b>Before');
  expect(editable.innerHTML).toContain('</b><i>after</i>');
  expect(editable.textContent).toBe('Before spoken after');
});

it('appends final fragments and ignores stale transcript sequences', () => {
  const editable = document.createElement('div');
  editable.contentEditable = 'true';
  editable.textContent = 'Comment';
  document.body.append(editable);
  placeCaret(editable.firstChild!, 7);
  const insertion = createCalloutTranscriptInsertion(editable);

  expect(insertion.apply({ isFinal: true, sequence: 1, text: 'one' })).toBe(true);
  expect(insertion.apply({ isFinal: false, sequence: 2, text: 'two' })).toBe(true);
  expect(editable.textContent).toBe('Comment one two');
  expect(insertion.apply({ isFinal: true, sequence: 1, text: 'stale' })).toBe(false);
  expect(editable.textContent).toBe('Comment one two');
});

it('clears a superseded interim span when the latest hypothesis is empty', () => {
  const editable = document.createElement('div');
  editable.contentEditable = 'true';
  editable.textContent = 'Before after';
  document.body.append(editable);
  placeCaret(editable.firstChild!, 7);
  const insertion = createCalloutTranscriptInsertion(editable);

  expect(insertion.apply({ isFinal: false, sequence: 0, text: 'draft' })).toBe(true);
  expect(editable.textContent).toBe('Before draft after');
  expect(insertion.apply({ isFinal: false, sequence: 1, text: '   ' })).toBe(true);
  expect(editable.textContent).toBe('Before after');
  expect(insertion.apply({ isFinal: false, sequence: 2, text: 'next' })).toBe(true);
  expect(insertion.apply({ isFinal: true, sequence: 3, text: '' })).toBe(true);
  expect(editable.textContent).toBe('Before after');
});

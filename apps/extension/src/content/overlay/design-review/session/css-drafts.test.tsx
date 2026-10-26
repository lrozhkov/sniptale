// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useDesignReviewCssDrafts } from './css-drafts';

let root: Root;
let drafts: ReturnType<typeof useDesignReviewCssDrafts>;
function Harness({ enabled = true }: { enabled?: boolean }) {
  drafts = useDesignReviewCssDrafts(enabled);
  return null;
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<Harness />));
});
afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it('keeps independent target drafts across presentation changes and clears only at session end', () => {
  const a = document.createElement('p');
  const b = document.createElement('p');
  document.body.append(a, b);
  act(() => drafts.write(a, 'A', 'color: red;'));
  expect(drafts.read(b)).toBe('');
  act(() => drafts.write(b, 'B', 'width: invalid;'));
  act(() => root.render(<Harness />));
  expect(drafts.read(a)).toBe('color: red;');
  expect(drafts.read(b)).toBe('width: invalid;');
  expect(a.getAttribute('style')).toBeNull();
  expect(b.getAttribute('style')).toBeNull();
  act(() => root.render(<Harness enabled={false} />));
  expect(drafts.read(a)).toBe('');
  expect(drafts.items).toEqual([]);
});

it('retains a detached draft for copy or discard without binding it to a replacement object', () => {
  const a = document.createElement('p');
  a.id = 'source';
  document.body.append(a);
  act(() => drafts.write(a, '#source', 'font-size: 24px;'));
  a.remove();
  const replacement = document.createElement('p');
  replacement.id = 'source';
  document.body.append(replacement);
  expect(drafts.read(replacement)).toBe('');
  expect(drafts.items[0]).toEqual(expect.objectContaining({ target: a, text: 'font-size: 24px;' }));
  act(() => drafts.discard(a));
  expect(drafts.items).toEqual([]);
});

it('tracks accepted editor text and routes cancellation only to the current editor', () => {
  const target = document.createElement('p');
  document.body.append(target);
  act(() => drafts.write(target, 'p', 'color: red;'));
  act(() => drafts.accept(target));
  expect(drafts.read(target)).toBe('color: red;');
  expect(drafts.items).toEqual([]);
  act(() => drafts.write(target, 'p', 'color: blue;'));
  const oldCancel = vi.fn(() => true);
  const currentCancel = vi.fn(() => true);
  const removeOld = drafts.registerEditorCancel(oldCancel);
  const removeCurrent = drafts.registerEditorCancel(currentCancel);
  removeOld();
  expect(drafts.cancelEditing()).toBe(true);
  expect(oldCancel).not.toHaveBeenCalled();
  expect(currentCancel).toHaveBeenCalledOnce();
  removeCurrent();
  expect(drafts.cancelEditing()).toBe(false);
});

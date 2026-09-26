// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EditorDocumentTitleEditor } from './document-title';

const mocks = vi.hoisted(() => ({ rename: vi.fn(), controller: {} }));
vi.mock('../../workflows/rename-image', () => ({ renameEditorImage: mocks.rename }));
vi.mock('../../application/controller-context', () => ({
  useEditorController: () => mocks.controller,
}));
let container: HTMLDivElement;
let root: Root;
function render(id = 'image-1') {
  act(() =>
    root.render(
      <EditorDocumentTitleEditor title="Original.png" aggregateId={id} hasImage>
        {(start, ref) => (
          <>
            <button ref={ref} onClick={start}>
              Original.png
            </button>
            <button>Save</button>
          </>
        )}
      </EditorDocumentTitleEditor>
    )
  );
}
function input() {
  const node = container.querySelector('input');
  if (!node) throw new Error('Expected name input');
  return node;
}
function change(value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input(), value);
    input().dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function key(key: string) {
  await act(async () =>
    input().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  );
}
beforeEach(() => {
  mocks.rename.mockReset().mockResolvedValue(undefined);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  render();
  act(() => container.querySelector('button')?.click());
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it('selects the title, hides actions, commits once and restores keyboard focus', async () => {
  expect(document.activeElement).toBe(input());
  expect(input().selectionEnd).toBe('Original.png'.length);
  expect(container.querySelector('button')?.parentElement?.className).toBe('hidden');
  change('New.png');
  expect(input().selectionStart).not.toBe(0);
  await key('Enter');
  expect(mocks.rename).toHaveBeenCalledWith(mocks.controller, 'image-1', 'New.png');
  expect(container.querySelector('input')).toBeNull();
  expect(document.activeElement).toBe(container.querySelector('button'));
  expect(container.querySelector('button')?.parentElement?.className).not.toBe('hidden');
});

it.each(['Escape', 'Enter'])(
  'retains the title for cancel or blank submission: %s',
  async (keyName) => {
    change(keyName === 'Escape' ? 'Uncommitted' : '   ');
    await key(keyName);
    expect(mocks.rename).not.toHaveBeenCalled();
    expect(container.querySelector('input')).toBeNull();
  }
);

it('accepts blur without stealing outside focus', async () => {
  const outside = document.createElement('button');
  document.body.appendChild(outside);
  change('Blurred');
  await act(async () => outside.focus());
  expect(mocks.rename).toHaveBeenCalledOnce();
  expect(document.activeElement).toBe(outside);
  outside.remove();
});

it('rejects duplicate submit, preserves failed text, and permits retry', async () => {
  let reject: ((error: Error) => void) | undefined;
  mocks.rename.mockImplementationOnce(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      })
  );
  change('Retry.png');
  await key('Enter');
  await key('Enter');
  expect(mocks.rename).toHaveBeenCalledOnce();
  expect(input().readOnly).toBe(true);
  await act(async () => reject?.(new Error('storage')));
  expect(input().value).toBe('Retry.png');
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  await key('Enter');
  expect(mocks.rename).toHaveBeenCalledTimes(2);
  expect(container.querySelector('input')).toBeNull();
});

it('discards a draft on document replacement without remounting action controls', () => {
  const button = container.querySelector('button');
  change('Old draft');
  render('image-2');
  expect(container.querySelector('input')).toBeNull();
  expect(container.querySelector('button')).toBe(button);
  expect(mocks.rename).not.toHaveBeenCalled();
});

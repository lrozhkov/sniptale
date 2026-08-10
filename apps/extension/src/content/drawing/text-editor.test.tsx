// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { DrawingTextEditor, type DrawingTextDraft } from './text-editor';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('keeps the first line visible while Shift+Enter creates an empty trailing line', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const initialDraft: DrawingTextDraft = {
    autoWidth: false,
    height: 29,
    id: 'text',
    point: { x: 20, y: 30 },
    value: 'Stable text',
    width: 180,
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  function Harness(props: { layoutRevision: number }) {
    const [draft, setDraft] = useState(initialDraft);
    return (
      <DrawingTextEditor
        draft={draft}
        layoutRevision={props.layoutRevision}
        projection={{ x: 0, y: 0 }}
        style={{
          backgroundColor: '#fef08a',
          color: '#111827',
          fontFamily: 'sans',
          fontSize: 20,
        }}
        onCancel={vi.fn()}
        onChange={setDraft}
        onCommit={vi.fn()}
      />
    );
  }
  act(() => root.render(<Harness layoutRevision={0} />));
  const editor = host.querySelector<HTMLTextAreaElement>('[data-ui="content.drawing.text-input"]')!;

  editor.setSelectionRange(editor.value.length, editor.value.length);
  Object.defineProperty(editor, 'scrollTop', { configurable: true, value: 25, writable: true });
  const shiftEnter = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key: 'Enter',
    shiftKey: true,
  });
  act(() => editor.dispatchEvent(shiftEnter));

  expect(shiftEnter.defaultPrevented).toBe(false);
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  act(() => {
    valueSetter?.call(editor, 'Stable text\n');
    editor.setSelectionRange('Stable text\n'.length, 'Stable text\n'.length);
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertLineBreak' }));
  });
  editor.scrollTop = 25;
  act(() => frames.splice(0).forEach((callback) => callback(0)));
  expect(editor.value).toBe('Stable text\n');
  expect(editor.selectionStart).toBe(editor.value.length);
  expect(editor.scrollTop).toBe(0);
  expect(host.querySelector('[data-ui="content.drawing.text-mirror"]')?.textContent).toBe(
    'Stable text\n\u200b'
  );
  const backgrounds = Array.from(
    host.querySelectorAll<HTMLElement>('[data-ui="content.drawing.text-background"]')
  );
  expect(backgrounds).toHaveLength(2);
  expect(backgrounds.map((background) => background.style.top)).toEqual(['2px', '27px']);
  expect(backgrounds.map((background) => background.style.height)).toEqual(['25px', '25px']);

  const zoomKey = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ctrlKey: true,
    key: '+',
    shiftKey: true,
  });
  act(() => editor.dispatchEvent(zoomKey));
  expect(zoomKey.defaultPrevented).toBe(false);
  act(() => root.render(<Harness layoutRevision={1} />));
  editor.scrollTop = 25;
  act(() => frames.splice(0).forEach((callback) => callback(0)));
  expect(editor.scrollTop).toBe(0);
  act(() => root.unmount());
});

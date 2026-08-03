// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';

import { useCalloutEditingHandlers } from './editing.handlers';

function EditingHandlersHarness(props: {
  onContentChange: (html: string) => void;
  onDelete?: () => void;
  titleText?: string;
}) {
  const contentEditableRef = React.useRef<HTMLDivElement | null>(null);
  const handlers = useCalloutEditingHandlers({
    contentEditableRef,
    frameId: 'frame-1',
    isEditing: true,
    onManualInput: vi.fn(),
    onContentChange: props.onContentChange,
    onDelete: props.onDelete ?? vi.fn(),
    ...(props.titleText === undefined ? {} : { titleText: props.titleText }),
    onStartEditing: vi.fn(),
    onStopEditing: vi.fn(),
  });

  return (
    <div
      ref={contentEditableRef}
      contentEditable
      data-ui="callout-editable"
      onBlur={handlers.handleBlur}
      onInput={handlers.handleInput}
      onPaste={handlers.handlePaste}
      suppressContentEditableWarning
    />
  );
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeAll(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

it('sanitizes contenteditable input before publishing callout content changes', () => {
  const onContentChange = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(<EditingHandlersHarness onContentChange={onContentChange} />);
  });

  const editable = container.querySelector<HTMLDivElement>('[data-ui="callout-editable"]');
  expect(editable).toBeInstanceOf(HTMLDivElement);
  editable!.innerHTML =
    '<img src=x onerror=alert(1)><strong onclick="alert(2)">bold</strong><script>bad()</script>';

  act(() => {
    editable?.dispatchEvent(new InputEvent('input', { bubbles: true }));
  });

  expect(onContentChange).toHaveBeenCalledWith('<strong>bold</strong>');
});

it('keeps a title-only callout when the body is empty', () => {
  const onContentChange = vi.fn();
  const onDelete = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <EditingHandlersHarness
        onContentChange={onContentChange}
        onDelete={onDelete}
        titleText="Title"
      />
    );
  });
  const editable = container.querySelector<HTMLDivElement>('[data-ui="callout-editable"]')!;

  act(() => {
    editable.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });

  expect(onDelete).not.toHaveBeenCalled();
  expect(onContentChange).toHaveBeenCalledWith('');
});

it('inserts pasted text into the callout when the document selection escaped to the page body', () => {
  const onContentChange = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(<EditingHandlersHarness onContentChange={onContentChange} />);
  });

  const editable = container.querySelector<HTMLDivElement>('[data-ui="callout-editable"]');
  expect(editable).toBeInstanceOf(HTMLDivElement);
  editable!.textContent = 'comment: ';
  const pageTarget = document.createElement('div');
  pageTarget.textContent = 'page body';
  container.append(pageTarget);
  const selection = window.getSelection();
  const escapedRange = document.createRange();
  escapedRange.selectNodeContents(pageTarget);
  escapedRange.collapse(false);
  selection?.removeAllRanges();
  selection?.addRange(escapedRange);
  const pasteEvent = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(pasteEvent, 'clipboardData', {
    value: { getData: (type: string) => (type === 'text/plain' ? 'pasted text' : '') },
  });

  act(() => {
    editable?.dispatchEvent(pasteEvent);
  });

  expect(pageTarget.textContent).toBe('page body');
  expect(editable?.textContent).toBe('comment: pasted text');
  expect(onContentChange).toHaveBeenCalledWith('comment: pasted text');
});

it('inserts pasted text at the caret owned by the callout shadow root', () => {
  const onContentChange = vi.fn();
  container = document.createElement('div');
  document.body.append(container);
  const shadowRoot = container!.attachShadow({ mode: 'open' });
  const shadowContainer = document.createElement('div');
  shadowRoot.append(shadowContainer);
  root = createRoot(shadowContainer);

  act(() => {
    root?.render(<EditingHandlersHarness onContentChange={onContentChange} />);
  });

  const editable = shadowRoot.querySelector<HTMLDivElement>('[data-ui="callout-editable"]');
  expect(editable).toBeInstanceOf(HTMLDivElement);
  editable!.textContent = 'before after';
  const caret = document.createRange();
  caret.setStart(editable!.firstChild!, 7);
  caret.collapse(true);
  const selection = document.getSelection();
  if (!selection) throw new Error('Expected a document selection fixture');
  const lightDomRange = document.createRange();
  lightDomRange.selectNodeContents(container!);
  selection.removeAllRanges();
  selection.addRange(lightDomRange);
  vi.spyOn(selection, 'getRangeAt').mockReturnValue(caret);
  Object.defineProperty(shadowRoot, 'getSelection', {
    configurable: true,
    value: () => selection,
  });
  vi.spyOn(window, 'getSelection').mockReturnValue(null);
  const pasteEvent = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(pasteEvent, 'clipboardData', {
    value: { getData: (type: string) => (type === 'text/plain' ? 'middle ' : '') },
  });

  act(() => {
    editable?.dispatchEvent(pasteEvent);
  });

  expect(editable?.textContent).toBe('before middle after');
  expect(onContentChange).toHaveBeenCalledWith('before middle after');
});

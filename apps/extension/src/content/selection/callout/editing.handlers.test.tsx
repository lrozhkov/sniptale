// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';

import { useCalloutEditingHandlers } from './editing.handlers';

function EditingHandlersHarness(props: { onContentChange: (html: string) => void }) {
  const contentEditableRef = React.useRef<HTMLDivElement | null>(null);
  const handlers = useCalloutEditingHandlers({
    contentEditableRef,
    frameId: 'frame-1',
    isEditing: true,
    onContentChange: props.onContentChange,
    onDelete: vi.fn(),
    onStartEditing: vi.fn(),
    onStopEditing: vi.fn(),
  });

  return (
    <div
      ref={contentEditableRef}
      contentEditable
      data-ui="callout-editable"
      onInput={handlers.handleInput}
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

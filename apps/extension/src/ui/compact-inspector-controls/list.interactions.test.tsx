// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { PresetRow } from './list';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderPresetRow(onApply = vi.fn(), onParentPointerDown = vi.fn()) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <div onPointerDown={onParentPointerDown}>
        <PresetRow
          item={{
            id: 'line-2',
            label: 'Линия 2',
            selected: false,
            supplement: <span data-supplement="true">Review</span>,
            onApply,
          }}
        />
      </div>
    );
  });

  return { onApply, onParentPointerDown };
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

it('applies a template row without leaking pointer ownership to parent popovers', () => {
  const { onApply, onParentPointerDown } = renderPresetRow();
  const row = container?.querySelector<HTMLButtonElement>('[data-editor-template-card="line-2"]');
  const PointerEventCtor = globalThis.PointerEvent ?? MouseEvent;
  expect(row?.querySelector('[data-supplement="true"]')?.textContent).toBe('Review');

  act(() => {
    row?.dispatchEvent(new PointerEventCtor('pointerdown', { bubbles: true }));
    row?.click();
  });

  expect(onParentPointerDown).not.toHaveBeenCalled();
  expect(onApply).toHaveBeenCalledOnce();
});

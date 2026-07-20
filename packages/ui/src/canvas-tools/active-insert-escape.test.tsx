// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useActiveCanvasInsertEscape } from './active-insert-escape';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderHarness(props: { active: boolean; onCancel: () => void }) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  function Harness() {
    useActiveCanvasInsertEscape(props);
    return <input data-testid="field" />;
  }

  act(() => {
    root?.render(<Harness />);
  });
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

it('clears active canvas insert tools on global Escape', () => {
  const onCancel = vi.fn();
  renderHarness({ active: true, onCancel });

  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  });

  expect(onCancel).toHaveBeenCalledTimes(1);
});

it('ignores inactive, handled, non-Escape, and editable-target key events', () => {
  const onCancel = vi.fn();
  renderHarness({ active: false, onCancel });

  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  });
  expect(onCancel).not.toHaveBeenCalled();

  act(() => {
    root?.render(
      <HarnessWithEditableTarget
        active
        onCancel={onCancel}
        target={container?.querySelector('input')}
      />
    );
  });
  const field = container?.querySelector('input');

  act(() => {
    field?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  });
  expect(onCancel).not.toHaveBeenCalled();

  const handled = new KeyboardEvent('keydown', { key: 'Escape' });
  Object.defineProperty(handled, 'defaultPrevented', { value: true });
  act(() => {
    window.dispatchEvent(handled);
  });
  expect(onCancel).not.toHaveBeenCalled();
});

function HarnessWithEditableTarget(props: {
  active: boolean;
  onCancel: () => void;
  target: HTMLInputElement | null | undefined;
}) {
  useActiveCanvasInsertEscape({ active: props.active, onCancel: props.onCancel });
  return <input defaultValue={props.target?.value ?? ''} />;
}

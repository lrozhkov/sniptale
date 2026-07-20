// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import {
  MockCompactInput,
  MockCompactRange,
  MockCompactSelect,
  MockEditorColorControl,
  MockEditorIconButton,
  MockNumericRow,
  MockPreviewTileGrid,
  MockSegmentedSelector,
  MockSelectField,
  MockToggleGrid,
} from './index.mock-ui.test-support';

function render(node: React.ReactNode) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(node));
  return { container, root };
}

it('routes selector, preview, color, and compact input mock UI adapters', () => {
  const calls = {
    change: vi.fn(),
    commit: vi.fn(),
    preview: vi.fn(),
  };
  const { container, root } = render(
    <>
      <MockSegmentedSelector
        ariaLabel="seg"
        columns={2}
        options={[{ label: 'One', value: 'one' }]}
        value="one"
        onChange={calls.change}
      />
      <MockPreviewTileGrid
        ariaLabel="preview"
        columns={2}
        options={[{ label: 'Two', value: 'two' }]}
        onChange={calls.change}
        renderPreview={(option: { label: string }) => option.label}
      />
      <MockEditorColorControl
        title="color"
        onChange={calls.change}
        onPreviewChange={calls.preview}
      />
      <MockCompactInput aria-label="input" onValueCommit={calls.commit} />
      <MockCompactRange aria-label="range" onValueCommit={calls.commit} />
      <MockCompactSelect
        aria-label="compact"
        options={[{ label: 'Three', value: 'three' }]}
        onChange={calls.change}
      />
    </>
  );

  container.querySelectorAll('button').forEach((button) => button.click());
  container.querySelectorAll('input').forEach((input) => {
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
  act(() => root.unmount());
  container.remove();

  expect(calls.change).toHaveBeenCalled();
  expect(calls.commit).toHaveBeenCalled();
  expect(calls.preview).toHaveBeenCalled();
});

it('routes row and select mock UI adapters', () => {
  const calls = {
    change: vi.fn(),
    commit: vi.fn(),
    preview: vi.fn(),
  };
  const { container, root } = render(
    <>
      <MockNumericRow
        label="number"
        value={4}
        onPreviewValue={calls.preview}
        onCommitValue={calls.commit}
      />
      <MockSelectField
        label="select"
        options={[{ label: 'Four', value: 'four' }]}
        onChange={calls.change}
      />
    </>
  );

  const numericInput = container.querySelector<HTMLInputElement>('[data-testid="range-number"]');
  if (!numericInput) {
    throw new Error('Expected numeric row input');
  }
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
      numericInput,
      '8'
    );
    numericInput.dispatchEvent(new Event('input', { bubbles: true }));
  });
  container.querySelectorAll('button').forEach((button) => button.click());
  container.querySelectorAll('input').forEach((input) => {
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
  act(() => root.unmount());
  container.remove();

  expect(calls.change).toHaveBeenCalled();
  expect(calls.commit).toHaveBeenCalled();
  expect(calls.preview).toHaveBeenCalled();
});

it('routes toggle and icon mock UI adapters', () => {
  const calls = {
    change: vi.fn(),
    mouseDown: vi.fn(),
    toggle: vi.fn(),
  };
  const { container, root } = render(
    <>
      <MockToggleGrid
        ariaLabel="toggles"
        options={[{ active: false, label: 'Toggle', onToggle: calls.toggle }]}
      />
      <MockEditorIconButton title="icon" onMouseDown={calls.mouseDown} onClick={calls.change}>
        Icon
      </MockEditorIconButton>
    </>
  );

  container.querySelectorAll('button').forEach((button) => button.click());
  container
    .querySelector('[data-testid="icon-icon"]')
    ?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  act(() => root.unmount());
  container.remove();

  expect(calls.change).toHaveBeenCalled();
  expect(calls.mouseDown).toHaveBeenCalled();
  expect(calls.toggle).toHaveBeenCalledOnce();
});

it('renders empty option mock UI adapters without callbacks', () => {
  const { container, root } = render(
    <>
      <MockSegmentedSelector ariaLabel="seg" />
      <MockPreviewTileGrid ariaLabel="preview" />
      <MockCompactSelect aria-label="compact" />
      <MockSelectField label="select" />
      <MockToggleGrid ariaLabel="toggles" />
    </>
  );

  expect(container.querySelectorAll('button')).toHaveLength(0);
  act(() => root.unmount());
  container.remove();
});

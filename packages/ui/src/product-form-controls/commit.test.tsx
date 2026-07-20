// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ProductInput, ProductRange } from './index';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

async function renderNode(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(node);
  });
}

it('commits product input value once for enter followed by blur', async () => {
  const onValueCommit = vi.fn();
  await renderNode(<ProductInput defaultValue="initial" onValueCommit={onValueCommit} />);
  const input = container?.querySelector('input');

  await act(async () => {
    input?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    input?.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  });

  expect(onValueCommit).toHaveBeenCalledOnce();
  expect(onValueCommit).toHaveBeenCalledWith('initial');
});

it('does not commit product input values for non-enter key presses', async () => {
  const onValueCommit = vi.fn();
  await renderNode(<ProductInput defaultValue="initial" onValueCommit={onValueCommit} />);
  const input = container?.querySelector('input');

  await act(async () => {
    input?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
  });

  expect(onValueCommit).not.toHaveBeenCalled();
});

it('commits product range value once for pointer release followed by blur', async () => {
  const onValueCommit = vi.fn();
  await renderNode(<ProductRange defaultValue={42} onValueCommit={onValueCommit} />);
  const input = container?.querySelector('input');

  await act(async () => {
    input?.dispatchEvent(new Event('pointerup', { bubbles: true }));
    input?.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  });

  expect(onValueCommit).toHaveBeenCalledOnce();
  expect(onValueCommit).toHaveBeenCalledWith(42);
});

it('commits product range values on keyboard finalization', async () => {
  const onValueCommit = vi.fn();
  await renderNode(<ProductRange defaultValue={42} onValueCommit={onValueCommit} />);
  const input = container?.querySelector('input');

  await act(async () => {
    input?.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'ArrowRight' }));
  });

  expect(onValueCommit).toHaveBeenCalledOnce();
  expect(onValueCommit).toHaveBeenCalledWith(42);
});

it('skips duplicate product input commits for the same finalized value', async () => {
  const onValueCommit = vi.fn();
  await renderNode(<ProductInput defaultValue="same" onValueCommit={onValueCommit} />);
  const input = container?.querySelector('input');

  await act(async () => {
    input?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    input?.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    input?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  });

  expect(onValueCommit).toHaveBeenCalledOnce();
  expect(onValueCommit).toHaveBeenCalledWith('same');
});

it('commits product range again after a later finalized value actually changes', async () => {
  const onValueCommit = vi.fn();
  await renderNode(<ProductRange defaultValue={42} onValueCommit={onValueCommit} />);
  const input = container?.querySelector('input');
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

  await act(async () => {
    input?.dispatchEvent(new Event('pointerup', { bubbles: true }));
  });

  await act(async () => {
    valueSetter?.call(input, '58');
    input?.dispatchEvent(new Event('pointerup', { bubbles: true }));
  });

  expect(onValueCommit).toHaveBeenCalledTimes(2);
  expect(onValueCommit).toHaveBeenNthCalledWith(1, 42);
  expect(onValueCommit).toHaveBeenNthCalledWith(2, 58);
});

it('does not fail when value finalization happens without a commit handler', async () => {
  await renderNode(<ProductRange defaultValue={42} />);
  const input = container?.querySelector('input');

  await act(async () => {
    input?.dispatchEvent(new Event('pointerup', { bubbles: true }));
    input?.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  });

  expect(input).not.toBeNull();
});

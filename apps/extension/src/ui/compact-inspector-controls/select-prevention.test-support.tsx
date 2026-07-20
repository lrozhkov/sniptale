// @vitest-environment jsdom
/* c8 ignore file */

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import { CompactSelect } from './index';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function themeSelect(props: {
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  ref?: (element: HTMLButtonElement | null) => void;
}) {
  return (
    <CompactSelect
      {...(props.ref ? { ref: props.ref } : {})}
      aria-label="Theme"
      value="dark"
      onClick={props.onClick}
      onKeyDown={props.onKeyDown}
      onChange={() => undefined}
      options={[
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
      ]}
    />
  );
}

function render(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(node));
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container?.remove();
  container = null;
});

it('honors trigger prevention, outside pointer close, and forwarded refs', async () => {
  const triggerRef = vi.fn();
  const onClick = vi.fn((event: React.MouseEvent<HTMLButtonElement>) => event.preventDefault());
  const onKeyDown = vi.fn((event: React.KeyboardEvent<HTMLButtonElement>) =>
    event.preventDefault()
  );

  render(themeSelect({ onClick, onKeyDown, ref: triggerRef }));
  const trigger = container!.querySelector<HTMLButtonElement>('button[aria-haspopup="listbox"]');
  act(() => {
    trigger!.click();
    trigger!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
  });
  expect(document.body.querySelector('[role="listbox"]')).toBeNull();
  expect(triggerRef).toHaveBeenCalledWith(trigger);

  act(() => root!.render(themeSelect({})));
  const nextTrigger = container!.querySelector<HTMLButtonElement>(
    'button[aria-haspopup="listbox"]'
  );
  await act(async () => {
    nextTrigger!.click();
    await Promise.resolve();
  });
  await act(async () => {
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    await Promise.resolve();
  });
  expect(document.body.querySelector('[role="listbox"]')).toBeNull();
});

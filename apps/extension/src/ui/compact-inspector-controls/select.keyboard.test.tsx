// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import { CompactSelect } from './index';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(node));
}

function getTrigger() {
  return container!.querySelector<HTMLButtonElement>('button[aria-haspopup="listbox"]')!;
}

function getMenuOptions() {
  return document.body.querySelectorAll<HTMLButtonElement>('[role="option"]');
}

function nextFrame() {
  return new Promise((resolve) => window.requestAnimationFrame(resolve));
}

afterEach(() => {
  if (!root || !container) {
    return;
  }
  act(() => root!.unmount());
  root = null;
  container!.remove();
  container = null;
});

it('keeps disabled triggers closed and routes trigger arrow keys', async () => {
  render(
    <div>
      <CompactSelect
        aria-label="Disabled"
        disabled
        value="dark"
        onChange={() => undefined}
        options={[{ value: 'dark', label: 'Dark' }]}
      />
      <CompactSelect
        aria-label="Theme"
        value=""
        placeholder="Pick theme"
        onChange={() => undefined}
        options={[
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
      />
    </div>
  );

  const triggers = container!.querySelectorAll<HTMLButtonElement>(
    'button[aria-haspopup="listbox"]'
  );
  act(() => {
    triggers[0]!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
  });
  expect(document.body.querySelector('[role="listbox"]')).toBeNull();

  await act(async () => {
    triggers[1]!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowUp' }));
    await nextFrame();
  });
  expect(document.body.querySelector('[role="listbox"]')).not.toBeNull();
});

it('supports menu keyboard navigation and keyboard selection', async () => {
  const onChange = vi.fn();

  render(
    <CompactSelect
      aria-label="Theme"
      value="dark"
      onChange={onChange}
      options={[
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
      ]}
    />
  );

  await act(async () => {
    getTrigger().click();
    await nextFrame();
  });

  const firstOption = getMenuOptions()[0]!;
  await act(async () => {
    firstOption.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
    firstOption.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowUp' }));
    firstOption.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Home' }));
    firstOption.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'End' }));
    await nextFrame();
  });
  expect(document.activeElement).toBe(getMenuOptions()[1]);

  act(() => {
    firstOption.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  });
  expect(onChange).toHaveBeenCalledWith('light');
  expect(document.body.querySelector('[role="listbox"]')).toBeNull();
});

it('closes the menu from option Escape', async () => {
  render(
    <CompactSelect
      aria-label="Theme"
      value="dark"
      onChange={() => undefined}
      options={[{ value: 'dark', label: 'Dark' }]}
    />
  );

  await act(async () => {
    getTrigger().click();
    await nextFrame();
  });
  act(() => {
    getMenuOptions()[0]!.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })
    );
  });

  expect(document.body.querySelector('[role="listbox"]')).toBeNull();
  expect(document.activeElement).toBe(getTrigger());
});

it('reports open state changes and keeps empty disabled selects closed', async () => {
  const onOpenChange = vi.fn();
  const onChange = vi.fn();

  render(
    <CompactSelect
      aria-label="Disabled"
      disabled
      value=""
      onChange={onChange}
      onOpenChange={onOpenChange}
      options={[]}
    />
  );

  await act(async () => {
    getTrigger().click();
    getTrigger().dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    getTrigger().dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
    await nextFrame();
  });

  expect(document.body.querySelector('[role="listbox"]')).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

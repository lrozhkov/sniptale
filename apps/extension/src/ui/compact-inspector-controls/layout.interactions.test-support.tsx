// @vitest-environment jsdom
/* c8 ignore file */

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import { CollapsibleSection, CompactSelect } from './index';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(node));
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

it('toggles collapsible sections through the compact header button', () => {
  const onOpenChange = vi.fn();

  render(
    <CollapsibleSection label="Shadow" defaultOpen={false} onOpenChange={onOpenChange}>
      Shadow controls
    </CollapsibleSection>
  );

  const button = container!.querySelector<HTMLButtonElement>('button[aria-expanded]');
  expect(button!.getAttribute('aria-expanded')).toBe('false');

  act(() => {
    button!.click();
  });

  expect(button!.getAttribute('aria-expanded')).toBe('true');
  expect(container!.textContent).toContain('Shadow controls');
  expect(onOpenChange).toHaveBeenCalledWith(true);
});

it('selects compact dropdown options without product select chrome', () => {
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

  const trigger = container!.querySelector<HTMLButtonElement>('button[aria-haspopup="listbox"]');
  expect(container!.querySelector('[data-ui="shared.ui.product-select"]')).toBeNull();

  act(() => {
    trigger!.click();
  });

  const listbox = document.body.querySelector('[role="listbox"]');
  expect(listbox).not.toBeNull();
  expect(listbox!.querySelector('.sniptale-select-option')).toBeNull();

  act(() => {
    listbox!.querySelectorAll<HTMLButtonElement>('[role="option"]')[0]!.click();
  });

  expect(onChange).toHaveBeenCalledWith('light');
});

it('supports keyboard navigation in compact dropdowns', () => {
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

  const trigger = container!.querySelector<HTMLButtonElement>('button[aria-haspopup="listbox"]');
  act(() => {
    trigger!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
  });

  const firstOption = document.body.querySelectorAll<HTMLButtonElement>('[role="option"]')[0];
  act(() => {
    firstOption!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
    firstOption!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowUp' }));
    firstOption!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Home' }));
    firstOption!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'End' }));
    firstOption!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  });

  expect(onChange).toHaveBeenCalledWith('light');
  expect(document.body.querySelector('[role="listbox"]')).toBeNull();
});

it('closes compact dropdowns when keyboard focus leaves the trigger and menu', () => {
  render(
    <div>
      <CompactSelect
        aria-label="Theme"
        value="dark"
        onChange={() => undefined}
        options={[
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
      />
      <button type="button">Next field</button>
    </div>
  );

  const trigger = container!.querySelector<HTMLButtonElement>('button[aria-haspopup="listbox"]');
  const nextField = Array.from(container!.querySelectorAll<HTMLButtonElement>('button')).find(
    (button) => button.textContent === 'Next field'
  );

  act(() => {
    trigger!.click();
  });

  expect(document.body.querySelector('[role="listbox"]')).not.toBeNull();

  act(() => {
    nextField!.focus();
    nextField!.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  });

  expect(document.body.querySelector('[role="listbox"]')).toBeNull();
});

it('keeps disabled dropdowns closed and supports Escape dismissal', () => {
  render(
    <div>
      <CompactSelect
        aria-label="Theme"
        disabled
        value="dark"
        onChange={() => undefined}
        options={[
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
      />
      <CompactSelect
        aria-label="Mode"
        value=""
        placeholder="Pick mode"
        onChange={() => undefined}
        options={[{ value: 'draw', label: 'Draw', disabled: true }]}
      />
    </div>
  );

  const triggers = container!.querySelectorAll<HTMLButtonElement>(
    'button[aria-haspopup="listbox"]'
  );
  act(() => {
    triggers![0]!.click();
    triggers![0]!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
    triggers![0]!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowUp' }));
  });
  expect(document.body.querySelector('[role="listbox"]')).toBeNull();

  act(() => {
    triggers![1]!.click();
  });
  expect(document.body.querySelector('[role="listbox"]')).not.toBeNull();

  act(() => {
    triggers![1]!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowUp' }));
    triggers![1]!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    triggers![1]!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
  });
  expect(document.body.querySelector('[role="listbox"]')).toBeNull();
});

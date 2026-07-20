// @vitest-environment jsdom

import type React from 'react';
import { act, useRef } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { CompactSelect } from './index';
import {
  THEME_OPTIONS,
  cleanupSelectRoot,
  getContainer,
  getMenuOptions,
  getTrigger,
  nextFrame,
  openSelectAndCloseOutside,
  render,
  renderPreventedSelect,
  rerenderPlainSelectWithNextField,
} from './select.interactions.test-support.tsx';

afterEach(cleanupSelectRoot);

it('opens from keyboard onto the selected option and renders the selected marker', async () => {
  render(
    <CompactSelect
      aria-label="Line style"
      title="Full line style"
      value="dash"
      onChange={() => undefined}
      options={[
        { value: 'solid', label: 'Сплошная' },
        { value: 'dash', label: 'Пунктир' },
      ]}
    />
  );

  const trigger = getTrigger();
  await act(async () => {
    trigger!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    await nextFrame();
  });

  const selectedOption = document.body.querySelector<HTMLButtonElement>(
    '[role="option"][data-selected="true"]'
  );
  expect(
    document.body.querySelector('[role="listbox"]')?.getAttribute('data-floating-ui-root')
  ).toBe('true');
  expect(selectedOption).not.toBeNull();
  expect(selectedOption!.textContent).toContain('Пунктир');
  expect(selectedOption!.getAttribute('title')).toBe('Пунктир');
  expect(selectedOption!.className).not.toContain('inset_2px_0_0');
  expect(trigger.getAttribute('title')).toBe('Full line style');
  expect(document.activeElement).toBe(selectedOption);

  act(() => {
    trigger!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  });
  expect(document.body.querySelector('[role="listbox"]')).toBeNull();
});

it('renders menu details and keeps disabled options inert', () => {
  const onChange = vi.fn();

  render(
    <CompactSelect
      aria-label="Line cap"
      value="round"
      onChange={onChange}
      options={[
        {
          value: 'round',
          label: 'Скругление',
          description: 'Мягкий край',
          icon: <span data-testid="cap-icon">R</span>,
        },
        { value: 'square', label: 'Квадрат', disabled: true },
      ]}
    />
  );

  const trigger = getTrigger();
  act(() => {
    trigger!.click();
  });

  const options = getMenuOptions();
  expect(document.body.textContent).toContain('Мягкий край');
  expect(document.body.querySelector('[data-testid="cap-icon"]')).not.toBeNull();
  expect(options[1]!.disabled).toBe(true);

  act(() => {
    options[1]!.click();
  });
  expect(onChange).not.toHaveBeenCalled();

  act(() => {
    options[0]!.click();
  });
  expect(onChange).toHaveBeenCalledWith('round');
});

it('selects an option without propagating pointer ownership to parent surfaces', async () => {
  const onChange = vi.fn();
  const onParentPointerDown = vi.fn();

  render(
    <div onPointerDown={onParentPointerDown}>
      <CompactSelect aria-label="Theme" value="dark" onChange={onChange} options={THEME_OPTIONS} />
    </div>
  );

  await act(async () => {
    getTrigger().click();
    await nextFrame();
  });
  const firstOption = getMenuOptions()[0]!;
  const PointerEventCtor = globalThis.PointerEvent ?? MouseEvent;

  act(() => {
    firstOption.dispatchEvent(new PointerEventCtor('pointerdown', { bubbles: true }));
    firstOption.click();
  });

  expect(onParentPointerDown).not.toHaveBeenCalled();
  expect(onChange).toHaveBeenCalledWith('light');
  expect(document.body.querySelector('[role="listbox"]')).toBeNull();
});

it('positions the menu from an explicit row anchor instead of the narrow value trigger', async () => {
  function AnchoredSelect() {
    const anchorRef = useRef<HTMLDivElement | null>(null);
    return (
      <div ref={anchorRef} data-testid="select-row-anchor">
        <CompactSelect
          aria-label="Line type"
          menuAnchorRef={anchorRef}
          value="sharp"
          onChange={() => undefined}
          options={[
            { value: 'sharp', label: 'Острая' },
            { value: 'curved', label: 'Изогнутая' },
          ]}
        />
      </div>
    );
  }

  render(<AnchoredSelect />);
  const anchor = getContainer().querySelector<HTMLElement>('[data-testid="select-row-anchor"]')!;
  anchor.getBoundingClientRect = () =>
    ({
      bottom: 72,
      height: 40,
      left: 32,
      right: 272,
      top: 32,
      width: 240,
      x: 32,
      y: 32,
      toJSON: () => undefined,
    }) as DOMRect;

  await act(async () => {
    getTrigger().click();
    await nextFrame();
  });

  const menu = document.body.querySelector<HTMLElement>('[role="listbox"]')!;
  expect(menu.style.left).toBe('32px');
  expect(menu.style.width).toBe('240px');
});

it('positions the menu before the first visible frame after trigger click', () => {
  render(
    <CompactSelect
      aria-label="Theme"
      value="dark"
      onChange={() => undefined}
      options={THEME_OPTIONS}
    />
  );

  getTrigger().getBoundingClientRect = () =>
    ({
      bottom: 84,
      height: 40,
      left: 48,
      right: 208,
      top: 44,
      width: 160,
      x: 48,
      y: 44,
      toJSON: () => undefined,
    }) as DOMRect;

  act(() => {
    getTrigger().click();
  });

  const menu = document.body.querySelector<HTMLElement>('[role="listbox"]')!;
  expect(menu.style.left).toBe('48px');
  expect(menu.style.top).toBe('89px');
});

it('toggles from the trigger with the Space key', async () => {
  render(
    <CompactSelect
      aria-label="Theme"
      value="dark"
      onChange={() => undefined}
      options={THEME_OPTIONS}
    />
  );

  const trigger = getTrigger();
  await act(async () => {
    trigger!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: ' ' }));
    await nextFrame();
  });
  expect(document.body.querySelector('[role="listbox"]')).not.toBeNull();

  act(() => {
    trigger!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: ' ' }));
  });
  expect(document.body.querySelector('[role="listbox"]')).toBeNull();
});

it('covers trigger guards, refs, outside close, and focus leave close', async () => {
  const triggerRef = vi.fn();
  const onClick = vi.fn((event: React.MouseEvent<HTMLButtonElement>) => event.preventDefault());
  const onKeyDown = vi.fn((event: React.KeyboardEvent<HTMLButtonElement>) =>
    event.preventDefault()
  );

  renderPreventedSelect({ onClick, onKeyDown, triggerRef });

  const preventedTrigger = getTrigger();
  act(() => {
    preventedTrigger.click();
    preventedTrigger.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
  });
  expect(triggerRef).toHaveBeenCalledWith(preventedTrigger);
  expect(document.body.querySelector('[role="listbox"]')).toBeNull();

  rerenderPlainSelectWithNextField();

  const trigger = getTrigger();
  await openSelectAndCloseOutside(trigger);

  await act(async () => {
    trigger.click();
    await nextFrame();
  });
  const nextField = Array.from(getContainer().querySelectorAll('button')).find(
    (button) => button.textContent === 'Next field'
  );
  act(() => {
    nextField!.focus();
    nextField!.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  });
  expect(document.body.querySelector('[role="listbox"]')).toBeNull();
});

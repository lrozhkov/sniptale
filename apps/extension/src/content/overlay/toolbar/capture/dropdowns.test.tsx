// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CaptureActionDropdown } from './action-dropdown';
import { TimerDropdown } from './timer-dropdown';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

const trustedKeyboard = vi.hoisted(() => vi.fn(() => true));
vi.mock('../../../platform/trusted-events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/trusted-events')>()),
  isTrustedKeyboardEvent: trustedKeyboard,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function ensureContainer() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }
}

function createButtonRef(rectOverrides?: Partial<DOMRect>) {
  const button = document.createElement('button');
  document.body.appendChild(button);
  vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({
    bottom: 80,
    height: 36,
    left: 100,
    right: 136,
    top: 44,
    width: 36,
    x: 100,
    y: 44,
    toJSON: () => ({}),
    ...rectOverrides,
  });

  return {
    current: button,
  } as React.RefObject<HTMLButtonElement | null>;
}

function createMenuRef() {
  return {
    current: null,
  } as React.RefObject<HTMLDivElement | null>;
}

function renderCaptureDropdown() {
  ensureContainer();
  const captureButtonRef = createButtonRef();

  act(() => {
    root?.render(
      <CaptureActionDropdown
        captureDropdownMenuRef={createMenuRef()}
        captureButtonRef={captureButtonRef}
        compactMenus={false}
        displayMode="horizontal"
        getMenuPosition={() => 'down'}
        captureAction="download_default"
        captureActionOptions={[
          {
            value: 'download_default',
            label: 'Download',
            hint: 'Default',
            icon: <span className="sniptale-popover-icon">Icon</span>,
          },
        ]}
        onSelect={() => undefined}
      />
    );
  });
}

function renderTimerDropdown() {
  ensureContainer();
  const timerButtonRef = createButtonRef();

  act(() => {
    root?.render(
      <TimerDropdown
        timerDropdownMenuRef={createMenuRef()}
        timerButtonRef={timerButtonRef}
        compactMenus={true}
        displayMode="horizontal"
        getMenuPosition={() => 'up'}
        timerDelay={3}
        timerOptions={[{ value: 3, label: '3 seconds', hint: 'Delay' }]}
        closeMenus={() => undefined}
        onTimerDelayChange={() => undefined}
      />
    );
  });
}

function renderVerticalCaptureDropdown() {
  ensureContainer();
  const captureButtonRef = createButtonRef();

  act(() => {
    root?.render(
      <CaptureActionDropdown
        captureDropdownMenuRef={createMenuRef()}
        captureButtonRef={captureButtonRef}
        compactMenus={true}
        displayMode="vertical"
        getMenuPosition={() => 'down'}
        captureAction="download_default"
        captureActionOptions={[
          {
            value: 'download_default',
            label: 'Download',
            hint: 'Default',
            icon: <span className="sniptale-popover-icon">Icon</span>,
          },
        ]}
        onSelect={() => undefined}
        viewportRightInset={0}
      />
    );
  });
}

function renderVerticalCaptureDropdownWithSidebarInset() {
  ensureContainer();
  const captureButtonRef = createButtonRef({
    left: 860,
    right: 896,
    x: 860,
  });

  act(() => {
    root?.render(
      <CaptureActionDropdown
        captureDropdownMenuRef={createMenuRef()}
        captureButtonRef={captureButtonRef}
        compactMenus={true}
        displayMode="vertical"
        getMenuPosition={() => 'down'}
        captureAction="download_default"
        captureActionOptions={[
          {
            value: 'download_default',
            label: 'Download',
            hint: 'Default',
            icon: <span className="sniptale-popover-icon">Icon</span>,
          },
        ]}
        onSelect={() => undefined}
        viewportRightInset={348}
      />
    );
  });
}

beforeEach(() => {
  trustedKeyboard.mockReturnValue(true);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('innerWidth', 1280);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ToolbarCaptureMenuDropdowns', () => {
  it('anchors the capture action dropdown through the shared floating-menu helper', () => {
    renderCaptureDropdown();

    const menuRoot = container?.querySelector('[data-ui="content.toolbar.capture-action-menu"]');
    const menuSurface = menuRoot?.querySelector('.sniptale-popover-menu') as HTMLDivElement | null;

    expect(menuRoot).not.toBeNull();
    expect(menuSurface?.style.top).toBe('calc(100% + 10px)');
    expect(menuSurface?.style.left).toBe('0px');
    expect(menuSurface?.querySelector('.sniptale-popover-icon')).not.toBeNull();
  });

  it('anchors the timer dropdown and keeps the semantic placement in sync', () => {
    renderTimerDropdown();

    const menuRoot = container?.querySelector('[data-ui="content.toolbar.timer-menu"]');
    const menu = menuRoot?.querySelector('.sniptale-popover-menu.sniptale-popover-up');

    expect(menuRoot).not.toBeNull();
    expect(menu).not.toBeNull();
    expect(menu instanceof HTMLDivElement ? menu.style.bottom : '').toBe('calc(100% + 10px)');
    expect(menuRoot?.querySelector('.sniptale-toolbar-menu-item-badge')).toBeNull();
  });

  it('opens vertical dropdown menus beside the toolbar without overlapping it', () => {
    renderVerticalCaptureDropdown();

    const menuRoot = container?.querySelector('[data-ui="content.toolbar.capture-action-menu"]');
    const menuSurface = menuRoot?.querySelector('.sniptale-popover-menu') as HTMLDivElement | null;

    expect(menuSurface?.style.left).toBe('calc(100% + 10px)');
    expect(menuSurface?.style.top).toBe('0px');
    expect(menuRoot?.querySelector('.sniptale-toolbar-menu--compact')).not.toBeNull();
    expect(menuSurface?.className.includes('sniptale-popover-side')).toBe(true);
    expect(menuSurface?.className.includes('sniptale-popover-up')).toBe(false);
  });

  it('opens the vertical capture dropdown away from the reserved sidebar work area', () => {
    renderVerticalCaptureDropdownWithSidebarInset();

    const menuRoot = container?.querySelector('[data-ui="content.toolbar.capture-action-menu"]');
    const menuSurface = menuRoot?.querySelector('.sniptale-popover-menu') as HTMLDivElement | null;

    expect(menuSurface?.style.left).toBe('auto');
    expect(menuSurface?.style.right).toBe('calc(100% + 10px)');
  });
});

function renderDigitMenu(kind: 'timer' | 'capture', count = 4) {
  ensureContainer();
  const triggerRef = createButtonRef();
  const menuRef = createMenuRef();
  const select = vi.fn();
  const close = vi.fn();
  const values = Array.from({ length: count }, (_, index) => index * 7);
  act(() =>
    root?.render(
      kind === 'timer' ? (
        <TimerDropdown
          timerDropdownMenuRef={menuRef}
          timerButtonRef={triggerRef}
          compactMenus
          displayMode="horizontal"
          getMenuPosition={() => 'down'}
          timerDelay={0}
          timerOptions={values.map((value) => ({ value, label: `Delay ${value}`, hint: 'Hint' }))}
          closeMenus={close}
          onTimerDelayChange={select}
        />
      ) : (
        <CaptureActionDropdown
          captureDropdownMenuRef={menuRef}
          captureButtonRef={triggerRef}
          compactMenus
          displayMode="horizontal"
          getMenuPosition={() => 'down'}
          captureAction="0"
          captureActionOptions={values.map((value) => ({
            value: String(value),
            label: `Action ${value}`,
            hint: 'Hint',
            icon: null,
          }))}
          onSelect={select}
        />
      )
    )
  );
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue({
    length: 1,
    0: new DOMRect(0, 0, 32, 32),
    item: () => new DOMRect(0, 0, 32, 32),
    [Symbol.iterator]: () => [new DOMRect(0, 0, 32, 32)][Symbol.iterator](),
  });
  return { select, close, triggerRef, menuRef };
}
function digit(key: string, init: KeyboardEventInit = {}, target: EventTarget = document.body) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    composed: true,
    cancelable: true,
    ...init,
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}
for (const kind of ['timer', 'capture'] as const) {
  it(`${kind} chooses visible order using digits and reserves aligned check slots`, () => {
    const { select, close, triggerRef } = renderDigitMenu(kind, 11);
    expect(
      [...container!.querySelectorAll('.sniptale-toolbar-menu-shortcut')].map(
        (node) => node.textContent
      )
    ).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']);
    expect(
      container!.querySelectorAll('.sniptale-toolbar-menu-item > .sniptale-popover-check')
    ).toHaveLength(11);
    expect(digit('2').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(triggerRef.current);
    expect(select).toHaveBeenLastCalledWith(kind === 'timer' ? 7 : '7');
    digit('0');
    expect(select).toHaveBeenLastCalledWith(kind === 'timer' ? 63 : '63');
    if (kind === 'timer') expect(close).toHaveBeenLastCalledWith(null);
  });
  it(`${kind} ignores unavailable digit and removes keyboard handling on unmount`, () => {
    const { select } = renderDigitMenu(kind);
    expect(digit('9').defaultPrevented).toBe(false);
    expect(select).not.toHaveBeenCalled();
    act(() => root?.unmount());
    root = null;
    expect(digit('2').defaultPrevented).toBe(false);
    expect(select).not.toHaveBeenCalled();
  });
}

for (const kind of ['timer', 'capture'] as const) {
  it(`${kind} preserves modified, repeated, composing, prevented and untrusted input`, () => {
    const { select } = renderDigitMenu(kind);
    for (const init of [
      { ctrlKey: true },
      { altKey: true },
      { metaKey: true },
      { shiftKey: true },
      { repeat: true },
      { isComposing: true },
    ]) {
      expect(digit('2', init).defaultPrevented).toBe(false);
    }
    const consumed = new KeyboardEvent('keydown', { key: '2', bubbles: true, cancelable: true });
    consumed.preventDefault();
    act(() => {
      document.body.dispatchEvent(consumed);
    });
    trustedKeyboard.mockReturnValue(false);
    expect(digit('2').defaultPrevented).toBe(false);
    expect(select).not.toHaveBeenCalled();
  });
  it(`${kind} preserves typing including a composed open shadow target`, () => {
    const { select } = renderDigitMenu(kind);
    for (const tag of ['input', 'textarea', 'select', 'div']) {
      const element = document.createElement(tag);
      if (tag === 'div') element.setAttribute('role', 'textbox');
      document.body.append(element);
      expect(digit('2', {}, element).defaultPrevented).toBe(false);
    }
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    const child = document.createElement('span');
    editable.append(child);
    document.body.append(editable);
    expect(digit('2', {}, child).defaultPrevented).toBe(false);
    const host = document.createElement('section');
    const input = document.createElement('input');
    host.attachShadow({ mode: 'open' }).append(input);
    document.body.append(host);
    expect(digit('2', {}, input).defaultPrevented).toBe(false);
    expect(select).not.toHaveBeenCalled();
  });
  it(`${kind} respects effective disabled state and resumes after the fieldset unlocks`, () => {
    const { select, triggerRef } = renderDigitMenu(kind);
    const fieldset = document.createElement('fieldset');
    fieldset.disabled = true;
    document.body.append(fieldset);
    fieldset.append(triggerRef.current!);
    expect(digit('2').defaultPrevented).toBe(false);
    expect(select).not.toHaveBeenCalled();
    fieldset.disabled = false;
    expect(digit('2').defaultPrevented).toBe(true);
    expect(select).toHaveBeenCalledOnce();
  });
  it(`${kind} refuses hidden, inert, dragging, customizing and modal-covered menus`, () => {
    const { select, triggerRef, menuRef } = renderDigitMenu(kind);
    const trigger = triggerRef.current!;
    for (const attribute of ['inert', 'data-dragging', 'data-page-customizing']) {
      trigger.setAttribute(attribute, 'true');
      expect(digit('2').defaultPrevented).toBe(false);
      trigger.removeAttribute(attribute);
    }
    trigger.style.visibility = 'hidden';
    expect(digit('2').defaultPrevented).toBe(false);
    trigger.style.visibility = '';
    menuRef.current!.style.visibility = 'hidden';
    expect(digit('2').defaultPrevented).toBe(false);
    menuRef.current!.style.visibility = '';
    const modal = document.createElement('div');
    modal.setAttribute('role', 'dialog');
    document.body.append(modal);
    expect(digit('2').defaultPrevented).toBe(false);
    modal.remove();
    expect(select).not.toHaveBeenCalled();
    expect(digit('2').defaultPrevented).toBe(true);
    expect(select).toHaveBeenCalledOnce();
  });
}

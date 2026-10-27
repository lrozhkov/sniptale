// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  source: vi.fn(),
  attach: vi.fn(),
  send: vi.fn(),
  toast: vi.fn(),
  layout: vi.fn(() => ({ menuPlacement: 'down', placement: 'down', style: { position: 'fixed' } })),
}));
vi.mock('../../../composition/persistence/quick-actions', () => ({ getQuickActions: mocks.list }));
vi.mock('../../../composition/persistence/infrastructure/browser-storage', () => ({
  browserStorage: { canObserveChanges: () => false },
}));
vi.mock('../../application/runtime-services/services', () => ({
  getContentRuntimeServices: () => ({
    contentActionIntent: {
      createTrustedContentActionIntentSource: mocks.source,
      attachContentActionIntent: mocks.attach,
    },
    messaging: { sendRuntimeMessage: mocks.send },
  }),
}));
vi.mock('@sniptale/ui/product-feedback/toast-service', () => ({ showToast: mocks.toast }));
vi.mock('../toolbar/menu/dropdown', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../toolbar/menu/dropdown')>()),
  resolveToolbarDropdownState: mocks.layout,
}));
const trustedKeyboard = vi.hoisted(() => vi.fn(() => true));
vi.mock('../../platform/trusted-events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/trusted-events')>()),
  isTrustedKeyboardEvent: trustedKeyboard,
}));
vi.mock('../toolbar/menu/direction', () => ({ useToolbarMenuDirection: () => 'down' }));
import { PageQuickActionsMenu } from './menu';
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  trustedKeyboard.mockReturnValue(true);
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue({
    length: 1,
    0: new DOMRect(0, 0, 32, 32),
    item: () => new DOMRect(0, 0, 32, 32),
    [Symbol.iterator]: () => [new DOMRect(0, 0, 32, 32)][Symbol.iterator](),
  });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.list.mockResolvedValue([
    { id: 'second', name: 'Second action', status: true },
    { id: 'disabled', name: 'Disabled action', status: false },
    { id: 'first', name: 'First action', status: true },
  ]);
  mocks.source.mockReturnValue({ kind: 'trusted-content-event' });
  mocks.attach.mockImplementation(async (message) => message);
  mocks.send.mockResolvedValue({ success: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function open() {
  await act(async () => root.render(<PageQuickActionsMenu />));
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[data-ui="content.quick-actions.trigger"]')!.click()
  );
}
function item(name: string) {
  return [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
    button.textContent?.includes(name)
  )!;
}
it('shows accepted enabled order and closes the actual menu before native capture delivery', async () => {
  await open();
  const labels = [...container.querySelectorAll('.sniptale-toolbar-menu-item')].map(
    (entry) => entry.textContent
  );
  expect(labels.join('|')).toContain('Second action');
  expect(labels.join('|')).not.toContain('Disabled action');
  expect(container.textContent!.indexOf('Second action')).toBeLessThan(
    container.textContent!.indexOf('First action')
  );
  mocks.send.mockImplementation(async () => {
    expect(container.querySelector('[data-ui="content.quick-actions.dropdown"]')).toBeNull();
    return { success: true };
  });
  await act(async () => item('Second action').click());
  expect(mocks.send).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'TRIGGER_QUICK_ACTION', actionId: 'second' })
  );
});
it('refuses untrusted sources, then permits an explicit retry after a native refusal', async () => {
  await open();
  mocks.source.mockReturnValueOnce(null);
  await act(async () => item('Second action').click());
  expect(mocks.send).not.toHaveBeenCalled();
  mocks.send.mockResolvedValueOnce({ success: false });
  await act(async () => item('Second action').click());
  expect(mocks.toast).toHaveBeenCalledOnce();
  await open();
  await act(async () => item('Second action').click());
  expect(mocks.send).toHaveBeenCalledTimes(2);
});

it('exposes the shared disclosure indicator in both open and closed states', async () => {
  await open();
  const trigger = container.querySelector<HTMLButtonElement>(
    '[data-ui="content.quick-actions.trigger"]'
  )!;
  expect(trigger.getAttribute('data-menu-indicator')).toBe('true');
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  await act(async () => trigger.click());
  expect(trigger.getAttribute('data-menu-indicator')).toBe('true');
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
});

it('aligns the menu start with adjacent toolbar menus', async () => {
  await open();
  expect(mocks.layout).toHaveBeenCalledWith(expect.objectContaining({ preferredAlign: 'start' }));
});

it('constrains the actual menu scroll surface to the space below its trigger', async () => {
  vi.stubGlobal('innerHeight', 560);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(100, 300, 32, 32)
  );
  await open();
  const menu = container.querySelector<HTMLElement>('.sniptale-popover-menu')!;
  expect(menu.style.maxHeight).toBe('210px');
  expect(menu.style.overflowY).toBe('auto');
});

it('renders decorative configured and fallback glyphs beside the accessible action labels', async () => {
  mocks.list.mockResolvedValue([
    { id: 'configured', name: 'Configured', icon: 'Zap', status: true },
    { id: 'fallback', name: 'Fallback', icon: '__proto__', status: true },
  ]);
  await open();
  const configured = item('Configured').querySelector('svg');
  const fallback = item('Fallback').querySelector('svg');
  expect(configured).not.toBeNull();
  expect(fallback).not.toBeNull();
  expect(configured!.getAttribute('aria-hidden')).toBe('true');
  expect(fallback!.getAttribute('aria-hidden')).toBe('true');
  expect(configured!.innerHTML).not.toBe(fallback!.innerHTML);
});

async function pressDigit(
  key: string,
  init: KeyboardEventInit = {},
  target: EventTarget = document.body
) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    composed: true,
    cancelable: true,
    ...init,
  });
  await act(async () => {
    target.dispatchEvent(event);
  });
  return event;
}
it('numbers only first10 enabled actions and delivers original keyboard event before native capture', async () => {
  mocks.list.mockResolvedValue([
    { id: 'disabled', name: 'Disabled', status: false },
    ...Array.from({ length: 11 }, (_, index) => ({
      id: `digit-${index}`,
      name: `Choice ${index + 1}`,
      status: true,
    })),
  ]);
  await open();
  expect([...container.querySelectorAll('kbd')].map((node) => node.textContent)).toEqual([
    '1',
    '2',
    '3',
    '4',
    '5',
    '6',
    '7',
    '8',
    '9',
    '0',
  ]);
  mocks.send.mockImplementation(async () => {
    expect(container.querySelector('[data-ui="content.quick-actions.dropdown"]')).toBeNull();
    return { success: true };
  });
  const event = await pressDigit('0');
  expect(event.defaultPrevented).toBe(true);
  expect(mocks.source).toHaveBeenCalledWith(event);
  expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ actionId: 'digit-9' }));
  await pressDigit('0');
  expect(mocks.send).toHaveBeenCalledOnce();
  await open();
  await pressDigit('1');
  expect(mocks.send).toHaveBeenLastCalledWith(expect.objectContaining({ actionId: 'digit-0' }));
});
it('keeps menu and input for invalid or guarded digits, then allows explicit keyboard retry', async () => {
  await open();
  for (const init of [
    { ctrlKey: true },
    { altKey: true },
    { metaKey: true },
    { shiftKey: true },
    { repeat: true },
    { isComposing: true },
  ]) {
    expect((await pressDigit('2', init)).defaultPrevented).toBe(false);
  }
  trustedKeyboard.mockReturnValue(false);
  expect((await pressDigit('2')).defaultPrevented).toBe(false);
  trustedKeyboard.mockReturnValue(true);
  expect((await pressDigit('0')).defaultPrevented).toBe(false);
  const host = document.createElement('section');
  const input = document.createElement('input');
  host.attachShadow({ mode: 'open' }).append(input);
  document.body.append(host);
  expect((await pressDigit('2', {}, input)).defaultPrevented).toBe(false);
  host.remove();
  expect(mocks.send).not.toHaveBeenCalled();
  mocks.send.mockResolvedValueOnce({ success: false });
  await pressDigit('2');
  expect(mocks.toast).toHaveBeenCalledOnce();
  await open();
  await pressDigit('2');
  expect(mocks.send).toHaveBeenCalledTimes(2);
});

it('refuses disabled fieldset, invisible, inert, customizing, dragging and covered quick action controls', async () => {
  await open();
  const trigger = container.querySelector<HTMLButtonElement>(
    '[data-ui="content.quick-actions.trigger"]'
  )!;
  const fieldset = document.createElement('fieldset');
  trigger.parentElement!.prepend(fieldset);
  fieldset.append(trigger);
  fieldset.disabled = true;
  expect((await pressDigit('1')).defaultPrevented).toBe(false);
  fieldset.disabled = false;
  for (const attribute of ['inert', 'data-page-customizing', 'data-dragging']) {
    fieldset.setAttribute(attribute, 'true');
    expect((await pressDigit('1')).defaultPrevented).toBe(false);
    fieldset.removeAttribute(attribute);
  }
  trigger.style.visibility = 'hidden';
  expect((await pressDigit('1')).defaultPrevented).toBe(false);
  trigger.style.visibility = '';
  const modal = document.createElement('div');
  modal.setAttribute('role', 'dialog');
  container.append(modal);
  expect((await pressDigit('1')).defaultPrevented).toBe(false);
  modal.remove();
  const consumed = new KeyboardEvent('keydown', { key: '1', bubbles: true, cancelable: true });
  consumed.preventDefault();
  await act(async () => {
    document.body.dispatchEvent(consumed);
  });
  expect(mocks.send).not.toHaveBeenCalled();
  await pressDigit('1');
  expect(mocks.send).toHaveBeenCalledOnce();
});
it('keeps one delivery while pending and removes digit routing when disposed', async () => {
  let complete!: (result: { success: boolean }) => void;
  mocks.send.mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      })
  );
  await open();
  await pressDigit('2');
  expect(
    container.querySelector<HTMLButtonElement>('[data-ui="content.quick-actions.trigger"]')!
      .disabled
  ).toBe(true);
  await pressDigit('2');
  expect(mocks.send).toHaveBeenCalledOnce();
  await act(async () => {
    complete({ success: true });
  });
  await open();
  await act(async () => root.render(null));
  expect((await pressDigit('2')).defaultPrevented).toBe(false);
  expect(mocks.send).toHaveBeenCalledOnce();
});

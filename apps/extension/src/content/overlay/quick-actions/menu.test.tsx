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
vi.mock('../toolbar/menu/dropdown', () => ({
  resolveToolbarDropdownState: mocks.layout,
  ToolbarMenuDropdown: ({ children }: { children: React.ReactNode }) => (
    <div data-ui="test.dropdown">{children}</div>
  ),
}));
vi.mock('../toolbar/menu/direction', () => ({ useToolbarMenuDirection: () => 'down' }));
import { PageQuickActionsMenu } from './menu';
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
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
    expect(container.querySelector('[data-ui="test.dropdown"]')).toBeNull();
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

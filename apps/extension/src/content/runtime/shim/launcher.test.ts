// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { normalizePageLaunchPreferences } from '../../../contracts/page-launch';
const trusted = vi.hoisted(() => vi.fn(() => false));
vi.mock('../../platform/trusted-events', () => ({ isTrustedDomEvent: trusted }));
import { createShimLauncher } from './launcher';
import type { ShimLauncherOptions } from './launcher';
let launcher: ReturnType<typeof createShimLauncher> | undefined;
beforeEach(() => {
  trusted.mockReturnValue(false);
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});
afterEach(() => {
  launcher?.dispose();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});
function options(): ShimLauncherOptions {
  return {
    presentation: {
      preferences: {
        ...normalizePageLaunchPreferences(undefined),
        enabled: true,
        quickActionsCorner: true,
      },
      locale: 'en',
      theme: 'light',
    },
    actions: [{ id: 'action', status: true, hotkey: null, name: '<script>unsafe</script>' }],
    open: vi.fn(async () => undefined),
    trigger: vi.fn(async () => undefined),
    saveCorner: vi.fn(async () => undefined),
  };
}
it('has one named native group, updates accepted corner and disposes without writes', () => {
  const source = options();
  launcher = createShimLauncher(source);
  const host = document.getElementById('sniptale-page-launcher')!;
  expect(host.getAttribute('data-floating-ui-capture-transient')).toBe('true');
  const group = host.shadowRoot!.querySelector<HTMLElement>('.group')!;
  expect(group.style.right).toBe('20px');
  source.presentation.preferences.corner = 'top-left';
  launcher.update(source);
  expect(group.style.left).toBe('20px');
  expect(group.style.top).toBe('20px');
  launcher.dispose();
  expect(host.isConnected).toBe(false);
  expect(source.saveCorner).not.toHaveBeenCalled();
});
it('refuses synthetic privileged clicks and leaves the site uncovered in hover-only mode', () => {
  const source = options();
  source.presentation.preferences.hoverOnly = true;
  launcher = createShimLauncher(source);
  const shadow = document.getElementById('sniptale-page-launcher')!.shadowRoot!;
  shadow.querySelector<HTMLButtonElement>('button[aria-label="Open page toolbar"]')!.click();
  shadow.querySelector<HTMLButtonElement>('button[aria-label="Quick actions"]')!.click();
  expect(source.open).not.toHaveBeenCalled();
  expect(source.trigger).not.toHaveBeenCalled();
  expect(shadow.querySelector('.menu')).toBeNull();
  expect(shadow.querySelector('.group')!.getAttribute('data-hidden')).toBe('true');
});

function currentShadow() {
  return document.getElementById('sniptale-page-launcher')!.shadowRoot!;
}
function namedButton(name: string) {
  return currentShadow().querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!;
}
async function flush() {
  for (let index = 0; index < 6; index++) await Promise.resolve();
}
it('hides the menu group before delivery and permits retry after failure', async () => {
  trusted.mockReturnValue(true);
  const source = options();
  let reject!: (error: Error) => void;
  source.trigger = vi.fn(
    () =>
      new Promise<void>((_, fail) => {
        reject = fail;
      })
  );
  launcher = createShimLauncher(source);
  const shadow = currentShadow();
  namedButton('Quick actions').click();
  const item = shadow.querySelector<HTMLButtonElement>('[role="menuitem"]')!;
  expect(item.textContent).toBe('<script>unsafe</script>');
  expect(shadow.querySelector('script')).toBeNull();
  item.click();
  expect(shadow.querySelector('[role="menu"]')).toBeNull();
  expect(shadow.querySelector('.group')!.getAttribute('data-hidden')).toBe('true');
  namedButton('Quick actions').click();
  expect(source.trigger).toHaveBeenCalledOnce();
  reject(new Error('Native refusal'));
  await flush();
  expect(shadow.querySelector('[role="alert"]')!.textContent).toBe('Action failed. Try again.');
  source.trigger = vi.fn(async () => undefined);
  launcher.update(source);
  namedButton('Quick actions').click();
  shadow.querySelector<HTMLButtonElement>('[role="menuitem"]')!.click();
  await flush();
  expect(source.trigger).toHaveBeenCalledOnce();
  expect(shadow.querySelector('[role="alert"]')).toBeNull();
});
it('supports keyboard menu navigation, Escape focus restoration and outside dismissal', () => {
  trusted.mockReturnValue(true);
  const source = options();
  source.actions.push({ id: 'second', status: true, name: 'Second', hotkey: null });
  launcher = createShimLauncher(source);
  const shadow = currentShadow();
  namedButton('Quick actions').click();
  const items = shadow.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
  expect(shadow.activeElement).toBe(items[0]);
  items[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
  expect(shadow.activeElement).toBe(items[1]);
  items[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
  expect(shadow.activeElement).toBe(items[0]);
  items[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(shadow.querySelector('[role="menu"]')).toBeNull();
  expect(shadow.activeElement).toBe(namedButton('Quick actions'));
  namedButton('Quick actions').click();
  document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
  expect(shadow.querySelector('[role="menu"]')).toBeNull();
});
it('keeps the accepted corner on save refusal and discards a pending view on disposal', async () => {
  trusted.mockReturnValue(true);
  const source = options();
  source.saveCorner = vi.fn(async () => {
    throw new Error('Write refused');
  });
  launcher = createShimLauncher(source);
  namedButton('Move corner group').dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })
  );
  await flush();
  expect(source.saveCorner).toHaveBeenCalledWith('bottom-left', expect.any(Event));
  expect(currentShadow().querySelector<HTMLElement>('.group')!.style.right).toBe('20px');
  expect(currentShadow().querySelector('[role="alert"]')).not.toBeNull();
  let complete!: () => void;
  source.open = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        complete = resolve;
      })
  );
  launcher.update(source);
  namedButton('Open page toolbar').click();
  launcher.dispose();
  complete();
  await flush();
  expect(document.getElementById('sniptale-page-launcher')).toBeNull();
});
it('reveals the entire hover group in its corner and keeps menus available while focused', () => {
  trusted.mockReturnValue(true);
  const source = options();
  source.presentation.preferences.hoverOnly = true;
  launcher = createShimLauncher(source);
  const shadow = currentShadow();
  expect(shadow.querySelector('.group')!.getAttribute('data-hidden')).toBe('true');
  window.dispatchEvent(
    new MouseEvent('pointermove', { clientX: innerWidth - 10, clientY: innerHeight - 10 })
  );
  expect(shadow.querySelector('.group')!.getAttribute('data-hidden')).toBe('false');
  namedButton('Quick actions').click();
  window.dispatchEvent(
    new MouseEvent('pointermove', { clientX: innerWidth / 2, clientY: innerHeight / 2 })
  );
  expect(shadow.querySelector('.group')!.getAttribute('data-hidden')).toBe('false');
  expect(shadow.querySelector('[role="menu"]')).not.toBeNull();
});

it('dismisses stale open actions after accepted list or locale updates and restores logical focus', async () => {
  trusted.mockReturnValue(true);
  const source = options();
  source.actions.push({ id: 'second', status: true, name: 'Second', hotkey: null });
  launcher = createShimLauncher(source);
  namedButton('Quick actions').click();
  const next = {
    ...source,
    actions: [
      { id: 'second', status: true, name: 'Renamed second', hotkey: null },
      { ...source.actions[0]!, status: false },
      { id: 'third', status: true, name: 'Third', hotkey: null },
    ],
  };
  launcher.update(next);
  expect(currentShadow().querySelector('[role="menu"]')).toBeNull();
  expect(currentShadow().activeElement).toBe(namedButton('Quick actions'));
  namedButton('Quick actions').click();
  expect(
    [...currentShadow().querySelectorAll('[role="menuitem"]')].map((item) => item.textContent)
  ).toEqual(['Renamed second', 'Third']);
  launcher.update({
    ...next,
    presentation: {
      ...next.presentation,
      preferences: { ...next.presentation.preferences, hoverOnly: true },
    },
  });
  expect(currentShadow().querySelector('[role="menu"]')).not.toBeNull();
  launcher.update({ ...next, presentation: { ...next.presentation, locale: 'ru' } });
  expect(currentShadow().querySelector('[role="menu"]')).toBeNull();
  expect(currentShadow().activeElement).toBe(namedButton('Быстрые действия'));
  namedButton('Быстрые действия').click();
  currentShadow().querySelector<HTMLButtonElement>('[role="menuitem"]')!.click();
  await flush();
  expect(source.trigger).toHaveBeenCalledWith(next.actions[0], expect.any(Event));
});

// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CommandPressScope } from '@sniptale/ui/control-language/press';
import { WelcomePage } from './welcome';
import type { WelcomeDependencies } from '../../runtime/welcome';
vi.mock('../../../platform/i18n', async (original) => {
  const actual = await original<typeof import('../../../platform/i18n')>();
  return {
    ...actual,
    useAppLocale: () => 'en',
    translate: (
      key: Parameters<typeof actual.translate>[0],
      locale: Parameters<typeof actual.translate>[1] = 'en'
    ) => actual.translate(key, locale),
  };
});
vi.mock('../../../ui/theme', () => ({
  getStoredThemePreference: () => 'system',
  setAppThemePreference: vi.fn(),
}));
let host: HTMLDivElement;
let root: Root;
const button = (id: string) => host.querySelector<HTMLButtonElement>(`[data-ui="welcome.${id}"]`)!;
function fixture(access: 'prompt' | 'granted' | 'denied' | 'device-busy' | 'no-device' = 'prompt') {
  const deps: WelcomeDependencies = {
    observe: vi.fn(async () => ({ microphone: access, camera: access, origins: access })),
    subscribe: () => () => undefined,
    request: vi.fn(async () => access),
    locale: vi.fn(async () => undefined),
    theme: vi.fn(async () => undefined),
  };
  const finish = vi.fn();
  return {
    deps,
    finish,
    mount: async () => {
      await act(async () =>
        root.render(
          <CommandPressScope value>
            <WelcomePage dependencies={deps} onFinish={finish} />
          </CommandPressScope>
        )
      );
    },
  };
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
it('permits setup later without requesting access or changing preferences', async () => {
  const f = fixture();
  await f.mount();
  await act(async () => button('skip').click());
  expect(f.finish).toHaveBeenCalledOnce();
  expect(f.deps.request).not.toHaveBeenCalled();
  expect(f.deps.theme).not.toHaveBeenCalled();
  expect(f.deps.locale).not.toHaveBeenCalled();
});
it.each(['prompt', 'granted', 'denied', 'device-busy', 'no-device'] as const)(
  'offers function access in %s state without device selection and keeps completion optional',
  async (access) => {
    const f = fixture(access);
    await f.mount();
    await act(async () => button('next').click());
    expect(host.querySelector('h1')?.textContent).toBe('Set up access');
    expect(document.activeElement).toBe(host.querySelector('h1'));
    expect(host.querySelector('[role="combobox"]')).toBeNull();
    if (access === 'granted') {
      expect(button('microphone-allow')).toBeNull();
      expect(button('camera-allow')).toBeNull();
      expect(button('origins-allow')).toBeNull();
    } else {
      await act(async () => button('microphone-allow').click());
      await act(async () => button('camera-allow').click());
      await act(async () => button('origins-allow').click());
      expect(f.deps.request).toHaveBeenNthCalledWith(1, 'microphone');
      expect(f.deps.request).toHaveBeenNthCalledWith(2, 'camera');
      expect(f.deps.request).toHaveBeenNthCalledWith(3, 'origins');
    }
    if (access === 'denied')
      expect(host.querySelectorAll('.welcome-permission-help')).toHaveLength(1);
    await act(async () => button('next').click());
    expect(host.querySelector('h1')?.textContent).toBe('Keep Sniptale close');
    expect(f.finish).not.toHaveBeenCalled();
    expect(host.querySelector('[data-ui="welcome.pin-illustration"]')?.getAttribute('src')).toBe(
      '/welcome/pin-extension.webp'
    );
    expect(host.querySelector('[data-ui="welcome.settings-link"]')?.getAttribute('href')).toBe(
      'index.html?section=interface-browser&view=interface'
    );
    expect(button('skip')).toBeNull();
    await act(async () => button('back').click());
    expect(host.querySelector('h1')?.textContent).toBe('Set up access');
    await act(async () => button('next').click());
    await act(async () => {
      button('next').click();
      button('next').click();
    });
    expect(f.finish).toHaveBeenCalledOnce();
  }
);
it('keeps a permission observation failure recoverable before the final step', async () => {
  const f = fixture();
  vi.mocked(f.deps.observe).mockRejectedValueOnce(new Error('read failed'));
  await f.mount();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Could not check access');
  await act(async () => button('next').click());
  expect(button('next').disabled).toBe(true);
  const retry = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) => node.textContent === 'Retry loading'
  )!;
  await act(async () => retry.click());
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(button('next').disabled).toBe(false);
});
it('presents language and theme once and persists direct choices including the current value', async () => {
  const f = fixture();
  await f.mount();
  expect([...host.querySelectorAll('legend')].map((node) => node.textContent)).toEqual([
    'Language',
    'Theme',
  ]);
  expect(host.querySelector('[role="combobox"]')).toBeNull();
  const choice = (field: string, name: string) =>
    [...host.querySelectorAll<HTMLButtonElement>(`[data-ui="welcome.${field}"] button`)].find(
      (node) => node.textContent === name
    )!;
  await act(async () => choice('language', 'English').click());
  expect(f.deps.locale).toHaveBeenCalledWith('en');
  await act(async () => choice('language', 'Русский').click());
  expect(f.deps.locale).toHaveBeenCalledWith('ru');
  await act(async () => choice('theme', 'System').click());
  expect(f.deps.theme).toHaveBeenCalledWith('system');
  await act(async () => choice('theme', 'Dark').click());
  expect(f.deps.theme).toHaveBeenCalledWith('dark');
  expect(choice('theme', 'Dark').getAttribute('aria-pressed')).toBe('true');
});

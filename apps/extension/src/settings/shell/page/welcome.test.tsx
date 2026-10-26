// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CommandPressScope } from '@sniptale/ui/control-language/press';
import { WelcomePage } from './welcome';
import type { WelcomeDependencies } from '../../runtime/welcome';
const owners = vi.hoisted(() => ({
  permissions: vi.fn(),
  camera: vi.fn(),
  microphone: vi.fn(),
  origins: vi.fn(),
  permissionChanges: vi.fn<(listener: () => void) => () => void>(() => vi.fn()),
}));
vi.mock('../../sections/system/access-data/permissions/permissions-lib', async (original) => ({
  ...(await original<
    typeof import('../../sections/system/access-data/permissions/permissions-lib')
  >()),
  readPermissionsSnapshot: owners.permissions,
  requestCameraAccess: owners.camera,
  subscribeToPermissionChanges: owners.permissionChanges,
}));
vi.mock('../../sections/system/access-data/permissions/useSettingsPermissions', () => ({
  requestSettingsOriginAccess: owners.origins,
}));
vi.mock('@sniptale/platform/browser/user-media', async (original) => ({
  ...(await original<typeof import('@sniptale/platform/browser/user-media')>()),
  requestMicrophoneAccess: owners.microphone,
}));
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
  owners.permissions.mockReset();
  owners.origins.mockReset();
  owners.microphone.mockReset();
  owners.camera.mockReset();
  owners.permissionChanges.mockClear();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

async function mountDefaultPermissions() {
  await act(async () =>
    root.render(
      <CommandPressScope value>
        <WelcomePage onFinish={vi.fn()} />
      </CommandPressScope>
    )
  );
  await act(async () => button('next').click());
}

function accessState(kind: 'microphone' | 'camera' | 'origins') {
  return host
    .querySelector(`[data-ui="welcome.${kind}"] [data-access]`)
    ?.getAttribute('data-access');
}

it('uses default media probes and the existing optional origin transaction only on explicit requests', async () => {
  owners.permissions.mockResolvedValue([{ id: 'origins', state: 'prompt' }]);
  owners.microphone.mockResolvedValue('granted');
  owners.camera.mockResolvedValue('granted');
  await mountDefaultPermissions();
  expect(owners.origins).not.toHaveBeenCalled();
  expect(owners.microphone).not.toHaveBeenCalled();
  expect(owners.camera).not.toHaveBeenCalled();
  await act(async () => button('microphone-allow').click());
  expect(owners.microphone).toHaveBeenCalledExactlyOnceWith();
  await act(async () => button('camera-allow').click());
  expect(owners.camera).toHaveBeenCalledExactlyOnceWith();
  owners.origins.mockResolvedValueOnce(false);
  await act(async () => button('origins-allow').click());
  expect(accessState('origins')).toBe('denied');
  expect(owners.origins).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'origins', originPatterns: ['<all_urls>'] })
  );
  owners.origins.mockRejectedValueOnce(new Error('registration failed'));
  await act(async () => button('origins-allow').click());
  expect(accessState('origins')).toBe('error');
  expect(host.querySelector('[role="alert"]')).toBeNull();
  owners.origins.mockResolvedValueOnce(true);
  owners.permissions.mockResolvedValue([{ id: 'origins', state: 'granted' }]);
  await act(async () => button('origins-allow').click());
  expect(accessState('origins')).toBe('granted');
  owners.permissions.mockResolvedValue([{ id: 'origins', state: 'prompt' }]);
  await act(async () => owners.permissionChanges.mock.calls.at(-1)![0]());
  expect(accessState('origins')).toBe('prompt');
});

it('preserves actual camera absence through the production permission adapter', async () => {
  const actual = await vi.importActual<
    typeof import('../../sections/system/access-data/permissions/permissions-lib')
  >('../../sections/system/access-data/permissions/permissions-lib');
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: vi.fn().mockRejectedValue(new DOMException('No camera', 'NotFoundError')),
    },
  });
  owners.permissions.mockResolvedValue([{ id: 'camera', state: 'prompt' }]);
  owners.camera.mockImplementationOnce(actual.requestCameraAccess);
  await mountDefaultPermissions();
  await act(async () => button('camera-allow').click());
  expect(accessState('camera')).toBe('no-device');
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

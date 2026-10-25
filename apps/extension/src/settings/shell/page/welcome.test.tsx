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
    translate: (key: Parameters<typeof actual.translate>[0]) => actual.translate(key, 'en'),
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
    load: vi.fn(async () => ({ microphoneDeviceId: 'missing', webcamDeviceId: null })),
    observe: vi.fn(async () => ({
      microphoneAccess: access,
      cameraAccess: access,
      microphones: [],
      cameras: [],
    })),
    subscribe: () => () => undefined,
    request: vi.fn(async () => access),
    saveVideo: vi.fn(async () => undefined),
    saveVoice: vi.fn(async () => undefined),
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
it('permits setup later before any device permission or preference write', async () => {
  const f = fixture();
  await f.mount();
  await act(async () => button('skip').click());
  expect(f.finish).toHaveBeenCalledOnce();
  expect(f.deps.request).not.toHaveBeenCalled();
  expect(f.deps.saveVideo).not.toHaveBeenCalled();
});
it.each(['prompt', 'granted', 'denied', 'device-busy', 'no-device'] as const)(
  'shows %s device state and permits completion without device access',
  async (access) => {
    const f = fixture(access);
    await f.mount();
    await act(async () => button('next').click());
    expect(host.querySelector('h2')?.textContent).toBe('Microphone and camera');
    await act(async () => button('microphone-allow').click());
    await act(async () => button('camera-allow').click());
    expect(f.deps.request).toHaveBeenNthCalledWith(1, 'microphone', 'missing');
    expect(f.deps.request).toHaveBeenNthCalledWith(2, 'camera', null);
    expect(button('microphone-device').disabled).toBe(access !== 'granted');
    if (access === 'granted' || access === 'no-device')
      expect(host.textContent).toContain('No devices found');
    await act(async () => button('next').click());
    expect(document.activeElement).toBe(host.querySelector('h2'));
    expect(host.querySelector('h2')?.textContent).toBe('Ready');
    await act(async () => button('back').click());
    expect(host.querySelector('h2')?.textContent).toBe('Microphone and camera');
    await act(async () => button('next').click());
    await act(async () => button('next').click());
    expect(f.finish).toHaveBeenCalledOnce();
  }
);
it('keeps the load error and retry visible, then permits recovery', async () => {
  const f = fixture();
  vi.mocked(f.deps.load).mockRejectedValueOnce(new Error('read-failed'));
  await f.mount();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('could not load');
  await act(async () => button('next').click());
  expect(button('next').disabled).toBe(true);
  const retry = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) => node.textContent === 'Retry loading'
  )!;
  await act(async () => retry.click());
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(button('next').disabled).toBe(false);
});
it('retains the device step after a save failure and completes on explicit retry', async () => {
  const f = fixture();
  vi.mocked(f.deps.saveVoice).mockRejectedValueOnce(new Error('write-failed'));
  await f.mount();
  await act(async () => button('next').click());
  await act(async () => button('next').click());
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('could not save');
  expect(host.querySelector('h2')?.textContent).toBe('Microphone and camera');
  await act(async () => button('next').click());
  expect(host.querySelector('h2')?.textContent).toBe('Ready');
});

it('keeps a disconnected selection visible and supplies fallback names for unnamed devices', async () => {
  const f = fixture('granted');
  vi.mocked(f.deps.observe).mockResolvedValue({
    microphoneAccess: 'granted',
    cameraAccess: 'granted',
    microphones: [
      { deviceId: 'mic', label: 'Desk microphone' },
      { deviceId: 'mic2', label: '' },
    ],
    cameras: [{ deviceId: 'cam', label: '' }],
  });
  await f.mount();
  await act(async () => button('next').click());
  expect(button('microphone-device').textContent).toContain('Selected device unavailable');
  expect(button('camera-device').textContent).toContain('Default camera');
  await act(async () => button('microphone-device').click());
  expect(document.body.textContent).toContain('Desk microphone');
  expect(document.body.textContent).toContain('Unnamed microphone');
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (node) => node.textContent === 'Desk microphone'
  )!;
  await act(async () => option.click());
  await act(async () => button('next').click());
  expect(f.deps.saveVoice).toHaveBeenCalledWith('mic');
});

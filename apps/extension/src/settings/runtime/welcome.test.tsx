// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { THEME_PREFERENCE_CHANGE_EVENT } from '@sniptale/ui/branding';
import { useWelcomeSetup, type WelcomeDependencies, type WelcomeAccess } from './welcome';

const owners = vi.hoisted(() => ({
  theme: vi.fn(() => 'system'),
}));
vi.mock('../../ui/theme', () => ({
  getStoredThemePreference: owners.theme,
  setAppThemePreference: vi.fn(),
}));
vi.mock('../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../platform/i18n')>()),
  useAppLocale: () => 'en',
}));
const access: WelcomeAccess = { microphone: 'prompt', camera: 'prompt', origins: 'prompt' };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function fixture() {
  return {
    observe: vi.fn(async () => access),
    subscribe: vi.fn<WelcomeDependencies['subscribe']>(() => vi.fn()),
    request: vi.fn<WelcomeDependencies['request']>().mockResolvedValue('granted'),
    locale: vi.fn<WelcomeDependencies['locale']>().mockResolvedValue(undefined),
    theme: vi.fn<WelcomeDependencies['theme']>().mockResolvedValue(undefined),
  };
}
let root: Root;
let setup: ReturnType<typeof useWelcomeSetup>;
function Harness({ deps }: { deps: WelcomeDependencies }) {
  setup = useWelcomeSetup(deps);
  return null;
}
async function mount(deps: WelcomeDependencies) {
  await act(async () => root.render(<Harness deps={deps} />));
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  owners.theme.mockReset().mockReturnValue('system');
  root = createRoot(document.createElement('div'));
});
afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});
it('observes access without prompting, recording, enumerating or writing device preferences', async () => {
  const enumerate = vi.fn();
  const capture = vi.fn();
  vi.stubGlobal('navigator', {
    mediaDevices: { enumerateDevices: enumerate, getUserMedia: capture },
  });
  const deps = fixture();
  await mount(deps);
  expect(setup.access).toEqual(access);
  expect(setup.loading).toBe(false);
  expect(deps.request).not.toHaveBeenCalled();
  expect(deps.locale).not.toHaveBeenCalled();
  expect(deps.theme).not.toHaveBeenCalled();
  await act(async () => setup.next());
  await act(async () => setup.next());
  expect(setup.step).toBe(2);
  expect(enumerate).not.toHaveBeenCalled();
  expect(capture).not.toHaveBeenCalled();
});
it.each(['denied', 'no-device', 'device-busy', 'error'] as const)(
  'keeps %s feedback and permits continuing without access',
  async (state) => {
    const deps = fixture();
    deps.request.mockResolvedValue(state);
    await mount(deps);
    await act(async () => setup.request('microphone'));
    expect(deps.request).toHaveBeenCalledExactlyOnceWith('microphone');
    expect(setup.access.microphone).toBe(state);
    await act(async () => setup.next());
    await act(async () => setup.next());
    expect(setup.step).toBe(2);
  }
);
it('serializes explicit requests and ignores completion after unmount', async () => {
  const deps = fixture();
  const pending = deferred<'denied'>();
  deps.request.mockReturnValue(pending.promise);
  await mount(deps);
  let work!: Promise<void>;
  act(() => {
    work = setup.request('camera');
    void setup.request('origins');
    setup.next();
  });
  expect(deps.request).toHaveBeenCalledTimes(1);
  expect(setup.step).toBe(0);
  expect(setup.busy).toBe(true);
  act(() => root.render(null));
  const reads = deps.observe.mock.calls.length;
  await act(async () => {
    pending.resolve('denied');
    await work;
  });
  expect(deps.observe).toHaveBeenCalledTimes(reads);
});
it('ignores out-of-order observations and unsubscribes on disposal', async () => {
  const deps = fixture();
  const dispose = vi.fn();
  deps.subscribe.mockReturnValue(dispose);
  await mount(deps);
  const old = deferred<WelcomeAccess>();
  const current = deferred<WelcomeAccess>();
  deps.observe.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  const listener = deps.subscribe.mock.calls[0]![0];
  act(() => {
    listener();
    listener();
  });
  await act(async () => current.resolve({ ...access, origins: 'granted' }));
  await act(async () => old.resolve(access));
  expect(setup.access.origins).toBe('granted');
  act(() => root.render(null));
  expect(dispose).toHaveBeenCalledOnce();
});
it('retains load failure until explicit retry before entering the final step', async () => {
  const deps = fixture();
  deps.observe.mockRejectedValueOnce(new Error('read failed'));
  await mount(deps);
  expect(setup.error).toBe('load');
  act(() => setup.next());
  act(() => setup.next());
  expect(setup.step).toBe(1);
  await act(async () => setup.retry());
  expect(setup.error).toBeNull();
  act(() => setup.next());
  expect(setup.step).toBe(2);
});
it('restores late theme hydration and removes its event listener on unmount', async () => {
  await mount(fixture());
  expect(setup.theme).toBe('system');
  owners.theme.mockReturnValue('dark');
  act(() => window.dispatchEvent(new Event(THEME_PREFERENCE_CHANGE_EVENT)));
  expect(setup.theme).toBe('dark');
  act(() => root.render(null));
  const reads = owners.theme.mock.calls.length;
  window.dispatchEvent(new Event(THEME_PREFERENCE_CHANGE_EVENT));
  expect(owners.theme).toHaveBeenCalledTimes(reads);
});
it('saves appearance through existing owners and retains a valid theme after refusal', async () => {
  const deps = fixture();
  await mount(deps);
  act(() => {
    setup.setLocale('invalid');
    setup.setTheme('invalid');
  });
  expect(deps.locale).not.toHaveBeenCalled();
  expect(deps.theme).not.toHaveBeenCalled();
  await act(async () => setup.setLocale('ru'));
  expect(deps.locale).toHaveBeenCalledWith('ru');
  await act(async () => setup.setTheme('dark'));
  expect(setup.theme).toBe('dark');
  deps.theme.mockRejectedValueOnce(new Error('save failed'));
  await act(async () => setup.setTheme('light'));
  expect(setup.theme).toBe('dark');
  expect(setup.error).toBe('save');
});

// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useWelcomeSetup, type WelcomeDependencies, type WelcomeDevices } from './welcome';
import {
  installPersistenceLockManagerForTests,
  runWithPersistentDataErasureBarrier,
} from '../../composition/persistence/infrastructure/mutation-barrier';

vi.mock('../../ui/theme', () => ({
  getStoredThemePreference: () => 'system',
  setAppThemePreference: vi.fn(),
}));
vi.mock('../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../platform/i18n')>()),
  useAppLocale: () => 'en',
}));

const owners = vi.hoisted(() => ({
  loadSettings: vi.fn(),
  loadVideo: vi.fn(),
  saveVideo: vi.fn(),
  saveVoice: vi.fn(),
  permissions: vi.fn(),
  camera: vi.fn(),
  microphone: vi.fn(),
}));
vi.mock('./store/runtime', () => ({
  loadSettingsRuntimeState: owners.loadSettings,
  updateSettingsRuntimeState: owners.saveVoice,
}));
vi.mock('../../composition/persistence/capture-settings', () => ({
  loadVideoSettings: owners.loadVideo,
  patchVideoSettings: owners.saveVideo,
}));
vi.mock('../sections/system/access-data/permissions/permissions-lib', async (original) => ({
  ...(await original<
    typeof import('../sections/system/access-data/permissions/permissions-lib')
  >()),
  readPermissionsSnapshot: owners.permissions,
  requestCameraAccess: owners.camera,
}));
vi.mock('@sniptale/platform/browser/user-media', async (original) => ({
  ...(await original<typeof import('@sniptale/platform/browser/user-media')>()),
  requestMicrophoneAccess: owners.microphone,
}));

const devices: WelcomeDevices = {
  microphoneAccess: 'prompt',
  cameraAccess: 'prompt',
  microphones: [{ deviceId: 'mic', label: 'Desk microphone' }],
  cameras: [{ deviceId: 'cam', label: 'Desk camera' }],
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function fixture() {
  return {
    load: vi.fn(async () => ({ microphoneDeviceId: null, webcamDeviceId: null })),
    observe: vi.fn(async () => devices),
    subscribe: vi.fn<WelcomeDependencies['subscribe']>(() => vi.fn()),
    request: vi.fn<WelcomeDependencies['request']>().mockResolvedValue('granted'),
    saveVideo: vi.fn<WelcomeDependencies['saveVideo']>().mockResolvedValue(undefined),
    saveVoice: vi.fn<WelcomeDependencies['saveVoice']>().mockResolvedValue(undefined),
    locale: vi.fn<WelcomeDependencies['locale']>().mockResolvedValue(undefined),
    theme: vi.fn<WelcomeDependencies['theme']>().mockResolvedValue(undefined),
  };
}
let host: HTMLDivElement;
let root: Root;
let setup: ReturnType<typeof useWelcomeSetup>;
function Harness({ deps }: { deps: WelcomeDependencies | undefined }) {
  setup = useWelcomeSetup(deps);
  return null;
}
async function mount(deps?: WelcomeDependencies) {
  await act(async () => root.render(<Harness deps={deps} />));
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('chrome', undefined);
  installPersistenceLockManagerForTests(null);
  host = document.createElement('div');
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  installPersistenceLockManagerForTests(null);
  vi.unstubAllGlobals();
});

it('loads setup without prompting, recording or writing preferences', async () => {
  const deps = fixture();
  await mount(deps);
  expect(setup.loading).toBe(false);
  expect(setup.devices).toEqual(devices);
  expect(deps.request).not.toHaveBeenCalled();
  expect(deps.saveVideo).not.toHaveBeenCalled();
  expect(deps.saveVoice).not.toHaveBeenCalled();
});

it('saves only selected device fields through both existing owners', async () => {
  const deps = fixture();
  await mount(deps);
  act(() => {
    setup.chooseMicrophone('mic');
    setup.chooseCamera('cam');
  });
  await act(async () => setup.next());
  expect(setup.step).toBe(1);
  await act(async () => setup.next());
  expect(deps.saveVideo).toHaveBeenCalledWith({ microphoneDeviceId: 'mic', webcamDeviceId: 'cam' });
  expect(deps.saveVoice).toHaveBeenCalledWith('mic');
  expect(setup.step).toBe(2);
});

it('retains completed video preferences and drafts when the voice write fails, then permits retry', async () => {
  const deps = fixture();
  deps.saveVoice.mockRejectedValueOnce(new Error('storage-failed'));
  await mount(deps);
  act(() => setup.chooseMicrophone('mic'));
  await act(async () => setup.next());
  await act(async () => setup.next());
  expect(setup.step).toBe(1);
  expect(setup.error).toBe('save');
  expect(setup.choice.microphoneDeviceId).toBe('mic');
  expect(deps.saveVideo).toHaveBeenCalledOnce();
  await act(async () => setup.next());
  expect(setup.step).toBe(2);
  expect(deps.saveVoice).toHaveBeenCalledTimes(2);
});

it('does not start the voice writer after video refusal and retries without losing the draft', async () => {
  const deps = fixture();
  deps.saveVideo.mockRejectedValueOnce(new Error('refused'));
  await mount(deps);
  act(() => setup.chooseCamera('cam'));
  await act(async () => setup.next());
  await act(async () => setup.next());
  expect(deps.saveVoice).not.toHaveBeenCalled();
  expect(setup.choice.webcamDeviceId).toBe('cam');
  expect(setup.step).toBe(1);
  await act(async () => setup.next());
  expect(setup.step).toBe(2);
});

it('keeps a load failure visible across appearance changes and refuses device writes until reload', async () => {
  const deps = fixture();
  deps.load.mockRejectedValueOnce(new Error('unavailable'));
  await mount(deps);
  expect(setup.error).toBe('load');
  await act(async () => setup.setTheme('dark'));
  expect(setup.error).toBe('load');
  await act(async () => setup.next());
  await act(async () => setup.next());
  expect(deps.saveVideo).not.toHaveBeenCalled();
  await act(async () => setup.retry());
  await act(async () => setup.next());
  expect(setup.step).toBe(2);
});

it('preserves acquisition errors that an ordinary permission query cannot describe', async () => {
  const deps = fixture();
  deps.request.mockResolvedValueOnce('no-device');
  await mount(deps);
  await act(async () => setup.request('microphone'));
  expect(setup.devices.microphoneAccess).toBe('no-device');
  expect(setup.error).toBeNull();
  expect(deps.saveVideo).not.toHaveBeenCalled();
});

it('does not repeat pending writes or start a second writer after unmount', async () => {
  const deps = fixture();
  const gate = deferred<void>();
  deps.saveVideo.mockReturnValue(gate.promise);
  await mount(deps);
  await act(async () => setup.next());
  let pending!: Promise<void>;
  await act(async () => {
    pending = setup.next();
  });
  await act(async () => setup.next());
  expect(deps.saveVideo).toHaveBeenCalledOnce();
  act(() => root.unmount());
  root = createRoot(host);
  await act(async () => {
    gate.resolve();
    await pending;
  });
  expect(deps.saveVoice).not.toHaveBeenCalled();
});

it('holds the transition through both writes so erasure cannot occur between them', async () => {
  const deps = fixture();
  const entered = deferred<void>();
  const release = deferred<void>();
  const events: string[] = [];
  deps.saveVideo.mockImplementation(async () => {
    entered.resolve();
    await release.promise;
    events.push('video');
  });
  deps.saveVoice.mockImplementation(async () => {
    events.push('voice');
  });
  await mount(deps);
  await act(async () => setup.next());
  let pending!: Promise<void>;
  await act(async () => {
    pending = setup.next();
    await entered.promise;
  });
  const erasure = runWithPersistentDataErasureBarrier(async () => {
    events.push('erase');
  });
  expect(events).toEqual([]);
  await act(async () => {
    release.resolve();
    await pending;
    await erasure;
  });
  expect(events).toEqual(['video', 'voice', 'erase']);
});

it('ignores out-of-order device observations without overwriting a newer browser result', async () => {
  const deps = fixture();
  await mount(deps);
  const old = deferred<WelcomeDevices>();
  const current = deferred<WelcomeDevices>();
  deps.observe.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  const listener = deps.subscribe.mock.calls[0]?.[0];
  if (!listener) throw new Error('Device listener missing');
  act(() => {
    listener();
    listener();
  });
  await act(async () =>
    current.resolve({ ...devices, cameras: [{ deviceId: 'new', label: 'New camera' }] })
  );
  await act(async () => old.resolve(devices));
  expect(setup.devices.cameras[0]?.deviceId).toBe('new');
});

it('keeps loading active while initial preferences are pending and discards completion after unmount', async () => {
  const deps = fixture();
  const loaded = deferred<{ microphoneDeviceId: null; webcamDeviceId: null }>();
  deps.load.mockReturnValue(loaded.promise);
  await mount(deps);
  expect(setup.loading).toBe(true);
  act(() => {
    setup.chooseCamera('cam');
  });
  await act(async () => setup.next());
  await act(async () => setup.next());
  expect(deps.saveVideo).not.toHaveBeenCalled();
  act(() => root.unmount());
  root = createRoot(host);
  await act(async () => loaded.resolve({ microphoneDeviceId: null, webcamDeviceId: null }));
  expect(deps.observe).not.toHaveBeenCalled();
});

it('reports observation failure and retries loading before allowing device writes', async () => {
  const deps = fixture();
  deps.observe.mockRejectedValueOnce(new Error('enumeration-failed'));
  await mount(deps);
  expect(setup.error).toBe('load');
  await act(async () => setup.retry());
  expect(setup.error).toBeNull();
  act(() => {
    setup.chooseCamera('');
    setup.chooseMicrophone('');
  });
  expect(setup.choice).toEqual({ microphoneDeviceId: null, webcamDeviceId: null });
});

it('saves valid appearance preferences and ignores invalid values', async () => {
  const deps = fixture();
  await mount(deps);
  await act(async () => {
    setup.setLocale('xx');
    setup.setTheme('invalid');
  });
  expect(deps.locale).not.toHaveBeenCalled();
  expect(deps.theme).not.toHaveBeenCalled();
  await act(async () => setup.setLocale('ru'));
  expect(deps.locale).toHaveBeenCalledWith('ru');
  await act(async () => setup.setTheme('dark'));
  expect(setup.theme).toBe('dark');
  deps.theme.mockRejectedValueOnce(new Error('write-failed'));
  await act(async () => setup.setTheme('light'));
  expect(setup.error).toBe('save');
  expect(setup.theme).toBe('dark');
  await act(async () => setup.next());
  act(() => setup.back());
  expect(setup.step).toBe(0);
});

it('connects browser device observations and explicit permission requests to canonical preference owners', async () => {
  const media = new EventTarget();
  const permission = new EventTarget();
  const enumerate = vi.fn(async () => [
    { kind: 'audioinput', deviceId: 'native-mic', label: 'Microphone' },
    { kind: 'videoinput', deviceId: 'native-cam', label: '' },
    { kind: 'audioinput', deviceId: '', label: '' },
  ]);
  Object.assign(media, { enumerateDevices: enumerate });
  vi.stubGlobal('navigator', {
    mediaDevices: media,
    permissions: { query: vi.fn(async () => permission) },
  });
  owners.loadSettings.mockResolvedValue({ voiceInput: { microphoneDeviceId: 'native-mic' } });
  owners.loadVideo.mockResolvedValue({ webcamDeviceId: 'native-cam' });
  owners.permissions.mockResolvedValue([
    { id: 'microphone', state: 'granted' },
    { id: 'camera', state: 'granted' },
  ]);
  owners.microphone.mockResolvedValue('granted');
  owners.camera.mockResolvedValue('granted');
  owners.saveVideo.mockResolvedValue(undefined);
  owners.saveVoice.mockResolvedValue(undefined);
  await mount();
  expect(setup.devices.microphones).toEqual([{ deviceId: 'native-mic', label: 'Microphone' }]);
  expect(setup.devices.cameras).toEqual([{ deviceId: 'native-cam', label: '' }]);
  expect(owners.microphone).not.toHaveBeenCalled();
  await act(async () => setup.request('microphone'));
  expect(owners.microphone).toHaveBeenCalledWith('native-mic');
  await act(async () => setup.request('camera'));
  expect(owners.camera).toHaveBeenCalledOnce();
  await act(async () => {
    media.dispatchEvent(new Event('devicechange'));
  });
  await act(async () => {
    permission.dispatchEvent(new Event('change'));
  });
  await act(async () => setup.next());
  await act(async () => setup.next());
  expect(owners.saveVideo).toHaveBeenCalledWith({
    microphoneDeviceId: 'native-mic',
    webcamDeviceId: 'native-cam',
  });
  expect(owners.saveVoice).toHaveBeenCalledWith({
    voiceInput: { microphoneDeviceId: 'native-mic' },
  });
  const remove = vi.spyOn(permission, 'removeEventListener');
  act(() => root.unmount());
  root = createRoot(host);
  expect(remove).toHaveBeenCalledTimes(2);
});

it('preserves actual camera absence through the production welcome dependency', async () => {
  const actual = await vi.importActual<
    typeof import('../sections/system/access-data/permissions/permissions-lib')
  >('../sections/system/access-data/permissions/permissions-lib');
  const media = new EventTarget();
  Object.assign(media, {
    getUserMedia: vi.fn().mockRejectedValue(new DOMException('No camera', 'NotFoundError')),
    enumerateDevices: vi.fn(async () => []),
  });
  vi.stubGlobal('navigator', { mediaDevices: media });
  owners.loadSettings.mockResolvedValue({});
  owners.loadVideo.mockResolvedValue({});
  owners.permissions.mockResolvedValue([{ id: 'camera', state: 'prompt' }]);
  owners.camera.mockImplementationOnce(actual.requestCameraAccess);
  await mount();
  await act(async () => setup.request('camera'));
  expect(setup.devices.cameraAccess).toBe('no-device');
});

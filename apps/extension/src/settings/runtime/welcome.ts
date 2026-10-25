import { useCallback, useEffect, useRef, useState } from 'react';
import {
  requestMicrophoneAccess,
  type MicrophoneAccessState,
} from '@sniptale/platform/browser/user-media';
import { useAppLocale, setLocalePreference, type AppLocale } from '../../platform/i18n';
import {
  getStoredThemePreference,
  setAppThemePreference,
  type AppThemePreference,
} from '../../ui/theme';
import {
  loadVideoSettings,
  patchVideoSettings,
} from '../../composition/persistence/capture-settings';
import { runWithPersistenceMutationTransition } from '../../composition/persistence/infrastructure/mutation-barrier';
import { loadSettingsRuntimeState, updateSettingsRuntimeState } from './store/runtime';
import {
  initialPermissions,
  readPermissionsSnapshot,
  requestCameraAccess,
  type PermissionState,
} from '../sections/system/access-data/permissions/permissions-lib';

type DeviceKind = 'microphone' | 'camera';
type Device = { deviceId: string; label: string };
type Access = MicrophoneAccessState | PermissionState;
type DeviceChoice = { microphoneDeviceId: string | null; webcamDeviceId: string | null };
export interface WelcomeDevices {
  microphones: Device[];
  cameras: Device[];
  microphoneAccess: Access;
  cameraAccess: Access;
}

async function observeDevices(): Promise<WelcomeDevices> {
  const [devices, permissions] = await Promise.all([
    navigator.mediaDevices?.enumerateDevices() ?? Promise.resolve([]),
    readPermissionsSnapshot(
      initialPermissions.filter((item) => item.id === 'microphone' || item.id === 'camera')
    ),
  ]);
  const options = (kind: MediaDeviceKind) =>
    devices
      .filter((device) => device.kind === kind && device.deviceId !== '')
      .map(({ deviceId, label }) => ({ deviceId, label }));
  return {
    microphones: options('audioinput'),
    cameras: options('videoinput'),
    microphoneAccess: permissions.find((item) => item.id === 'microphone')?.state ?? 'unknown',
    cameraAccess: permissions.find((item) => item.id === 'camera')?.state ?? 'unknown',
  };
}

function subscribeDevices(listener: () => void): () => void {
  let disposed = false;
  const statuses: PermissionStatus[] = [];
  navigator.mediaDevices?.addEventListener('devicechange', listener);
  window.addEventListener('focus', listener);
  for (const name of ['microphone', 'camera'] as const) {
    void navigator.permissions
      ?.query({ name: name as PermissionName })
      .then((status) => {
        if (disposed) return;
        statuses.push(status);
        status.addEventListener('change', listener);
      })
      .catch(() => undefined);
  }
  return () => {
    disposed = true;
    navigator.mediaDevices?.removeEventListener('devicechange', listener);
    window.removeEventListener('focus', listener);
    for (const status of statuses) status.removeEventListener('change', listener);
  };
}

export interface WelcomeDependencies {
  load(): Promise<DeviceChoice>;
  observe(): Promise<WelcomeDevices>;
  subscribe(listener: () => void): () => void;
  request(kind: DeviceKind, deviceId: string | null): Promise<Access>;
  saveVideo(choice: DeviceChoice): Promise<unknown>;
  saveVoice(microphoneDeviceId: string | null): Promise<unknown>;
  locale(locale: AppLocale): Promise<void>;
  theme(theme: AppThemePreference): Promise<unknown>;
}

const defaultDependencies: WelcomeDependencies = {
  load: async () => {
    const [settings, video] = await Promise.all([loadSettingsRuntimeState(), loadVideoSettings()]);
    return {
      microphoneDeviceId: settings.voiceInput?.microphoneDeviceId ?? null,
      webcamDeviceId: video.webcamDeviceId ?? null,
    };
  },
  observe: observeDevices,
  subscribe: subscribeDevices,
  request: (kind, deviceId) =>
    kind === 'microphone' ? requestMicrophoneAccess(deviceId) : requestCameraAccess(),
  saveVideo: patchVideoSettings,
  saveVoice: (microphoneDeviceId) =>
    updateSettingsRuntimeState({ voiceInput: { microphoneDeviceId } }),
  locale: setLocalePreference,
  theme: setAppThemePreference,
};

const emptyDevices: WelcomeDevices = {
  microphones: [],
  cameras: [],
  microphoneAccess: 'unknown',
  cameraAccess: 'unknown',
};

/** Owns disposable setup drafts and calls the existing preference and permission owners. */
export function useWelcomeSetup(dependencies?: WelcomeDependencies) {
  const [deps] = useState(() => dependencies ?? defaultDependencies);
  const locale = useAppLocale();
  const [theme, setTheme] = useState<AppThemePreference>(
    () => getStoredThemePreference() ?? 'system'
  );
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [choice, setChoice] = useState<DeviceChoice>({
    microphoneDeviceId: null,
    webcamDeviceId: null,
  });
  const [devices, setDevices] = useState(emptyDevices);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'load' | 'save' | null>(null);
  const lifecycle = useRef(0);
  const observation = useRef(0);
  const operation = useRef(false);

  const refresh = useCallback(
    async (generation: number, failure?: { kind: DeviceKind; access: Access }) => {
      const version = ++observation.current;
      try {
        const next = await deps.observe();
        if (generation === lifecycle.current && version === observation.current) {
          setDevices(
            failure
              ? {
                  ...next,
                  [failure.kind === 'microphone' ? 'microphoneAccess' : 'cameraAccess']:
                    failure.access,
                }
              : next
          );
        }
      } catch {
        if (generation === lifecycle.current && version === observation.current) setError('load');
      }
    },
    [deps]
  );

  const load = useCallback(
    async (generation: number) => {
      setLoading(true);
      setError(null);
      try {
        const next = await deps.load();
        if (generation !== lifecycle.current) return;
        setChoice(next);
        await refresh(generation);
      } catch {
        if (generation === lifecycle.current) setError('load');
      } finally {
        if (generation === lifecycle.current) setLoading(false);
      }
    },
    [deps, refresh]
  );

  useEffect(() => {
    const generation = ++lifecycle.current;
    void load(generation);
    const dispose = deps.subscribe(() => void refresh(generation));
    return () => {
      lifecycle.current += 1;
      observation.current += 1;
      dispose();
    };
  }, [deps, load, refresh]);

  async function perform(action: (generation: number) => Promise<void>) {
    if (operation.current) return;
    operation.current = true;
    const generation = lifecycle.current;
    setBusy(true);
    setError((current) => (current === 'load' ? 'load' : null));
    try {
      await action(generation);
    } catch {
      if (generation === lifecycle.current)
        setError((current) => (current === 'load' ? 'load' : 'save'));
    } finally {
      operation.current = false;
      if (generation === lifecycle.current) setBusy(false);
    }
  }

  function request(kind: DeviceKind) {
    return perform(async (generation) => {
      observation.current += 1;
      const access = await deps.request(
        kind,
        kind === 'microphone' ? choice.microphoneDeviceId : choice.webcamDeviceId
      );
      if (generation !== lifecycle.current) return;
      // A failed acquisition carries device errors that permission queries cannot describe.
      await refresh(generation, access === 'granted' ? undefined : { kind, access });
    });
  }

  function next() {
    if (step === 0) {
      setStep(1);
      return Promise.resolve();
    }
    if (step !== 1 || loading || error === 'load') return Promise.resolve();
    return perform(async (generation) => {
      await runWithPersistenceMutationTransition(async () => {
        if (generation !== lifecycle.current) return;
        await deps.saveVideo(choice);
        if (generation !== lifecycle.current) return;
        await deps.saveVoice(choice.microphoneDeviceId);
        if (generation === lifecycle.current) setStep(2);
      });
    });
  }

  return {
    locale,
    theme,
    step,
    choice,
    devices,
    loading,
    busy,
    error,
    retry: () => load(lifecycle.current),
    request,
    next,
    back: () => setStep(step === 2 ? 1 : 0),
    chooseMicrophone: (value: string) =>
      setChoice((current) => ({ ...current, microphoneDeviceId: value || null })),
    chooseCamera: (value: string) =>
      setChoice((current) => ({ ...current, webcamDeviceId: value || null })),
    setLocale: (value: string) => {
      if (value !== 'en' && value !== 'ru') return;
      void perform(() => deps.locale(value));
    },
    setTheme: (value: string) => {
      if (value !== 'system' && value !== 'light' && value !== 'dark') return;
      void perform(async (generation) => {
        await deps.theme(value);
        if (generation === lifecycle.current) setTheme(value);
      });
    },
  };
}

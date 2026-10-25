import { useCallback, useEffect, useRef, useState } from 'react';
import { THEME_PREFERENCE_CHANGE_EVENT } from '@sniptale/ui/branding';
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
  initialPermissions,
  readPermissionsSnapshot,
  requestCameraAccess,
  subscribeToPermissionChanges,
  type PermissionState,
} from '../sections/system/access-data/permissions/permissions-lib';
import { requestSettingsOriginAccess } from '../sections/system/access-data/permissions/useSettingsPermissions';

type PermissionKind = 'microphone' | 'camera' | 'origins';
type Access = MicrophoneAccessState | PermissionState;
export type WelcomeAccess = Record<PermissionKind, Access>;
export interface WelcomeDependencies {
  observe(): Promise<WelcomeAccess>;
  subscribe(listener: () => void): () => void;
  request(kind: PermissionKind): Promise<Access>;
  locale(locale: AppLocale): Promise<void>;
  theme(theme: AppThemePreference): Promise<unknown>;
}

async function observeAccess(): Promise<WelcomeAccess> {
  const snapshot = await readPermissionsSnapshot(
    initialPermissions.filter(
      (item) => item.id === 'microphone' || item.id === 'camera' || item.id === 'origins'
    )
  );
  return {
    microphone: snapshot.find((item) => item.id === 'microphone')?.state ?? 'unknown',
    camera: snapshot.find((item) => item.id === 'camera')?.state ?? 'unknown',
    origins: snapshot.find((item) => item.id === 'origins')?.state ?? 'unknown',
  };
}
function subscribeAccess(listener: () => void): () => void {
  const unsubscribe = subscribeToPermissionChanges(listener);
  let disposed = false;
  const statuses: PermissionStatus[] = [];
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
    unsubscribe();
    window.removeEventListener('focus', listener);
    for (const status of statuses) status.removeEventListener('change', listener);
  };
}
const defaultDependencies: WelcomeDependencies = {
  observe: observeAccess,
  subscribe: subscribeAccess,
  request: async (kind) => {
    if (kind === 'microphone') return requestMicrophoneAccess();
    if (kind === 'camera') return requestCameraAccess();
    const permission = initialPermissions.find((item) => item.id === 'origins');
    if (!permission) return 'error';
    try {
      return (await requestSettingsOriginAccess(permission)) ? 'granted' : 'denied';
    } catch {
      return 'error';
    }
  },
  locale: setLocalePreference,
  theme: setAppThemePreference,
};
const emptyAccess: WelcomeAccess = { microphone: 'unknown', camera: 'unknown', origins: 'unknown' };

/** Owns disposable welcome state and calls existing preference and permission owners. */
export function useWelcomeSetup(dependencies?: WelcomeDependencies) {
  const [deps] = useState(() => dependencies ?? defaultDependencies);
  const locale = useAppLocale();
  const [theme, setTheme] = useState<AppThemePreference>(
    () => getStoredThemePreference() ?? 'system'
  );
  useEffect(() => {
    const syncTheme = () => setTheme(getStoredThemePreference() ?? 'system');
    syncTheme();
    window.addEventListener(THEME_PREFERENCE_CHANGE_EVENT, syncTheme);
    return () => window.removeEventListener(THEME_PREFERENCE_CHANGE_EVENT, syncTheme);
  }, []);
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [access, setAccess] = useState(emptyAccess);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'load' | 'save' | null>(null);
  const lifecycle = useRef(0);
  const observation = useRef(0);
  const operation = useRef(false);
  const refresh = useCallback(
    async (generation: number, failure?: { kind: PermissionKind; access: Access }) => {
      const version = ++observation.current;
      try {
        const next = await deps.observe();
        if (generation === lifecycle.current && version === observation.current)
          setAccess(failure ? { ...next, [failure.kind]: failure.access } : next);
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
      await refresh(generation);
      if (generation === lifecycle.current) setLoading(false);
    },
    [refresh]
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
  function request(kind: PermissionKind) {
    return perform(async (generation) => {
      observation.current += 1;
      const state = await deps.request(kind);
      if (generation !== lifecycle.current) return;
      await refresh(generation, state === 'granted' ? undefined : { kind, access: state });
    });
  }
  function next() {
    if (operation.current || (step === 1 && (loading || error === 'load'))) return;
    if (step === 0) setStep(1);
    if (step === 1) setStep(2);
  }
  return {
    locale,
    theme,
    step,
    access,
    loading,
    busy,
    error,
    retry: () => load(lifecycle.current),
    request,
    next,
    back: () => setStep(step === 2 ? 1 : 0),
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

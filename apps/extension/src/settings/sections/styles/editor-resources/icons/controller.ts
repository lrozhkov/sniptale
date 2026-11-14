import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createEditorVectorLibraryMetadata,
  createEditorVectorCache,
  type EditorVectorSettings,
} from '../../../../../composition/persistence/vector-elements';
import { EditorVectorCatalogError } from '../../../../../features/editor/vector-catalog';
import {
  createEditorVectorCatalogClient,
  requestEditorVectorCatalogPermission,
} from '../../../../../workflows/vector-catalog/client';

type Catalog = Awaited<
  ReturnType<ReturnType<typeof createEditorVectorLibraryMetadata>['readCatalog']>
>;
type Usage = Awaited<ReturnType<ReturnType<typeof createEditorVectorCache>['stats']>>;

/** Settings uses metadata commands only. Remote access starts with an explicit check action. */
export function useIconsSettingsController() {
  const [services] = useState(() => ({
    library: createEditorVectorLibraryMetadata(),
    cache: createEditorVectorCache(),
    client: createEditorVectorCatalogClient(),
  }));
  const [settings, setSettings] = useState<EditorVectorSettings | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  useEffect(() => {
    if (retryAt <= Date.now()) return;
    const timer = setTimeout(() => setRetryAt(0), Math.min(retryAt - Date.now(), 2147483647));
    return () => clearTimeout(timer);
  }, [retryAt]);
  const pending = useRef(false);
  const lifetime = useRef<AbortController | null>(null);

  const refresh = useCallback(
    async (signal: AbortSignal, resetUrl = false) => {
      const [nextSettings, nextCatalog, nextUsage] = await Promise.all([
        services.library.readSettings(),
        services.library.readCatalog(),
        services.cache.stats(),
      ]);
      if (signal.aborted) return;
      setSettings(nextSettings);
      setCatalog(nextCatalog);
      setUsage(nextUsage);
      if (resetUrl) setUrl(nextSettings.baseUrl);
    },
    [services]
  );
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    void refresh(controller.signal, true).catch(() => {
      if (!controller.signal.aborted) setError('load-failed');
    });
    return () => controller.abort();
  }, [refresh]);

  const run = async (operation: (signal: AbortSignal) => Promise<void>) => {
    const signal = lifetime.current?.signal;
    if (!signal || signal.aborted || pending.current) return false;
    pending.current = true;
    setBusy(true);
    setError(null);
    setChecked(false);
    try {
      await operation(signal);
      await refresh(signal);
      return !signal.aborted;
    } catch (failure) {
      if (!signal.aborted) {
        setError(
          !settings
            ? 'load-failed'
            : failure instanceof EditorVectorCatalogError
              ? failure.code
              : 'operation-failed'
        );
        if (failure instanceof EditorVectorCatalogError && failure.retryAfterSeconds !== undefined)
          setRetryAt(Date.now() + failure.retryAfterSeconds * 1000);
        // A refused revision refreshes authority while the user's draft remains editable.
        await refresh(signal).catch(() => undefined);
      }
      return false;
    } finally {
      pending.current = false;
      if (!signal.aborted) setBusy(false);
    }
  };
  const saveSource = () => {
    if (!settings || pending.current) return;
    const current = settings;
    const granted = current.networkEnabled
      ? requestEditorVectorCatalogPermission(url)
      : Promise.resolve(true);
    void run(async (signal) => {
      if (!(await granted)) throw new EditorVectorCatalogError('permission-required');
      if (signal.aborted) return;
      const saved = await services.library.updateSettings({ baseUrl: url }, current);
      if (!signal.aborted) {
        setUrl(saved.baseUrl);
        setRetryAt(0);
      }
    });
  };
  const toggleNetwork = () => {
    if (!settings || pending.current) return;
    const current = settings;
    const enabled = !current.networkEnabled;
    const granted = enabled
      ? requestEditorVectorCatalogPermission(current.baseUrl)
      : Promise.resolve(true);
    void run(async (signal) => {
      if (!(await granted)) throw new EditorVectorCatalogError('permission-required');
      if (signal.aborted) return;
      await services.library.updateSettings(
        { networkEnabled: enabled, ...(enabled ? { disclosureAccepted: true } : {}) },
        current
      );
    });
  };
  const check = () => {
    if (!settings || !settings.networkEnabled || pending.current || retryAt > Date.now()) return;
    const granted = requestEditorVectorCatalogPermission(settings.baseUrl);
    void run(async (signal) => {
      if (!(await granted)) throw new EditorVectorCatalogError('permission-required');
      await services.client.check(signal);
      if (!signal.aborted) {
        setChecked(true);
        setRetryAt(0);
      }
    });
  };
  return {
    settings,
    catalog,
    usage,
    url,
    setUrl,
    busy,
    error,
    checked,
    retryAt,
    saveSource,
    toggleNetwork,
    check,
    reload: () => run((signal) => refresh(signal, settings === null)),
    clearCache: () => run(() => services.cache.clear()),
    createCollection: (name: string) =>
      run(async () => {
        await services.library.createCollection({ id: crypto.randomUUID(), name });
      }),
    renameCollection: (id: string, incarnation: string, name: string) =>
      run(() => services.library.renameCollection(id, incarnation, name)),
    removeCollection: (id: string, incarnation: string) =>
      run(() => services.library.removeCollection(id, incarnation)),
    removePreset: (id: string, incarnation: string) =>
      run(() => services.library.removePreset(id, incarnation)),
  };
}

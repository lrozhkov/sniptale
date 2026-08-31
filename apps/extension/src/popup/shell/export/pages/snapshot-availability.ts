import { useEffect, useState } from 'react';
import { loadSettings, patchSettings } from '../../../../composition/persistence/settings';

export type WebCopyResourcePreferences = {
  anonymousCrossOriginAssetsEnabled: boolean;
  authenticatedSameOriginAssetsEnabled: boolean;
  externalAssetRedirectsEnabled: boolean;
  externalLinksEnabled: boolean;
  error: string | null;
  pending: 'anonymous' | 'authenticated' | 'external-redirects' | 'external-links' | null;
  setAnonymousCrossOriginAssetsEnabled: (enabled: boolean) => Promise<void>;
  setAuthenticatedSameOriginAssetsEnabled: (enabled: boolean) => Promise<void>;
  setExternalAssetRedirectsEnabled: (enabled: boolean) => Promise<void>;
  setExternalLinksEnabled: (enabled: boolean) => Promise<void>;
};

export function useWebCopyResourcePreferences(): WebCopyResourcePreferences {
  const [state, setState] = useState({
    anonymousCrossOriginAssetsEnabled: true,
    authenticatedSameOriginAssetsEnabled: true,
    externalAssetRedirectsEnabled: true,
    externalLinksEnabled: false,
    error: null as string | null,
    pending: null as 'anonymous' | 'authenticated' | 'external-redirects' | 'external-links' | null,
  });

  useEffect(() => {
    let mounted = true;
    void loadSettings()
      .then((settings) => {
        if (mounted) {
          setState((current) => ({
            ...current,
            anonymousCrossOriginAssetsEnabled: settings.anonymousCrossOriginSnapshotAssetsEnabled,
            authenticatedSameOriginAssetsEnabled: settings.authenticatedSnapshotAssetsEnabled,
            externalAssetRedirectsEnabled: settings.externalSnapshotAssetRedirectsEnabled,
            externalLinksEnabled: settings.externalSnapshotLinksEnabled,
          }));
        }
      })
      .catch((error: unknown) => {
        if (mounted) setState((current) => ({ ...current, error: String(error) }));
      });
    return () => {
      mounted = false;
    };
  }, []);

  const update = async (
    pending: 'anonymous' | 'authenticated' | 'external-redirects' | 'external-links',
    patch: Parameters<typeof patchSettings>[0]
  ) => {
    setState((current) => ({ ...current, error: null, pending }));
    try {
      const settings = await patchSettings(patch);
      setState({
        anonymousCrossOriginAssetsEnabled: settings.anonymousCrossOriginSnapshotAssetsEnabled,
        authenticatedSameOriginAssetsEnabled: settings.authenticatedSnapshotAssetsEnabled,
        externalAssetRedirectsEnabled: settings.externalSnapshotAssetRedirectsEnabled,
        externalLinksEnabled: settings.externalSnapshotLinksEnabled,
        error: null,
        pending: null,
      });
    } catch (error) {
      setState((current) => ({ ...current, error: String(error), pending: null }));
    }
  };

  return {
    ...state,
    setAnonymousCrossOriginAssetsEnabled: (enabled) =>
      update('anonymous', { anonymousCrossOriginSnapshotAssetsEnabled: enabled }),
    setAuthenticatedSameOriginAssetsEnabled: (enabled) =>
      update('authenticated', { authenticatedSnapshotAssetsEnabled: enabled }),
    setExternalAssetRedirectsEnabled: (enabled) =>
      update('external-redirects', { externalSnapshotAssetRedirectsEnabled: enabled }),
    setExternalLinksEnabled: (enabled) =>
      update('external-links', { externalSnapshotLinksEnabled: enabled }),
  };
}

import { useCallback, useEffect, useState } from 'react';

import { translate } from '../../../../platform/i18n';
import { loadSettings } from '../../../../composition/persistence/settings';
import type { WebSnapshotDisclosure } from './snapshot-confirmation';

type WebSnapshotDisclosureState = {
  anonymousCrossOriginAssetsEnabled: boolean;
  authenticatedSnapshotAssetsEnabled: boolean;
  skipDisclosure: boolean;
  status: 'error' | 'loaded' | 'loading';
};

export function useWebSnapshotDisclosureState(): [
  WebSnapshotDisclosureState,
  (skip: boolean) => void,
] {
  const [state, setState] = useState<WebSnapshotDisclosureState>({
    anonymousCrossOriginAssetsEnabled: false,
    authenticatedSnapshotAssetsEnabled: false,
    skipDisclosure: false,
    status: 'loading',
  });

  useEffect(() => {
    let mounted = true;

    void loadSettings()
      .then((settings) => {
        if (!mounted) {
          return;
        }

        setState((current) => ({
          anonymousCrossOriginAssetsEnabled: settings.anonymousCrossOriginSnapshotAssetsEnabled,
          authenticatedSnapshotAssetsEnabled: settings.authenticatedSnapshotAssetsEnabled,
          skipDisclosure: current.skipDisclosure || settings.skipWebSnapshotSaveDisclosure,
          status: 'loaded',
        }));
      })
      .catch(() => {
        if (!mounted) {
          return;
        }

        setState((current) => ({
          ...current,
          status: 'error',
        }));
      });

    return () => {
      mounted = false;
    };
  }, []);

  const setSkipDisclosure = useCallback((skip: boolean) => {
    setState((current) => ({ ...current, skipDisclosure: skip }));
  }, []);

  return [state, setSkipDisclosure];
}

function getWebSnapshotAssetDisclosureText(state: WebSnapshotDisclosureState): string {
  if (state.status === 'loading') {
    return translate('popup.export.webSnapshotDisclosureAssetsLoading');
  }

  if (state.status === 'error') {
    return translate('popup.export.webSnapshotDisclosureAssetsUnavailable');
  }

  if (state.authenticatedSnapshotAssetsEnabled && state.anonymousCrossOriginAssetsEnabled) {
    return translate('popup.export.webSnapshotDisclosureAssetsBoth');
  }

  if (state.authenticatedSnapshotAssetsEnabled) {
    return translate('popup.export.webSnapshotDisclosureAssetsAuthenticated');
  }

  if (state.anonymousCrossOriginAssetsEnabled) {
    return translate('popup.export.webSnapshotDisclosureAssetsExternal');
  }

  return translate('popup.export.webSnapshotDisclosureAssetsDefault');
}

export function createWebSnapshotDisclosure(
  state: WebSnapshotDisclosureState
): WebSnapshotDisclosure {
  const requiresConfirmation = state.status !== 'loaded' || !state.skipDisclosure;

  return {
    body: translate('popup.export.webSnapshotDisclosureBody'),
    requiresConfirmation,
    title: translate('popup.export.webSnapshotDisclosureTitle'),
    warning: getWebSnapshotAssetDisclosureText(state),
  };
}

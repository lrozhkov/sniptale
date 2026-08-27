import { useCallback, useEffect, useState } from 'react';

import { translate } from '../../../../platform/i18n/popup';
import { loadSettings } from '../../../../composition/persistence/settings';
import type { WebSnapshotDisclosure } from './snapshot-confirmation';

type WebSnapshotDisclosureState = {
  anonymousCrossOriginAssetsEnabled: boolean;
  authenticatedSnapshotAssetsEnabled: boolean;
  skipDisclosure: boolean;
  status: 'error' | 'loaded' | 'loading';
};

export const WEB_SNAPSHOT_SAVE_DISCLOSURE_VERSION = 1;

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
          skipDisclosure:
            current.skipDisclosure ||
            (settings.skipWebSnapshotSaveDisclosure &&
              settings.webSnapshotSaveDisclosureVersion === WEB_SNAPSHOT_SAVE_DISCLOSURE_VERSION),
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

function getWebSnapshotAssetPolicy(
  state: WebSnapshotDisclosureState
): WebSnapshotDisclosure['assetPolicy'] {
  if (state.status !== 'loaded') return state.status;
  if (state.authenticatedSnapshotAssetsEnabled && state.anonymousCrossOriginAssetsEnabled) {
    return 'both';
  }
  if (state.authenticatedSnapshotAssetsEnabled) return 'authenticated';
  if (state.anonymousCrossOriginAssetsEnabled) return 'external';
  return 'strict';
}

export function createWebSnapshotDisclosure(
  state: WebSnapshotDisclosureState
): WebSnapshotDisclosure {
  const requiresConfirmation = state.status !== 'loaded' || !state.skipDisclosure;

  return {
    assetPolicy: getWebSnapshotAssetPolicy(state),
    body: translate('popup.export.webSnapshotDisclosureBody'),
    requiresConfirmation,
    title: translate('popup.export.webSnapshotDisclosureTitle'),
    warning: getWebSnapshotAssetDisclosureText(state),
  };
}

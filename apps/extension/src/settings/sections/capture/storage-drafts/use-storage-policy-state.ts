import { useCallback, useEffect, useRef, useState } from 'react';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import type { LocalStoragePolicy } from '../../../../contracts/settings';
import {
  loadSettings,
  patchLocalStoragePolicy,
  StaleLocalStoragePolicyError,
  subscribeToSettingsChanges,
} from '../../../../composition/persistence/settings';
import { DEFAULT_LOCAL_STORAGE_POLICY } from '../../../../composition/persistence/library-lifecycle';
import { translate } from '../../../../platform/i18n';

export type TrashPolicyFeedback = 'saving' | 'saved' | 'error' | null;

export function useStoragePolicyState() {
  const [policy, setPolicy] = useState<LocalStoragePolicy>(DEFAULT_LOCAL_STORAGE_POLICY);
  const [busy, setBusy] = useState(true);
  const [policyLoaded, setPolicyLoaded] = useState(false);
  const [policyLoadFailed, setPolicyLoadFailed] = useState(false);
  const [trashPolicyFeedback, setTrashPolicyFeedback] = useState<TrashPolicyFeedback>(null);
  const revision = useRef(0);
  const policyRef = useRef(policy);
  const request = useRef(0);
  const mounted = useRef(false);
  const pendingTrashPatch = useRef<Partial<LocalStoragePolicy> | null>(null);

  const acceptPolicy = useCallback((next: LocalStoragePolicy) => {
    policyRef.current = next;
    setPolicy(next);
    setPolicyLoaded(true);
    setPolicyLoadFailed(false);
  }, []);

  const reloadPolicy = useCallback(async () => {
    const ticket = ++request.current;
    const observed = revision.current;
    setBusy(true);
    setPolicyLoadFailed(false);
    try {
      const settings = await loadSettings();
      if (mounted.current && ticket === request.current && observed === revision.current) {
        acceptPolicy(settings.localStoragePolicy);
      }
    } catch {
      if (mounted.current && ticket === request.current && observed === revision.current) {
        setPolicyLoaded(false);
        setPolicyLoadFailed(true);
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [acceptPolicy]);

  useEffect(() => {
    mounted.current = true;
    const unsubscribe = subscribeToSettingsChanges((settings) => {
      const changed = Object.keys(settings.localStoragePolicy).some(
        (key) =>
          settings.localStoragePolicy[key as keyof LocalStoragePolicy] !==
          policyRef.current[key as keyof LocalStoragePolicy]
      );
      revision.current += 1;
      if (changed) {
        pendingTrashPatch.current = null;
        setTrashPolicyFeedback(null);
      }
      acceptPolicy(settings.localStoragePolicy);
    });
    void reloadPolicy();
    return () => {
      mounted.current = false;
      request.current += 1;
      unsubscribe();
    };
  }, [acceptPolicy, reloadPolicy]);

  const updatePolicy = useCallback(
    async (patch: Partial<LocalStoragePolicy>) => {
      if (!policyLoaded || busy) return;
      const observed = revision.current;
      const expected = policyRef.current;
      const trashEdit =
        patch.trashCleanupEnabled !== undefined || patch.trashRetentionDays !== undefined;
      if (trashEdit) {
        pendingTrashPatch.current = patch;
        setTrashPolicyFeedback('saving');
      } else {
        setTrashPolicyFeedback(null);
      }
      setBusy(true);
      try {
        const next = await patchLocalStoragePolicy(patch, expected);
        if (mounted.current && observed === revision.current) acceptPolicy(next.localStoragePolicy);
        if (mounted.current && trashEdit) {
          const current = policyRef.current;
          if (
            observed === revision.current ||
            Object.keys(next.localStoragePolicy).every(
              (key) =>
                next.localStoragePolicy[key as keyof LocalStoragePolicy] ===
                current[key as keyof LocalStoragePolicy]
            )
          ) {
            pendingTrashPatch.current = null;
            setTrashPolicyFeedback('saved');
          }
        }
      } catch (error) {
        if (error instanceof StaleLocalStoragePolicyError) {
          pendingTrashPatch.current = null;
          setTrashPolicyFeedback(null);
          void reloadPolicy();
        } else if (trashEdit && observed === revision.current) {
          setTrashPolicyFeedback('error');
        }
        showToast(translate('settings.storageDrafts.error'), 'error');
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [acceptPolicy, busy, policyLoaded, reloadPolicy]
  );

  const retryTrashPolicy = useCallback(() => {
    const patch = pendingTrashPatch.current;
    if (patch && !busy) void updatePolicy(patch);
  }, [busy, updatePolicy]);

  return {
    busy,
    policy,
    policyLoaded,
    policyLoadFailed,
    retryLoad: reloadPolicy,
    retryTrashPolicy,
    trashPolicyFeedback,
    updatePolicy,
  };
}

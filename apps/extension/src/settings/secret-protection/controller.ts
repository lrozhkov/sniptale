import { useCallback, useEffect, useRef, useState } from 'react';
import type { AISecretProtectionStatusPayload } from '../../contracts/messaging/ai-settings-runtime';
import { translate } from '../../platform/i18n';
import { createUserFacingErrorMessage } from '../../platform/i18n/user-facing-error';
import type { SecretProtectionClient } from '../runtime/secret-protection';

export type SecretProtectionParticipant = 'ai' | 'webdav';
export type SecretProtectionDialogMode = 'enable' | 'unlock' | 'disable' | 'change' | 'reset';
export type SecretProtectionDialogState = {
  id: number;
  mode: SecretProtectionDialogMode;
  participant?: SecretProtectionParticipant;
  createsProfile: boolean;
  requiresPassphrase: boolean;
  error: string | null;
  isSubmitting: boolean;
};
export type SecretProtectionStatus = AISecretProtectionStatusPayload;
type UnlockWaiter = {
  participant: SecretProtectionParticipant;
  resolve: () => void;
  reject: (error: Error) => void;
};

/** Returns unknown when the safe status cannot establish domain membership. */
export function getParticipantEnrollment(
  status: SecretProtectionStatus | null,
  participant: SecretProtectionParticipant
): boolean | null {
  if (!status) return null;
  if (!status.isEnabled) return false;
  return status.participants?.[participant] ?? null;
}

function actionError(cause?: unknown): string {
  return createUserFacingErrorMessage({
    cause,
    detail: 'storage',
    summaryKey: 'settings.secretProtection.actionError',
  });
}
function cancelled(): Error {
  return new Error(translate('settings.secretProtection.unlockCancelled'));
}

/** Owns one Settings dialog, native status acknowledgement and current unlock waiters. */
export function useSecretProtectionController(client: SecretProtectionClient) {
  const [status, setStatus] = useState<SecretProtectionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [isBusy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<SecretProtectionDialogState | null>(null);
  const currentStatus = useRef(status);
  const currentDialog = useRef(dialog);
  const alive = useRef(true);
  const readGeneration = useRef(0);
  const dialogGeneration = useRef(0);
  const busy = useRef(false);
  const waiters = useRef<UnlockWaiter[]>([]);
  const refreshPending = useRef(false);
  const acknowledgedDialog = useRef<number | null>(null);

  const rejectWaiters = useCallback(() => {
    const pending = waiters.current;
    waiters.current = [];
    pending.forEach((waiter) => waiter.reject(cancelled()));
  }, []);
  const close = useCallback(() => {
    dialogGeneration.current += 1;
    currentDialog.current = null;
    acknowledgedDialog.current = null;
    rejectWaiters();
    if (alive.current) setDialog(null);
  }, [rejectWaiters]);
  const readStatus = useCallback(
    async (isCurrent: () => boolean = () => true) => {
      const generation = ++readGeneration.current;
      let result: SecretProtectionStatus;
      try {
        result = await client.readStatus();
      } catch (cause) {
        if (!alive.current || generation !== readGeneration.current || !isCurrent()) return null;
        currentStatus.current = null;
        setStatus(null);
        setError(actionError(cause));
        throw cause;
      }
      if (!alive.current || generation !== readGeneration.current || !isCurrent()) return null;
      currentStatus.current = result;
      setStatus(result);
      setError(null);
      return result;
    },
    [client]
  );
  const reloadStatus = useCallback(async () => {
    if (!alive.current) return;
    close();
    currentStatus.current = null;
    setStatus(null);
    setLoading(true);
    readGeneration.current += 1;
    if (busy.current) {
      refreshPending.current = true;
      return;
    }
    refreshPending.current = false;
    try {
      const result = await readStatus();
      if (alive.current && result) setLoading(false);
    } catch (cause) {
      if (alive.current) {
        setError(actionError(cause));
        setLoading(false);
      }
    }
  }, [readStatus, close]);
  useEffect(() => {
    alive.current = true;
    void reloadStatus();
    return () => {
      alive.current = false;
      readGeneration.current += 1;
      dialogGeneration.current += 1;
      currentDialog.current = null;
      acknowledgedDialog.current = null;
      refreshPending.current = false;
      rejectWaiters();
    };
  }, [reloadStatus, rejectWaiters]);

  const open = useCallback(
    (mode: SecretProtectionDialogMode, participant?: SecretProtectionParticipant) => {
      const known = currentStatus.current;
      if (
        !alive.current ||
        !known ||
        busy.current ||
        (participant && getParticipantEnrollment(known, participant) === null)
      )
        return;
      rejectWaiters();
      acknowledgedDialog.current = null;
      const next: SecretProtectionDialogState = {
        id: ++dialogGeneration.current,
        mode,
        ...(participant ? { participant } : {}),
        createsProfile: !known.isEnabled,
        requiresPassphrase: !known.isUnlocked,
        error: null,
        isSubmitting: false,
      };
      currentDialog.current = next;
      setDialog(next);
    },
    [rejectWaiters]
  );
  const ensureUnlocked = useCallback(
    (participant: SecretProtectionParticipant): Promise<void> => {
      if (!alive.current) return Promise.reject(cancelled());
      const known = currentStatus.current;
      const enrolled = getParticipantEnrollment(known, participant);
      if (enrolled === null) return Promise.reject(new Error(actionError()));
      if (!enrolled) return Promise.resolve();
      if (!busy.current && known?.isUnlocked) return Promise.resolve();
      if (busy.current && currentDialog.current?.mode !== 'unlock')
        return Promise.reject(new Error(actionError()));
      if (currentDialog.current?.mode !== 'unlock') open('unlock');
      return new Promise<void>((resolve, reject) =>
        waiters.current.push({ participant, resolve, reject })
      );
    },
    [open]
  );
  const setDialogError = (message: string, refreshed?: SecretProtectionStatus | null) => {
    const existing = currentDialog.current;
    if (!existing) return;
    const next = {
      ...existing,
      error: message,
      isSubmitting: false,
      ...(refreshed === undefined
        ? {}
        : {
            requiresPassphrase: !refreshed?.isUnlocked,
            createsProfile: refreshed ? !refreshed.isEnabled : existing.createsProfile,
          }),
    };
    currentDialog.current = next;
    setDialog(next);
  };
  const run = async (
    mode: SecretProtectionDialogMode,
    action: () => Promise<void>,
    unlock = false
  ) => {
    const selected = currentDialog.current;
    if (!alive.current || !selected || selected.mode !== mode || busy.current) return;
    const id = selected.id;
    const isCurrent = () => currentDialog.current?.id === id && dialogGeneration.current === id;
    busy.current = true;
    readGeneration.current += 1;
    setBusy(true);
    const submitting = { ...selected, error: null, isSubmitting: true };
    currentDialog.current = submitting;
    setDialog(submitting);
    try {
      if (acknowledgedDialog.current !== id) {
        await action();
        if (!alive.current || !isCurrent()) return;
        acknowledgedDialog.current = id;
      }
      const refreshed = await readStatus(isCurrent);
      if (!alive.current || !isCurrent() || !refreshed) return;
      if (
        unlock &&
        waiters.current.some(
          (waiter) =>
            getParticipantEnrollment(refreshed, waiter.participant) === null ||
            (getParticipantEnrollment(refreshed, waiter.participant) && !refreshed.isUnlocked)
        )
      ) {
        acknowledgedDialog.current = null;
        setDialogError(actionError(), refreshed);
        return;
      }
      const pending = waiters.current;
      waiters.current = [];
      pending.forEach((waiter) => waiter.resolve());
      currentDialog.current = null;
      acknowledgedDialog.current = null;
      setDialog(null);
    } catch (cause) {
      if (!alive.current || !isCurrent()) return;
      if (acknowledgedDialog.current === id) {
        setDialogError(actionError(cause));
      } else {
        currentStatus.current = null;
        setStatus(null);
        let refreshed: SecretProtectionStatus | null = null;
        try {
          refreshed = await readStatus(isCurrent);
        } catch {
          /* The failed current read already exposes unknown status. */
        }
        if (alive.current && isCurrent()) setDialogError(actionError(cause), refreshed);
      }
    } finally {
      busy.current = false;
      if (alive.current) {
        setBusy(false);
        if (refreshPending.current) void reloadStatus();
      }
    }
  };
  const required = () => setDialogError(translate('settings.secretProtection.passphraseRequired'));
  const match = () => setDialogError(translate('settings.secretProtection.passphraseMismatch'));
  return {
    status,
    error,
    isLoading,
    isBusy,
    dialog,
    reloadStatus,
    ensureUnlocked,
    handleCloseDialog: close,
    handleOpenEnableDialog: (participant: SecretProtectionParticipant) =>
      open('enable', participant),
    handleOpenDisableDialog: (participant: SecretProtectionParticipant) =>
      open('disable', participant),
    handleOpenUnlockDialog: () => open('unlock'),
    handleOpenChangeDialog: () => open('change'),
    handleOpenResetDialog: () => open('reset'),
    async handleEnableSubmit(params: { passphrase: string; confirmPassphrase: string }) {
      const selected = currentDialog.current;
      if (selected?.mode !== 'enable' || !selected.participant) return;
      if (
        acknowledgedDialog.current !== selected.id &&
        (selected.createsProfile || selected.requiresPassphrase) &&
        !params.passphrase
      )
        return required();
      if (
        acknowledgedDialog.current !== selected.id &&
        selected.createsProfile &&
        params.passphrase !== params.confirmPassphrase
      )
        return match();
      const participant = selected.participant;
      await run('enable', () => client.enable(participant, params.passphrase || undefined));
    },
    async handleDisableSubmit(passphrase: string) {
      const selected = currentDialog.current;
      if (selected?.mode !== 'disable' || !selected.participant) return;
      if (acknowledgedDialog.current !== selected.id && selected.requiresPassphrase && !passphrase)
        return required();
      const participant = selected.participant;
      await run('disable', () => client.disable(participant, passphrase || undefined));
    },
    async handleUnlockSubmit(passphrase: string) {
      if (!alive.current || currentDialog.current?.mode !== 'unlock') return;
      if (acknowledgedDialog.current !== currentDialog.current.id && !passphrase) return required();
      await run('unlock', () => client.unlock(passphrase), true);
    },
    async handleChangeSubmit(params: {
      currentPassphrase: string;
      nextPassphrase: string;
      confirmPassphrase: string;
    }) {
      if (!alive.current || currentDialog.current?.mode !== 'change') return;
      if (acknowledgedDialog.current !== currentDialog.current.id) {
        if (!params.currentPassphrase || !params.nextPassphrase) return required();
        if (params.nextPassphrase !== params.confirmPassphrase) return match();
      }
      await run('change', () =>
        client.change({
          currentPassphrase: params.currentPassphrase,
          nextPassphrase: params.nextPassphrase,
        })
      );
    },
    handleResetConfirm: () => run('reset', () => client.reset()),
    async handleLockNow() {
      if (!alive.current || !currentStatus.current?.isEnabled || busy.current) return;
      close();
      busy.current = true;
      readGeneration.current += 1;
      setBusy(true);
      try {
        await client.lock();
        await readStatus();
      } catch (cause) {
        if (alive.current) {
          currentStatus.current = null;
          setStatus(null);
          try {
            await readStatus();
          } catch {
            /* Keep unknown status after failed recovery. */
          }
          if (alive.current) setError(actionError(cause));
        }
      } finally {
        busy.current = false;
        if (alive.current) {
          setBusy(false);
          if (refreshPending.current) void reloadStatus();
        }
      }
    },
  };
}
export type SecretProtectionState = ReturnType<typeof useSecretProtectionController>;

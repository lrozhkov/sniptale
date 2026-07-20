import { useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

import {
  changeAISecretPassphraseProtection,
  disableAISecretPassphraseProtection,
  enableAISecretPassphraseProtection,
  lockAISecretPassphraseProtection,
  resetAISecretPassphraseProtection,
  unlockAISecretPassphraseProtection,
} from '../../runtime/settings-mutations';
import { translate } from '../../../../../platform/i18n';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import type { AiProvidersSectionState, AiSecretProtectionDialogMode } from '../types';

type SecretProtectionState = AiProvidersSectionState['secretProtection'];
type SecretProtectionStatus = SecretProtectionState['status'];
type SecretProtectionDialog = SecretProtectionState['dialog'];
type SetDialog = Dispatch<SetStateAction<SecretProtectionDialog>>;
type SetBusy = Dispatch<SetStateAction<boolean>>;

type PendingUnlock = {
  reject: (error: Error) => void;
  resolve: () => void;
};

type CompleteDialogAction = (params: {
  action: () => Promise<void>;
  onSuccess?: () => void;
  successMessage: string;
}) => Promise<void>;

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function createDialogState(
  mode: AiSecretProtectionDialogMode
): NonNullable<SecretProtectionDialog> {
  return {
    mode,
    error: null,
    isSubmitting: false,
  };
}

function setSubmittingDialog(setDialog: SetDialog): void {
  setDialog((current) => (current ? { ...current, error: null, isSubmitting: true } : current));
}

function setDialogError(setDialog: SetDialog, message: string): void {
  setDialog((current) => (current ? { ...current, error: message, isSubmitting: false } : current));
}

function buildDialogControls(args: {
  pendingUnlockRef: MutableRefObject<PendingUnlock | null>;
  setDialog: SetDialog;
  status: SecretProtectionStatus;
}) {
  return {
    ensureUnlocked(): Promise<void> {
      if (!args.status.isEnabled || args.status.isUnlocked) {
        return Promise.resolve();
      }
      return new Promise<void>((resolve, reject) => {
        args.pendingUnlockRef.current = { reject, resolve };
        args.setDialog(createDialogState('unlock'));
      });
    },
    handleCloseDialog() {
      args.pendingUnlockRef.current?.reject(
        new Error(translate('settings.aiProviders.secretProtectionUnlockCancelled'))
      );
      args.pendingUnlockRef.current = null;
      args.setDialog(null);
    },
    openDialog(mode: AiSecretProtectionDialogMode) {
      args.setDialog(createDialogState(mode));
    },
    setError(message: string) {
      setDialogError(args.setDialog, message);
    },
  };
}

function buildDialogActionRunner(args: {
  reloadData: () => Promise<void>;
  setBusy: SetBusy;
  setDialog: SetDialog;
  setError: (message: string) => void;
}): CompleteDialogAction {
  return async (params) => {
    args.setBusy(true);
    setSubmittingDialog(args.setDialog);
    try {
      await params.action();
      await args.reloadData();
      params.onSuccess?.();
      args.setDialog(null);
      toast.success(params.successMessage);
    } catch (error) {
      const message = getErrorMessage(
        error,
        translate('settings.aiProviders.secretProtectionActionError')
      );
      args.setError(message);
      toast.error(message);
    } finally {
      args.setBusy(false);
    }
  };
}

function buildUnlockEnableHandlers(args: {
  completeDialogAction: CompleteDialogAction;
  pendingUnlockRef: MutableRefObject<PendingUnlock | null>;
  setError: (message: string) => void;
}) {
  return {
    async handleUnlockSubmit(passphrase: string) {
      if (!passphrase) {
        args.setError(translate('settings.aiProviders.secretProtectionPassphraseRequired'));
        return;
      }
      await args.completeDialogAction({
        action: () => unlockAISecretPassphraseProtection(passphrase),
        onSuccess: () => {
          args.pendingUnlockRef.current?.resolve();
          args.pendingUnlockRef.current = null;
        },
        successMessage: translate('settings.aiProviders.secretProtectionUnlocked'),
      });
    },
    async handleEnableSubmit(params: { passphrase: string; confirmPassphrase: string }) {
      if (!params.passphrase || params.passphrase !== params.confirmPassphrase) {
        args.setError(
          translate(
            params.passphrase
              ? 'settings.aiProviders.secretProtectionPassphraseMismatch'
              : 'settings.aiProviders.secretProtectionPassphraseRequired'
          )
        );
        return;
      }
      await args.completeDialogAction({
        action: () => enableAISecretPassphraseProtection(params.passphrase),
        successMessage: translate('settings.aiProviders.secretProtectionEnabled'),
      });
    },
  };
}

function buildLifecycleHandlers(args: {
  completeDialogAction: CompleteDialogAction;
  setError: (message: string) => void;
  status: SecretProtectionStatus;
}) {
  return {
    async handleDisableSubmit(passphrase: string) {
      if (!args.status.isUnlocked && !passphrase) {
        args.setError(translate('settings.aiProviders.secretProtectionPassphraseRequired'));
        return;
      }
      await args.completeDialogAction({
        action: () => disableAISecretPassphraseProtection(passphrase || undefined),
        successMessage: translate('settings.aiProviders.secretProtectionDisabled'),
      });
    },
    async handleChangeSubmit(params: {
      currentPassphrase: string;
      nextPassphrase: string;
      confirmPassphrase: string;
    }) {
      if (!params.currentPassphrase || !params.nextPassphrase) {
        args.setError(translate('settings.aiProviders.secretProtectionPassphraseRequired'));
        return;
      }
      if (params.nextPassphrase !== params.confirmPassphrase) {
        args.setError(translate('settings.aiProviders.secretProtectionPassphraseMismatch'));
        return;
      }
      await args.completeDialogAction({
        action: () => changeAISecretPassphraseProtection(params),
        successMessage: translate('settings.aiProviders.secretProtectionChanged'),
      });
    },
    handleResetConfirm() {
      return args.completeDialogAction({
        action: resetAISecretPassphraseProtection,
        successMessage: translate('settings.aiProviders.secretProtectionReset'),
      });
    },
  };
}

function buildLockNowHandler(args: { reloadData: () => Promise<void>; setBusy: SetBusy }) {
  return async () => {
    args.setBusy(true);
    try {
      await lockAISecretPassphraseProtection();
      await args.reloadData();
      toast.success(translate('settings.aiProviders.secretProtectionLocked'));
    } catch (error) {
      toast.error(
        getErrorMessage(error, translate('settings.aiProviders.secretProtectionActionError'))
      );
    } finally {
      args.setBusy(false);
    }
  };
}

function buildOpenDialogHandlers(openDialog: (mode: AiSecretProtectionDialogMode) => void) {
  return {
    handleOpenChangeDialog: () => openDialog('change'),
    handleOpenDisableDialog: () => openDialog('disable'),
    handleOpenEnableDialog: () => openDialog('enable'),
    handleOpenResetDialog: () => openDialog('reset'),
    handleOpenUnlockDialog: () => openDialog('unlock'),
  };
}

export function useAiProvidersSecretProtectionState(args: {
  reloadData: () => Promise<void>;
  status: SecretProtectionStatus;
}): SecretProtectionState {
  const pendingUnlockRef = useRef<PendingUnlock | null>(null);
  const [dialog, setDialog] = useState<SecretProtectionDialog>(null);
  const [isBusy, setIsBusy] = useState(false);
  const controls = buildDialogControls({ pendingUnlockRef, setDialog, status: args.status });
  const completeDialogAction = buildDialogActionRunner({
    reloadData: args.reloadData,
    setBusy: setIsBusy,
    setDialog,
    setError: controls.setError,
  });
  const openHandlers = buildOpenDialogHandlers(controls.openDialog);
  const unlockEnableHandlers = buildUnlockEnableHandlers({
    completeDialogAction,
    pendingUnlockRef,
    setError: controls.setError,
  });
  const lifecycleHandlers = buildLifecycleHandlers({
    completeDialogAction,
    setError: controls.setError,
    status: args.status,
  });

  return {
    dialog,
    ensureUnlocked: controls.ensureUnlocked,
    handleCloseDialog: controls.handleCloseDialog,
    handleLockNow: buildLockNowHandler({ reloadData: args.reloadData, setBusy: setIsBusy }),
    isBusy,
    status: args.status,
    ...openHandlers,
    ...unlockEnableHandlers,
    ...lifecycleHandlers,
  };
}

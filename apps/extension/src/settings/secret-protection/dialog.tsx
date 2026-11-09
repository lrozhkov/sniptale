import { useEffect, useId, useState, type FormEvent } from 'react';

import { translate } from '../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ProductField, ProductInput } from '@sniptale/ui/product-form-controls';
import {
  ProductModal,
  ProductModalBody,
  ProductModalFooter,
  ProductModalHeader,
} from '@sniptale/ui/product-modal';
import { settingsModalClassName } from '../section-surface';
import type {
  SecretProtectionState,
  SecretProtectionDialogMode,
  SecretProtectionDialogState,
} from './controller';

type DialogFields = {
  confirmPassphrase: string;
  currentPassphrase: string;
  nextPassphrase: string;
  passphrase: string;
};

type DialogFieldSetters = {
  setConfirmPassphrase: (value: string) => void;
  setCurrentPassphrase: (value: string) => void;
  setNextPassphrase: (value: string) => void;
  setPassphrase: (value: string) => void;
};

function getDialogTitle(mode: SecretProtectionDialogMode): string {
  switch (mode) {
    case 'enable':
      return translate('settings.secretProtection.enableTitle');
    case 'unlock':
      return translate('settings.secretProtection.unlockTitle');
    case 'disable':
      return translate('settings.secretProtection.disableTitle');
    case 'change':
      return translate('settings.secretProtection.changeTitle');
    case 'reset':
      return translate('settings.secretProtection.resetTitle');
  }
}

function useSecretProtectionDialogFields(id: number | undefined) {
  const [passphrase, setPassphrase] = useState('');
  const [currentPassphrase, setCurrentPassphrase] = useState('');
  const [nextPassphrase, setNextPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');

  useEffect(() => {
    setPassphrase('');
    setCurrentPassphrase('');
    setNextPassphrase('');
    setConfirmPassphrase('');
  }, [id]);

  return {
    fields: { confirmPassphrase, currentPassphrase, nextPassphrase, passphrase },
    setters: {
      setConfirmPassphrase,
      setCurrentPassphrase,
      setNextPassphrase,
      setPassphrase,
    },
  };
}

function SecretProtectionPassphraseField(props: {
  autoFocus?: boolean;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <ProductField label={props.label}>
      <ProductInput
        autoComplete="off"
        placeholder={props.label}
        aria-label={props.label}
        autoFocus={props.autoFocus}
        onChange={(event) => props.onChange(event.currentTarget.value)}
        type="password"
        value={props.value}
      />
    </ProductField>
  );
}

function SecretProtectionEnableFields(props: {
  fields: DialogFields;
  setters: DialogFieldSetters;
}) {
  return (
    <>
      <SecretProtectionPassphraseField
        autoFocus
        label={translate('settings.secretProtection.passphraseLabel')}
        onChange={props.setters.setPassphrase}
        value={props.fields.passphrase}
      />
      <SecretProtectionPassphraseField
        label={translate('settings.secretProtection.confirmPassphraseLabel')}
        onChange={props.setters.setConfirmPassphrase}
        value={props.fields.confirmPassphrase}
      />
    </>
  );
}

function SecretProtectionChangeFields(props: {
  fields: DialogFields;
  setters: DialogFieldSetters;
}) {
  return (
    <>
      <SecretProtectionPassphraseField
        autoFocus
        label={translate('settings.secretProtection.currentPassphraseLabel')}
        onChange={props.setters.setCurrentPassphrase}
        value={props.fields.currentPassphrase}
      />
      <SecretProtectionPassphraseField
        label={translate('settings.secretProtection.newPassphraseLabel')}
        onChange={props.setters.setNextPassphrase}
        value={props.fields.nextPassphrase}
      />
      <SecretProtectionPassphraseField
        label={translate('settings.secretProtection.confirmPassphraseLabel')}
        onChange={props.setters.setConfirmPassphrase}
        value={props.fields.confirmPassphrase}
      />
    </>
  );
}

function SecretProtectionDialogFields(props: {
  fields: DialogFields;
  dialog: SecretProtectionDialogState;
  isSessionKnownUnlocked: boolean;
  setters: DialogFieldSetters;
}) {
  if (props.dialog.mode === 'reset') {
    return (
      <p className="text-sm leading-6 text-[var(--sniptale-color-text-secondary)]">
        {translate('settings.secretProtection.resetDescription')}
      </p>
    );
  }
  if (props.dialog.mode === 'enable' && props.dialog.createsProfile) {
    return <SecretProtectionEnableFields fields={props.fields} setters={props.setters} />;
  }
  if (props.dialog.mode === 'change') {
    return <SecretProtectionChangeFields fields={props.fields} setters={props.setters} />;
  }
  if (
    (props.dialog.mode === 'enable' || props.dialog.mode === 'disable') &&
    !props.dialog.requiresPassphrase
  )
    return (
      <p className="text-sm">
        {translate(
          props.isSessionKnownUnlocked
            ? 'settings.secretProtection.sessionUnlocked'
            : 'settings.secretProtection.unknownStatus'
        )}
      </p>
    );
  return (
    <>
      {props.dialog.mode === 'enable' ? (
        <p className="text-sm">{translate('settings.secretProtection.joinDescription')}</p>
      ) : null}
      <SecretProtectionPassphraseField
        autoFocus
        label={translate('settings.secretProtection.passphraseLabel')}
        onChange={props.setters.setPassphrase}
        value={props.fields.passphrase}
      />
    </>
  );
}

function submitSecretProtectionDialog(
  state: SecretProtectionState,
  mode: SecretProtectionDialogMode,
  fields: DialogFields
) {
  if (mode === 'enable') {
    return state.handleEnableSubmit(fields);
  }
  if (mode === 'unlock') {
    return state.handleUnlockSubmit(fields.passphrase);
  }
  if (mode === 'disable') {
    return state.handleDisableSubmit(fields.passphrase);
  }
  if (mode === 'change') {
    return state.handleChangeSubmit(fields);
  }
  return state.handleResetConfirm();
}

function SecretProtectionDialogFooter(props: {
  isSubmitting: boolean;
  mode: SecretProtectionDialogMode;
  onClose: () => void;
}) {
  return (
    <ProductModalFooter compact>
      <ProductActionButton
        compact
        autoFocus={props.mode === 'reset'}
        disabled={props.isSubmitting}
        onClick={props.onClose}
        tone="secondary"
      >
        {translate('common.actions.cancel')}
      </ProductActionButton>
      <ProductActionButton
        compact
        disabled={props.isSubmitting}
        tone={props.mode === 'reset' ? 'danger' : 'primary'}
        type="submit"
      >
        {props.mode === 'reset'
          ? translate('settings.secretProtection.resetAction')
          : translate('common.actions.save')}
      </ProductActionButton>
    </ProductModalFooter>
  );
}

export function SecretProtectionDialog(props: { state: SecretProtectionState }) {
  const titleId = useId();
  const { dialog } = props.state;
  const { fields, setters } = useSecretProtectionDialogFields(dialog?.id);

  if (!dialog) {
    return null;
  }

  const participantName = dialog.participant
    ? translate(
        dialog.participant === 'ai'
          ? 'settings.secretProtection.aiParticipant'
          : 'settings.secretProtection.webdavParticipant'
      )
    : null;
  const dialogTitle = getDialogTitle(dialog.mode);
  const displayTitle =
    participantName === null ? dialogTitle : `${dialogTitle}: ${participantName}`;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void submitSecretProtectionDialog(props.state, dialog.mode, fields);
  };

  return (
    <ProductModal
      key={dialog.id}
      labelledBy={titleId}
      closeOnBackdrop={!dialog.isSubmitting}
      maxWidth="420px"
      dialogClassName={settingsModalClassName}
      onClose={props.state.handleCloseDialog}
      width="calc(100vw - 32px)"
    >
      <ProductModalHeader
        compact
        disabled={dialog.isSubmitting}
        onClose={props.state.handleCloseDialog}
        title={<span id={titleId}>{displayTitle}</span>}
      />
      <ProductModalBody compact asForm className="space-y-4" onSubmit={submit}>
        <SecretProtectionDialogFields
          fields={fields}
          dialog={dialog}
          isSessionKnownUnlocked={props.state.status?.isUnlocked === true}
          setters={setters}
        />
        {dialog.error ? <div className="sniptale-error-text">{dialog.error}</div> : null}
        <SecretProtectionDialogFooter
          isSubmitting={dialog.isSubmitting}
          mode={dialog.mode}
          onClose={props.state.handleCloseDialog}
        />
      </ProductModalBody>
    </ProductModal>
  );
}

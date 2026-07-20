import { useEffect, useState, type FormEvent } from 'react';

import { translate } from '../../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ProductField, ProductInput } from '@sniptale/ui/product-form-controls';
import {
  ProductModal,
  ProductModalBody,
  ProductModalFooter,
  ProductModalHeader,
} from '@sniptale/ui/product-modal';
import type { AiProvidersSectionState, AiSecretProtectionDialogMode } from '../controller/types';

type SecretProtectionState = AiProvidersSectionState['secretProtection'];

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

function getDialogTitle(mode: AiSecretProtectionDialogMode): string {
  switch (mode) {
    case 'enable':
      return translate('settings.aiProviders.secretProtectionEnableTitle');
    case 'unlock':
      return translate('settings.aiProviders.secretProtectionUnlockTitle');
    case 'disable':
      return translate('settings.aiProviders.secretProtectionDisableTitle');
    case 'change':
      return translate('settings.aiProviders.secretProtectionChangeTitle');
    case 'reset':
      return translate('settings.aiProviders.secretProtectionResetTitle');
  }
}

function useSecretProtectionDialogFields(mode: AiSecretProtectionDialogMode | undefined) {
  const [passphrase, setPassphrase] = useState('');
  const [currentPassphrase, setCurrentPassphrase] = useState('');
  const [nextPassphrase, setNextPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');

  useEffect(() => {
    setPassphrase('');
    setCurrentPassphrase('');
    setNextPassphrase('');
    setConfirmPassphrase('');
  }, [mode]);

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
        label={translate('settings.aiProviders.secretProtectionPassphraseLabel')}
        onChange={props.setters.setPassphrase}
        value={props.fields.passphrase}
      />
      <SecretProtectionPassphraseField
        label={translate('settings.aiProviders.secretProtectionConfirmPassphraseLabel')}
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
        label={translate('settings.aiProviders.secretProtectionCurrentPassphraseLabel')}
        onChange={props.setters.setCurrentPassphrase}
        value={props.fields.currentPassphrase}
      />
      <SecretProtectionPassphraseField
        label={translate('settings.aiProviders.secretProtectionNewPassphraseLabel')}
        onChange={props.setters.setNextPassphrase}
        value={props.fields.nextPassphrase}
      />
      <SecretProtectionPassphraseField
        label={translate('settings.aiProviders.secretProtectionConfirmPassphraseLabel')}
        onChange={props.setters.setConfirmPassphrase}
        value={props.fields.confirmPassphrase}
      />
    </>
  );
}

function SecretProtectionDialogFields(props: {
  fields: DialogFields;
  mode: AiSecretProtectionDialogMode;
  setters: DialogFieldSetters;
}) {
  if (props.mode === 'reset') {
    return (
      <p className="text-sm leading-6 text-[var(--sniptale-color-text-secondary)]">
        {translate('settings.aiProviders.secretProtectionResetDescription')}
      </p>
    );
  }
  if (props.mode === 'enable') {
    return <SecretProtectionEnableFields fields={props.fields} setters={props.setters} />;
  }
  if (props.mode === 'change') {
    return <SecretProtectionChangeFields fields={props.fields} setters={props.setters} />;
  }
  return (
    <SecretProtectionPassphraseField
      autoFocus
      label={translate('settings.aiProviders.secretProtectionPassphraseLabel')}
      onChange={props.setters.setPassphrase}
      value={props.fields.passphrase}
    />
  );
}

function submitSecretProtectionDialog(
  state: SecretProtectionState,
  mode: AiSecretProtectionDialogMode,
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
  mode: AiSecretProtectionDialogMode;
  onClose: () => void;
}) {
  return (
    <ProductModalFooter compact>
      <ProductActionButton
        compact
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
          ? translate('settings.aiProviders.secretProtectionResetAction')
          : translate('common.actions.save')}
      </ProductActionButton>
    </ProductModalFooter>
  );
}

export function SecretProtectionDialog(props: { state: SecretProtectionState }) {
  const { dialog } = props.state;
  const { fields, setters } = useSecretProtectionDialogFields(dialog?.mode);

  if (!dialog) {
    return null;
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void submitSecretProtectionDialog(props.state, dialog.mode, fields);
  };

  return (
    <ProductModal
      accent="compact"
      closeOnBackdrop={!dialog.isSubmitting}
      maxWidth="420px"
      onClose={props.state.handleCloseDialog}
      width="calc(100vw - 32px)"
    >
      <ProductModalHeader
        compact
        disabled={dialog.isSubmitting}
        onClose={props.state.handleCloseDialog}
        title={getDialogTitle(dialog.mode)}
      />
      <ProductModalBody compact asForm className="space-y-4" onSubmit={submit}>
        <SecretProtectionDialogFields fields={fields} mode={dialog.mode} setters={setters} />
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

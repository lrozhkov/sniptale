import type { LucideIcon } from 'lucide-react';
import { KeyRound, Lock, RotateCcw, Unlock } from 'lucide-react';

import { translate } from '../../../../platform/i18n';
import type { AiProvidersSectionState } from '../controller/types';
import { aiProvidersAddButtonClassName } from './constants';

type SecretProtectionState = AiProvidersSectionState['secretProtection'];

function SecretProtectionActionButton(props: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  state: SecretProtectionState;
}) {
  const Icon = props.icon;

  return (
    <button
      type="button"
      className={aiProvidersAddButtonClassName}
      disabled={props.state.isBusy}
      onClick={props.onClick}
    >
      <Icon size={14} />
      {props.label}
    </button>
  );
}

function SecretProtectionLockAction(props: { state: SecretProtectionState }) {
  return props.state.status.isUnlocked ? (
    <SecretProtectionActionButton
      icon={Lock}
      label={translate('settings.aiProviders.secretProtectionLockAction')}
      onClick={() => void props.state.handleLockNow()}
      state={props.state}
    />
  ) : (
    <SecretProtectionActionButton
      icon={Unlock}
      label={translate('settings.aiProviders.secretProtectionUnlockAction')}
      onClick={props.state.handleOpenUnlockDialog}
      state={props.state}
    />
  );
}

export function SecretProtectionActions(props: { state: SecretProtectionState }) {
  if (!props.state.status.isEnabled) {
    return null;
  }

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <SecretProtectionLockAction state={props.state} />
      <SecretProtectionActionButton
        icon={KeyRound}
        label={translate('settings.aiProviders.secretProtectionChangeAction')}
        onClick={props.state.handleOpenChangeDialog}
        state={props.state}
      />
      <SecretProtectionActionButton
        icon={Unlock}
        label={translate('settings.aiProviders.secretProtectionDisableAction')}
        onClick={props.state.handleOpenDisableDialog}
        state={props.state}
      />
      <SecretProtectionActionButton
        icon={RotateCcw}
        label={translate('settings.aiProviders.secretProtectionResetAction')}
        onClick={props.state.handleOpenResetDialog}
        state={props.state}
      />
    </div>
  );
}

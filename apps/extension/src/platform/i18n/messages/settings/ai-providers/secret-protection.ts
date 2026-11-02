import { defineMessageSource } from '../../source';
import { settingsSecretProtectionMessages } from '../secret-protection';

export const settingsAiProvidersSecretProtectionMessages = defineMessageSource({
  secretProtectionActionError: settingsSecretProtectionMessages.actionError,
  secretProtectionPassphraseRequired: settingsSecretProtectionMessages.passphraseRequired,
  secretProtectionPassphraseLabel: settingsSecretProtectionMessages.passphraseLabel,
  secretProtectionUnlockAction: settingsSecretProtectionMessages.unlockAction,
  secretProtectionUnlockTitle: settingsSecretProtectionMessages.unlockTitle,
});

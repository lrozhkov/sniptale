import { defineMessageSource } from '../../source';
import { settingsAiProvidersDisclosureMessages } from './disclosure';
import { settingsAiProvidersModelMessages } from './model';
import { settingsAiProvidersOverviewMessages } from './overview';
import { settingsAiProvidersProviderMessages } from './provider';
import { settingsAiProvidersSecretProtectionMessages } from './secret-protection';

export const settingsAiProvidersMessages = defineMessageSource({
  ...settingsAiProvidersDisclosureMessages,
  ...settingsAiProvidersOverviewMessages,
  ...settingsAiProvidersProviderMessages,
  ...settingsAiProvidersSecretProtectionMessages,
  ...settingsAiProvidersModelMessages,
});

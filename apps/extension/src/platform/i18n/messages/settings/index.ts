import { settingsSyncQueueMessages } from './sync-queue';
import { eventsLogsMessages } from './events-logs';
import { filenameRulesMessages } from './filename-rules';
import { defineMessageSource } from '../source';
import { settingsAiProvidersMessages } from './ai-providers/index';
import { settingsAppearanceMessages } from './appearance';
import { settingsEditorMessages } from './editor';
import { settingsHotkeyInputMessages } from './hotkey-input';
import { settingsNavigationMessages } from './navigation';
import { settingsNativeAppMessages } from './native-app';
import { settingsPermissionsMessages } from './permissions';
import { settingsPrivacyMessages } from './privacy';
import { settingsQuickActionsMessages } from './quick-actions';
import { settingsVideoQualityMessages } from './video-quality';
import { settingsWelcomeMessages } from './welcome';
import { settingsVoiceInputMessages } from './voice-input';
import { settingsCollectionMessages } from './collection';
import { settingsStorageDraftsMessages } from './storage-drafts';
import { settingsTransferMessages } from './transfer';

export const settingsMessages = defineMessageSource({
  syncQueue: settingsSyncQueueMessages,
  eventsLogs: eventsLogsMessages,
  filenameRules: filenameRulesMessages,
  collection: settingsCollectionMessages,
  appearance: settingsAppearanceMessages,
  navigation: settingsNavigationMessages,
  nativeApp: settingsNativeAppMessages,
  editor: settingsEditorMessages,
  aiProviders: settingsAiProvidersMessages,
  permissions: settingsPermissionsMessages,
  privacy: settingsPrivacyMessages,
  quickActions: settingsQuickActionsMessages,
  hotkeyInput: settingsHotkeyInputMessages,
  videoQuality: settingsVideoQualityMessages,
  voiceInput: settingsVoiceInputMessages,
  welcome: settingsWelcomeMessages,
  storageDrafts: settingsStorageDraftsMessages,
  settingsTransfer: settingsTransferMessages,
});

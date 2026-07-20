import { defineMessageSource } from '../source';
import { settingsAiProvidersMessages } from './ai-providers/index';
import { settingsAppearanceMessages } from './appearance';
import { settingsEditorMessages } from './editor';
import { settingsHotkeyInputMessages } from './hotkey-input';
import { settingsNavigationMessages } from './navigation';
import { settingsNativeAppMessages } from './native-app';
import { settingsPageStylesMessages } from './page-styles';
import { settingsPermissionsMessages } from './permissions';
import { settingsPrivacyMessages } from './privacy';
import { settingsQuickActionsMessages } from './quick-actions';

export const settingsMessages = defineMessageSource({
  appearance: settingsAppearanceMessages,
  navigation: settingsNavigationMessages,
  nativeApp: settingsNativeAppMessages,
  editor: settingsEditorMessages,
  aiProviders: settingsAiProvidersMessages,
  pageStyles: settingsPageStylesMessages,
  permissions: settingsPermissionsMessages,
  privacy: settingsPrivacyMessages,
  quickActions: settingsQuickActionsMessages,
  hotkeyInput: settingsHotkeyInputMessages,
});

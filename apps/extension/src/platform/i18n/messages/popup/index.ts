import { defineMessageSource } from '../source';
import { popupCommonMessages } from './common';
import { popupExportMessages } from './export';
import { popupHomeMessages } from './home';
import { popupLabelsMessages } from './labels';
import { popupSettingsFormMessages } from './settings-form';
import { popupTabsMessages } from './tabs';
import { popupVideoMessages } from './video';

export const popupMessages = defineMessageSource({
  common: popupCommonMessages,
  tabs: popupTabsMessages,
  home: popupHomeMessages,
  video: popupVideoMessages,
  export: popupExportMessages,
  settingsForm: popupSettingsFormMessages,
  labels: popupLabelsMessages,
});

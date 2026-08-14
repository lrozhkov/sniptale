import {
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  SUPPORTED_LOCALES,
  type AppLocale,
} from '@sniptale/platform/i18n/config';
import { commonMessages } from './messages/common';
import { backgroundMessages } from './messages/background';
import { contentRuntimeMessages } from './messages/content/runtime';
import { contentToolbarMessages } from './messages/content/toolbar';
import { exportModalMessages } from './messages/export-modal';
import { popupMessages } from './messages/popup';
import { settingsQuickActionsMessages } from './messages/settings/quick-actions';
import { sharedUiMessages } from './messages/shared/ui';
import { viewportPresetsMessages } from './messages/viewport-presets';
import { defineMessageSource } from './messages/source';
import { useAppLocale } from './locale/hook';
import { getCurrentLocale } from './locale/state';
import type { Translate, TranslationKey } from './types';

const popupTranslationMessages = defineMessageSource({
  background: backgroundMessages,
  common: commonMessages,
  content: defineMessageSource({
    runtime: contentRuntimeMessages,
    toolbar: contentToolbarMessages,
  }),
  exportModal: exportModalMessages,
  popup: popupMessages,
  settings: defineMessageSource({ quickActions: settingsQuickActionsMessages }),
  shared: defineMessageSource({ ui: sharedUiMessages }),
  viewportPresets: viewportPresetsMessages,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readPopupTranslation(locale: AppLocale, key: TranslationKey): string {
  let current: unknown = popupTranslationMessages;

  for (const part of key.split('.')) {
    if (!isRecord(current) || !(part in current)) return key;
    current = current[part];
  }

  if (!isRecord(current)) return key;
  const localizedValue = current[locale] ?? current[FALLBACK_LOCALE];
  return typeof localizedValue === 'string' ? localizedValue : key;
}

export function createTranslator(locale: AppLocale = DEFAULT_LOCALE): Translate {
  return (key) => readPopupTranslation(locale, key);
}

export function translate(key: TranslationKey, locale?: AppLocale): string {
  return createTranslator(locale ?? getCurrentLocale())(key);
}

export { getCurrentLocale, useAppLocale, SUPPORTED_LOCALES };
export type { AppLocale, TranslationKey };

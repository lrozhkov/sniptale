import type { DEFAULT_LOCALE } from '@sniptale/platform/i18n/config';
import { type AppLocale } from '@sniptale/platform/i18n/config';
import type { translationMessages } from './messages';
import type { LeafTranslationKey, ResolvedMessageSource } from './messages/source';

/**
 * Resolved dictionary shape for a single locale.
 */
export type TranslationDictionary = ResolvedMessageSource<
  typeof translationMessages,
  typeof DEFAULT_LOCALE
>;

/**
 * Dot-path translation keys derived from the canonical message source tree.
 */
export type TranslationKey = LeafTranslationKey<TranslationDictionary>;

/**
 * Translator function contract used by runtime surfaces.
 */
export type Translate = (key: TranslationKey) => string;

export type { AppLocale };

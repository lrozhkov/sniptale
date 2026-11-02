import type en from './catalogs/en.json';
import type { AppLocale } from '@sniptale/platform/i18n/config';

type StringLeaves<TNode> = TNode extends string
  ? string
  : { readonly [K in keyof TNode]: StringLeaves<TNode[K]> };

type JoinPath<TPrefix extends string, TKey extends string> = TPrefix extends ''
  ? TKey
  : `${TPrefix}.${TKey}`;

export type LeafTranslationKey<TNode, TPrefix extends string = ''> = {
  [TKey in Extract<keyof TNode, string>]: TNode[TKey] extends string
    ? JoinPath<TPrefix, TKey>
    : LeafTranslationKey<TNode[TKey], JoinPath<TPrefix, TKey>>;
}[Extract<keyof TNode, string>];

/** Shape of a locale catalog, derived without importing its runtime data. */
export type TranslationDictionary = StringLeaves<typeof en>;

/** Dot paths accepted by product translation APIs. */
export type TranslationKey = LeafTranslationKey<TranslationDictionary>;

/** Synchronous translation lookup used by product surfaces. */
export type Translate = (key: TranslationKey) => string;

export type { AppLocale };

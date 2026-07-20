import { SUPPORTED_LOCALES, type AppLocale } from '@sniptale/platform/i18n/config';

type LocalizedMessage = Readonly<Record<AppLocale, string>>;

type MessageSource = {
  readonly [key: string]: LocalizedMessage | MessageSource;
};

export type ResolvedMessageSource<TNode, TLocale extends AppLocale> = TNode extends LocalizedMessage
  ? TNode[TLocale]
  : TNode extends Record<string, unknown>
    ? { readonly [K in keyof TNode]: ResolvedMessageSource<TNode[K], TLocale> }
    : never;

type JoinPath<TPrefix extends string, TKey extends string> = TPrefix extends ''
  ? TKey
  : `${TPrefix}.${TKey}`;

export type LeafTranslationKey<TNode, TPrefix extends string = ''> = {
  [TKey in Extract<keyof TNode, string>]: TNode[TKey] extends string
    ? JoinPath<TPrefix, TKey>
    : TNode[TKey] extends Record<string, unknown>
      ? LeafTranslationKey<TNode[TKey], JoinPath<TPrefix, TKey>>
      : never;
}[Extract<keyof TNode, string>];

/**
 * Marks a nested locale tree as canonical message authoring data.
 */
export function defineMessageSource<const TSource extends MessageSource>(source: TSource): TSource {
  return source;
}

/**
 * Resolves a locale-authored message tree into a plain per-locale dictionary.
 */
export function resolveMessageSource<TSource extends MessageSource, TLocale extends AppLocale>(
  source: TSource,
  locale: TLocale
): ResolvedMessageSource<TSource, TLocale> {
  const resolved = Object.fromEntries(
    Object.entries(source).map(([key, value]) => [
      key,
      isLocalizedMessage(value) ? value[locale] : resolveMessageSource(value, locale),
    ])
  );

  return resolved as ResolvedMessageSource<TSource, TLocale>;
}

function isLocalizedMessage(node: LocalizedMessage | MessageSource): node is LocalizedMessage {
  return SUPPORTED_LOCALES.every((locale) => typeof node[locale] === 'string');
}

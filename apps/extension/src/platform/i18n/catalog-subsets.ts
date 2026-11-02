import type { TranslationDictionary } from './types';

/** Exact message domains bundled into each compact runtime entry. */
const CATALOG_SUBSETS = {
  popup: [
    'background',
    'common',
    'content.runtime',
    'content.toolbar',
    'exportModal',
    'imageSettings',
    'popup',
    'settings.quickActions',
    'shared.ui',
    'viewportPresets',
  ],
  'popup-shell': ['common', 'popup.tabs'],
  'content-shim': ['shared.defaults', 'content.pageLauncher'],
} as const;

type SelectPaths<T, TPaths extends string> = {
  [
    K in keyof T as K extends string
      ? K extends TPaths
        ? K
        : Extract<TPaths, `${K}.${string}`> extends never
          ? never
          : K
      : never
  ]: K extends TPaths
    ? T[K]
    : SelectPaths<T[K], TPaths extends `${Extract<K, string>}.${infer Tail}` ? Tail : never>;
};

export type CatalogSubset<TName extends keyof typeof CATALOG_SUBSETS> = SelectPaths<
  TranslationDictionary,
  (typeof CATALOG_SUBSETS)[TName][number]
>;

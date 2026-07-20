import type { TranslationKey } from '../../../../platform/i18n';

export const VideoTemplateCatalogStatus = {
  CORE: 'CORE',
  OPTIONAL: 'OPTIONAL',
  LEGACY: 'LEGACY',
} as const;

export type VideoTemplateCatalogStatus =
  (typeof VideoTemplateCatalogStatus)[keyof typeof VideoTemplateCatalogStatus];

export function getVideoTemplateCatalogStatusLabelKey(
  status: VideoTemplateCatalogStatus
): TranslationKey {
  switch (status) {
    case VideoTemplateCatalogStatus.CORE:
      return 'videoEditor.templates.catalogStatusCore';
    case VideoTemplateCatalogStatus.OPTIONAL:
      return 'videoEditor.templates.catalogStatusOptional';
    case VideoTemplateCatalogStatus.LEGACY:
      return 'videoEditor.templates.catalogStatusLegacy';
  }
}

import type { AppLocale } from '../../../platform/i18n';
import { designSystemPreview, type DesignSystemVariantPreview } from '../support/provider';
import { getAnnotatableImageSurfacePreviewCopy } from './preview-copy';
import {
  AnnotatableImageSurface,
  AnnotatableImageToolbar,
} from '@sniptale/ui/annotatable-image-surface';

export function buildAnnotatableImageSurfaceSharedPreviews(
  locale: AppLocale
): DesignSystemVariantPreview[] {
  const copy = getAnnotatableImageSurfacePreviewCopy(locale);

  return [
    designSystemPreview(
      'shared.ui.annotatable-image-surface',
      'surface',
      <div className="max-w-[320px]">
        <AnnotatableImageSurface>
          <div
            className={[
              'flex h-40 items-center justify-center text-sm',
              'text-[var(--sniptale-color-text-secondary)]',
            ].join(' ')}
          >
            {copy.stageLabel}
          </div>
        </AnnotatableImageSurface>
      </div>
    ),
    designSystemPreview(
      'shared.ui.annotatable-image-surface',
      'toolbar',
      <div className="max-w-[420px]">
        <AnnotatableImageToolbar>
          <button type="button" className="rounded-full border px-4 py-2 text-sm">
            {copy.actionLabel}
          </button>
          <span className="text-xs text-[var(--sniptale-color-text-secondary)]">
            {copy.toolbarLabel}
          </span>
        </AnnotatableImageToolbar>
      </div>
    ),
  ];
}

import type { AppLocale } from '../../../platform/i18n';
import { getSharedPreviewCopy } from '../support/common';
import { designSystemPreview, type DesignSystemVariantPreview } from '../support/provider';
import { ContentPopoverSection } from '@sniptale/ui/content-popover-adapter';

export function buildContentPopoverSharedPreviews(locale: AppLocale): DesignSystemVariantPreview[] {
  const copy = getSharedPreviewCopy(locale);

  return [
    designSystemPreview(
      'shared.ui.content-popover',
      'popover',
      <div className="sniptale-content-popover !w-[290px]">
        <div className="sniptale-content-popover-body">
          <ContentPopoverSection title={copy.contentPortal}>
            <div className="text-xs text-[var(--sniptale-color-text-secondary)]">
              {copy.shadowRootNote}
            </div>
          </ContentPopoverSection>
        </div>
      </div>
    ),
    designSystemPreview(
      'shared.ui.content-popover',
      'section',
      <div className="max-w-[320px]">
        <ContentPopoverSection title={copy.sectionAdapter}>
          <div className="text-xs text-[var(--sniptale-color-text-secondary)]">
            {copy.sameVisualContract}
          </div>
        </ContentPopoverSection>
      </div>
    ),
  ];
}

import type { AppLocale } from '../../../platform/i18n';
import { getSharedPreviewCopy } from '../support/common';
import { ExpiredOverlay } from './index';
import {
  DesignSystemFloatingPreviewFrame,
  designSystemPreview,
  type DesignSystemVariantPreview,
} from '../support/provider';

export function buildExpiredOverlaySharedPreviews(locale: AppLocale): DesignSystemVariantPreview[] {
  const copy = getSharedPreviewCopy(locale);

  return [
    designSystemPreview(
      'shared.ui.expired-overlay',
      'fullscreen',
      <DesignSystemFloatingPreviewFrame minHeight={260}>
        <ExpiredOverlay
          title={copy.expiredTitle}
          message={copy.expiredMessage}
          dataUi="shared.ui.expired-overlay.preview"
        />
      </DesignSystemFloatingPreviewFrame>
    ),
  ];
}

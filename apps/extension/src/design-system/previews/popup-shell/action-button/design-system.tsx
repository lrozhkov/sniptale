import { Blocks, Monitor } from 'lucide-react';
import type { AppLocale } from '../../../../platform/i18n';
import { getSharedPreviewCopy } from '../../support/common';
import { designSystemPreview, type DesignSystemVariantPreview } from '../../support/provider';
import { PopupActionButton } from '../../../../ui/popup-shell/action-button/index';

function renderPopupActionButtonPreview(
  icon: typeof Monitor | typeof Blocks,
  label: string,
  subtitle: string | undefined,
  iconClassName: string,
  tone: 'primary' | 'secondary' | 'gallery'
) {
  return (
    <PopupActionButton
      icon={icon}
      label={label}
      subtitle={subtitle}
      iconClassName={iconClassName}
      tone={tone}
      onClick={() => undefined}
    />
  );
}

function buildPrimaryPreview(
  copy: ReturnType<typeof getSharedPreviewCopy>
): DesignSystemVariantPreview {
  return designSystemPreview(
    'shared.ui.popup-action-button',
    'primary',
    renderPopupActionButtonPreview(
      Monitor,
      copy.startRecording,
      copy.primaryCta,
      'text-[var(--sniptale-color-accent-emphasis)]',
      'primary'
    )
  );
}

function buildSecondaryPreview(
  copy: ReturnType<typeof getSharedPreviewCopy>
): DesignSystemVariantPreview {
  return designSystemPreview(
    'shared.ui.popup-action-button',
    'secondary',
    renderPopupActionButtonPreview(
      Blocks,
      copy.openGallery,
      copy.secondaryAction,
      'text-[var(--sniptale-color-info)]',
      'secondary'
    )
  );
}

function buildGalleryPreview(
  copy: ReturnType<typeof getSharedPreviewCopy>
): DesignSystemVariantPreview {
  return designSystemPreview(
    'shared.ui.popup-action-button',
    'gallery',
    renderPopupActionButtonPreview(
      Blocks,
      copy.mediaHub,
      copy.contentNavigation,
      'text-[var(--sniptale-color-accent)]',
      'gallery'
    )
  );
}

function buildCompactPreview(
  copy: ReturnType<typeof getSharedPreviewCopy>
): DesignSystemVariantPreview {
  return designSystemPreview(
    'shared.ui.popup-action-button',
    'compact',
    <div className="max-w-[88px]">
      <PopupActionButton
        icon={Blocks}
        label={copy.catalog}
        iconClassName="text-[var(--sniptale-color-info)]"
        compact
        onClick={() => undefined}
      />
    </div>
  );
}

export function buildPopupActionButtonSharedPreviews(
  locale: AppLocale
): DesignSystemVariantPreview[] {
  const copy = getSharedPreviewCopy(locale);

  return [
    buildPrimaryPreview(copy),
    buildSecondaryPreview(copy),
    buildGalleryPreview(copy),
    buildCompactPreview(copy),
  ];
}

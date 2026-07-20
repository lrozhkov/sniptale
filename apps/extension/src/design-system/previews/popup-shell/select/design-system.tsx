import type { AppLocale } from '../../../../platform/i18n';
import { getSharedPreviewCopy } from '../../support/common';
import { designSystemPreview, type DesignSystemVariantPreview } from '../../support/provider';
import { PopupSelect } from '../../../../ui/popup-shell/select/index';

export function buildPopupSelectSharedPreviews(locale: AppLocale): DesignSystemVariantPreview[] {
  const copy = getSharedPreviewCopy(locale);

  return [
    designSystemPreview(
      'shared.ui.popup-select',
      'default',
      <div className="w-[220px]">
        <PopupSelect
          aria-label={copy.popupSelectAria}
          value="screen"
          onChange={() => undefined}
          options={copy.selectOptions}
        />
      </div>
    ),
  ];
}

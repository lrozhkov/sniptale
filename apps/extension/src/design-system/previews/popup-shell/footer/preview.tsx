import { Blocks, Settings2 } from 'lucide-react';
import type { AppLocale } from '../../../../platform/i18n';
import { getSharedPreviewCopy } from '../../support/common';
import { designSystemPreview, type DesignSystemVariantPreview } from '../../support/provider';
import { PopupFooter } from '../../../../ui/popup-shell/footer/index';
import { PopupFooterAction } from '../../../../ui/popup-shell/footer/action';
import { GitHubIcon } from '../../../../ui/popup-shell/footer/github-icon';

export function buildPopupFooterSharedPreviews(locale: AppLocale): DesignSystemVariantPreview[] {
  const copy = getSharedPreviewCopy(locale);

  return [
    designSystemPreview(
      'shared.ui.popup-footer-action',
      'default',
      <div className="flex gap-3">
        <PopupFooterAction onClick={() => undefined} icon={GitHubIcon} label={copy.github} />
        <PopupFooterAction onClick={() => undefined} icon={Settings2} label={copy.settings} />
      </div>
    ),
    designSystemPreview(
      'shared.ui.popup-footer-action',
      'compact',
      <PopupFooterAction
        onClick={() => undefined}
        icon={Blocks}
        label={copy.designSystem}
        compact
      />
    ),
    designSystemPreview(
      'shared.ui.popup-footer',
      'default',
      <PopupFooter onOpenGithub={() => undefined} onOpenSettings={() => undefined} />
    ),
  ];
}

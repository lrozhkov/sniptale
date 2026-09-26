import { useState } from 'react';
import { X } from 'lucide-react';
import { runtimeInfo } from '@sniptale/platform/browser/runtime';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { commonMessages } from '../../../platform/i18n/messages/common';
import { popupCommonMessages } from '../../../platform/i18n/messages/popup/common';
import type { AppLocale } from '../../../platform/i18n/types';
import { useActiveTabCapabilities } from '../tab-access/capabilities';

export function useExtensionPageWarning() {
  const capabilities = useActiveTabCapabilities();
  const [dismissedUrl, setDismissedUrl] = useState<string | null>(null);
  const activeUrl = capabilities.url;
  const visible =
    activeUrl !== null &&
    activeUrl.startsWith(runtimeInfo.getURL('')) &&
    !capabilities.videoByMode[CaptureMode.TAB].supported &&
    dismissedUrl !== activeUrl;

  return { visible, dismiss: () => setDismissedUrl(activeUrl) };
}

export function ExtensionPageWarning({ locale, onClose }: { locale: AppLocale; onClose(): void }) {
  return (
    <div
      className="popup-react-shell__extension-warning"
      data-ui="popup.app.extension-warning"
      role="status"
    >
      <span>{popupCommonMessages.extensionTabModeUnavailable[locale]}</span>
      <button type="button" aria-label={commonMessages.actions.close[locale]} onClick={onClose}>
        <X aria-hidden="true" />
      </button>
    </div>
  );
}

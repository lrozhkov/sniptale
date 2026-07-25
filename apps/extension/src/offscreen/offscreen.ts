import { bootstrapOffscreenDocument } from './runtime/bootstrap';
import { registerOffscreenRuntimeMessageListener } from './runtime';
import { getCurrentLocale, translate } from '../platform/i18n';

function applyOffscreenDocumentMetadata(): void {
  if (typeof document === 'undefined') {
    return;
  }

  const locale = getCurrentLocale();
  const statusText = document.getElementById('statusText');

  document.documentElement.lang = locale;
  document.title = translate('background.runtime.offscreenDocumentTitle', locale);

  if (statusText) {
    statusText.textContent = translate('popup.labels.statusReady', locale);
  }
}

applyOffscreenDocumentMetadata();
bootstrapOffscreenDocument();
registerOffscreenRuntimeMessageListener();

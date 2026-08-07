import { bootstrapOffscreenDocument } from './runtime/bootstrap';
import { registerOffscreenRuntimeMessageListener } from './runtime';
import { getCurrentLocale, translate } from '../platform/i18n';
import { registerOffscreenVoiceInputMessageListener } from './voice-input/runtime';
import '@sniptale/ui/styles';
import '../features/highlighter/frame-annotation/callout/font.css';

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
registerOffscreenVoiceInputMessageListener();

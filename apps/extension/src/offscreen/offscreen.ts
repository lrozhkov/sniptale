import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createRuntimeMessagingTransport } from '../platform/runtime-messaging';
import { createSyncConnectionExecutor } from './sync-connection/executor';
import { createSyncQueueExecution } from './sync-connection/execution';
import { registerOffscreenSyncMessageListener } from './sync-connection/runtime';
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
registerOffscreenRuntimeMessageListener();
registerOffscreenVoiceInputMessageListener();
const offscreenUrl = new URL(globalThis.location.href);
const offscreenStartupId = offscreenUrl.searchParams.get('offscreenStartupId');
if (offscreenStartupId && offscreenUrl.searchParams.get('privacyErasure') !== '1') {
  const messaging = createRuntimeMessagingTransport();
  const executor = createSyncConnectionExecutor({
    executorId: crypto.randomUUID(),
    offscreenStartupId,
    createExecution: (input) =>
      createSyncQueueExecution(input, async (origin) => {
        const response = await messaging.sendRuntimeMessage({
          type: MessageType.SYNC_CONNECTION_ORIGIN_PERMISSION,
          requestId: crypto.randomUUID(),
          authorization: input.authorization,
          origin,
        });
        return response.success === true && response.allowed === true;
      }),
  });
  registerOffscreenSyncMessageListener(executor);
}
bootstrapOffscreenDocument();

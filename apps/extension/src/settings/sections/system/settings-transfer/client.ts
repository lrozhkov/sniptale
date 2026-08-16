import { settingsRuntimeMessagingTransport } from '../../../runtime/messaging';
import { createSettingsTransferClient } from '../../../runtime/settings-transfer-client';

export const sendSettingsTransferOperation = createSettingsTransferClient(
  settingsRuntimeMessagingTransport
);

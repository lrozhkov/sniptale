import { beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { installBackgroundRuntimeMessagingMock } from '../../routing-contracts/runtime-messaging/mock';

const { loadPopupExportPreferencesMock, sendTabMessageMock, translateMock } = vi.hoisted(() => ({
  loadPopupExportPreferencesMock: vi.fn(),
  sendTabMessageMock: vi.fn(),
  translateMock: vi.fn((key: string) => key),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: translateMock,
}));

vi.mock('../../../platform/runtime-messaging', async () => {
  const actual = await vi.importActual('../../../platform/runtime-messaging');
  return {
    ...actual,
    sendTabMessage: sendTabMessageMock,
  };
});

vi.mock('../../../composition/persistence/popup-export-preferences', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/popup-export-preferences')
  >()),
  loadPopupExportPreferences: loadPopupExportPreferencesMock,
}));

vi.mock('../../media/lifecycle', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../media/lifecycle')>()),
  startRecording: vi.fn(),
}));

import { startContextMenuExport } from './action-helpers';
import { contextMenuPopupExportPreferencesFixture } from './test-fixtures';

beforeEach(() => {
  vi.clearAllMocks();
  loadPopupExportPreferencesMock.mockResolvedValue({
    ...contextMenuPopupExportPreferencesFixture,
    includeFullPageScreenshot: true,
  });
  sendTabMessageMock.mockResolvedValue({ success: true });
  installBackgroundRuntimeMessagingMock({ sendTabMessage: sendTabMessageMock });
});

it('adds a full-page screenshot content intent grant to context menu export', async () => {
  await startContextMenuExport(15);

  expect(sendTabMessageMock).toHaveBeenNthCalledWith(1, 15, {
    contentIntentGrant: { grantToken: expect.any(String) },
    options: {
      includeBasicLogs: false,
      includeCssDiagnostics: false,
      includeFiles: true,
      includeFullPageScreenshot: true,
      includeHarDomLogs: false,
      includeImages: true,
      includeJson: true,
      includeMarkdown: true,
    },
    requestId: expect.any(String),
    type: MessageType.EXPORT_POPUP_START,
  });
});

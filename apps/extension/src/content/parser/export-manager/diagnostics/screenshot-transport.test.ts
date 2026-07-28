// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { dataUrlToBlob } from '../../../../platform/media-utils/data-url';
import { sendRuntimeMessage } from '../../../../platform/runtime-messaging';
import { installContentRuntimeMessagingMock } from '../../../platform/runtime-services/services.test-support';
import { captureFullPageScreenshotAsset } from '.';

vi.mock('../../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/media-utils/data-url')>()),
  dataUrlToBlob: vi.fn(),
}));

vi.mock('../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal()),
  sendRuntimeMessage: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  installContentRuntimeMessagingMock(sendRuntimeMessage);
});

describe('captureFullPageScreenshotAsset intent', () => {
  it('attaches a background-issued content intent before full-page capture', async () => {
    const blob = new Blob(['image'], { type: 'image/png' });
    vi.mocked(sendRuntimeMessage)
      .mockResolvedValueOnce({
        success: true,
        contentIntent: { requestId: 'export-run-1', token: 'token-1' },
      })
      .mockResolvedValueOnce({
        success: true,
        dataUrl: 'data:image/png;base64,AAAA',
      });
    vi.mocked(dataUrlToBlob).mockResolvedValueOnce(blob);

    await expect(
      captureFullPageScreenshotAsset(
        {
          grantToken: 'grant-1',
          kind: 'background-auto-start',
        },
        {
          action: MessageType.EXPORT_CAPTURE_FULL_PAGE,
          exportRunId: 'export-run-1',
        }
      )
    ).resolves.toEqual({
      captureWarnings: [],
      path: 'page-screenshot.png',
      content: blob,
    });

    expect(sendRuntimeMessage).toHaveBeenNthCalledWith(1, {
      actionType: MessageType.EXPORT_CAPTURE_FULL_PAGE,
      requestId: 'export-run-1',
      source: {
        grantToken: 'grant-1',
        kind: 'background-auto-start',
      },
      type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY,
    });
    expect(sendRuntimeMessage).toHaveBeenNthCalledWith(2, {
      contentIntent: { requestId: 'export-run-1', token: 'token-1' },
      exportRunId: 'export-run-1',
      type: MessageType.EXPORT_CAPTURE_FULL_PAGE,
    });
  });
});

describe('captureFullPageScreenshotAsset response handling', () => {
  it('converts the returned data URL into an archive asset', async () => {
    const blob = new Blob(['image'], { type: 'image/png' });
    vi.mocked(sendRuntimeMessage).mockResolvedValueOnce({
      success: true,
      dataUrl: 'data:image/png;base64,AAAA',
    });
    vi.mocked(dataUrlToBlob).mockResolvedValueOnce(blob);

    await expect(captureFullPageScreenshotAsset()).resolves.toEqual({
      captureWarnings: [],
      path: 'page-screenshot.png',
      content: blob,
    });
    expect(dataUrlToBlob).toHaveBeenCalledWith('data:image/png;base64,AAAA');
  });

  it('routes unattended archive capture without accepting a backend boolean', async () => {
    const blob = new Blob(['image'], { type: 'image/png' });
    vi.mocked(sendRuntimeMessage)
      .mockResolvedValueOnce({
        success: true,
        contentIntent: { requestId: 'batch-1', token: 'token-1' },
      })
      .mockResolvedValueOnce({
        success: true,
        dataUrl: 'data:image/png;base64,AAAA',
        downscaled: true,
        frozenExtentWarning: true,
      });
    vi.mocked(dataUrlToBlob).mockResolvedValueOnce(blob);

    await expect(
      captureFullPageScreenshotAsset(
        { grantToken: 'grant-1', kind: 'background-auto-start' },
        {
          action: MessageType.EXPORT_CAPTURE_FULL_PAGE_UNATTENDED,
          exportRunId: 'batch-1',
        }
      )
    ).resolves.toEqual({
      captureWarnings: [expect.any(String), expect.any(String)],
      content: blob,
      path: 'page-screenshot.png',
    });
    expect(sendRuntimeMessage).toHaveBeenNthCalledWith(2, {
      contentIntent: { requestId: 'batch-1', token: 'token-1' },
      exportRunId: 'batch-1',
      type: MessageType.EXPORT_CAPTURE_FULL_PAGE_UNATTENDED,
    });
  });

  it('throws when screenshot capture does not return a data URL', async () => {
    vi.mocked(sendRuntimeMessage).mockResolvedValueOnce({
      success: false,
      error: 'capture failed',
    });

    await expect(captureFullPageScreenshotAsset()).rejects.toThrow('capture failed');
  });

  it('sanitizes screenshot capture errors before throwing them', async () => {
    vi.mocked(sendRuntimeMessage).mockResolvedValueOnce({
      success: false,
      error: 'capture failed token=secret',
    });

    await expect(captureFullPageScreenshotAsset()).rejects.toThrow('capture failed token=***');
  });

  it('maps debugger conflicts to a user-facing screenshot recovery hint', async () => {
    vi.mocked(sendRuntimeMessage).mockResolvedValueOnce({
      success: false,
      error: 'Debugger is not attached to the tab with id: 42.',
    });

    await expect(captureFullPageScreenshotAsset()).rejects.toThrow(
      'Не удалось снять скриншот. Попробуйте закрыть режим разработчика или обновить страницу'
    );
  });
});

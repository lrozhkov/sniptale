import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  attachContentActionIntent: vi.fn(),
  dataUrlToBlob: vi.fn(),
  sendRuntimeMessage: vi.fn(),
}));

vi.mock('../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/data-url')>()),
  dataUrlToBlob: mocks.dataUrlToBlob,
}));

vi.mock('../../platform/runtime-services/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/runtime-services/services')>()),
  getContentRuntimeServices: () => ({
    contentActionIntent: {
      attachContentActionIntent: mocks.attachContentActionIntent,
    },
    messaging: { sendRuntimeMessage: mocks.sendRuntimeMessage },
  }),
}));

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { captureWebSnapshotScreenshot, captureWebSnapshotScreenshotWithWarnings } from './capture';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.attachContentActionIntent.mockImplementation(async (request) => ({
    ...request,
    contentIntent: { requestId: request.exportRunId, token: 'token-1' },
  }));
});

it('captures through the active native full-page action and returns its blob', async () => {
  const blob = new Blob(['png'], { type: 'image/png' });
  const contentIntentSource = { grantToken: 'grant-1', kind: 'background-auto-start' } as const;
  mocks.sendRuntimeMessage.mockResolvedValue({
    success: true,
    dataUrl: 'data:image/png;base64,AAAA',
  });
  mocks.dataUrlToBlob.mockResolvedValue(blob);

  await expect(
    captureWebSnapshotScreenshot(contentIntentSource, {
      action: MessageType.EXPORT_CAPTURE_FULL_PAGE,
      exportRunId: 'snapshot-1',
    })
  ).resolves.toBe(blob);

  expect(mocks.attachContentActionIntent).toHaveBeenCalledWith(
    { type: MessageType.EXPORT_CAPTURE_FULL_PAGE, exportRunId: 'snapshot-1' },
    contentIntentSource,
    'snapshot-1'
  );
  expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith({
    contentIntent: { requestId: 'snapshot-1', token: 'token-1' },
    exportRunId: 'snapshot-1',
    type: MessageType.EXPORT_CAPTURE_FULL_PAGE,
  });
});

it('preserves native capture warnings', async () => {
  const blob = new Blob(['png'], { type: 'image/png' });
  mocks.sendRuntimeMessage.mockResolvedValue({
    success: true,
    dataUrl: 'data:image/png;base64,AAAA',
    downscaled: true,
    frozenExtentWarning: true,
  });
  mocks.dataUrlToBlob.mockResolvedValue(blob);

  await expect(captureWebSnapshotScreenshotWithWarnings()).resolves.toEqual({
    blob,
    warnings: [expect.any(String), expect.any(String)],
  });
});

it('sanitizes native capture failures', async () => {
  mocks.sendRuntimeMessage.mockResolvedValue({
    success: false,
    error: 'capture failed token=secret',
  });

  await expect(captureWebSnapshotScreenshotWithWarnings()).rejects.toThrow(
    'capture failed token=***'
  );
});

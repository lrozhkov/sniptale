import { beforeEach, expect, it, vi } from 'vitest';
import { MAX_BROWSER_ANNOTATIONS_EXPORT_TEXT_BYTES } from '@sniptale/runtime-contracts/export';
import { MAX_CLIPBOARD_TEXT_LENGTH } from '@sniptale/runtime-contracts/validation/text';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

const mocks = vi.hoisted(() => ({
  attachContentActionIntent: vi.fn(async (message: object, source?: { kind?: string } | null) => {
    if (source?.kind !== 'trusted-content-event') {
      throw new Error('A trusted user event is required to export browser annotations.');
    }
    return {
      ...message,
      contentIntent: { requestId: 'request-1', token: 'token-1' },
    };
  }),
  prepareText: vi.fn(),
  sendRuntimeMessage: vi.fn(),
  writeText: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/clipboard', () => ({
  writeBrowserClipboardText: mocks.writeText,
}));

vi.mock('../../../parser/page-preparation/annotations/format', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../parser/page-preparation/annotations/format')>()),
  captureBrowserAnnotationsExportText: mocks.prepareText,
}));

vi.mock('../../../application/runtime-services/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../application/runtime-services/services')>()),
  getContentRuntimeServices: () => ({
    messaging: { sendRuntimeMessage: mocks.sendRuntimeMessage },
  }),
}));

vi.mock('../../../application/privileged-action-intent', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../application/privileged-action-intent')>()),
  attachContentActionIntent: mocks.attachContentActionIntent,
}));

import { executeToolbarAnnotationExportAction } from './export-actions';

beforeEach(() => {
  mocks.attachContentActionIntent.mockClear();
  mocks.prepareText.mockReset();
  mocks.sendRuntimeMessage.mockReset();
  mocks.writeText.mockReset();
});

it('starts clipboard writing in the initiating action turn with one immutable artifact', async () => {
  let currentArtifact = 'initial annotations';
  mocks.prepareText.mockImplementation(() => currentArtifact);

  const copyPromise = executeToolbarAnnotationExportAction('copy', {
    kind: 'trusted-content-event',
  });
  expect(mocks.writeText).toHaveBeenCalledWith('initial annotations');
  currentArtifact = 'later annotations';
  await copyPromise;

  expect(mocks.prepareText).toHaveBeenCalledTimes(1);
  expect(mocks.writeText).toHaveBeenCalledWith('initial annotations');
  expect(mocks.sendRuntimeMessage).not.toHaveBeenCalled();
});

it('downloads exactly one prepared artifact through a protected runtime action', async () => {
  mocks.prepareText.mockReturnValue('# Browser comments:\n');
  mocks.sendRuntimeMessage.mockResolvedValue({ success: true });
  const source = { kind: 'trusted-content-event' } as const;

  const downloadPromise = executeToolbarAnnotationExportAction('download', source);

  expect(mocks.prepareText).toHaveBeenCalledTimes(1);
  expect(mocks.attachContentActionIntent).toHaveBeenCalledWith(
    { type: MessageType.DOWNLOAD_BROWSER_ANNOTATIONS, text: '# Browser comments:\n' },
    source
  );
  await downloadPromise;
  expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith({
    type: MessageType.DOWNLOAD_BROWSER_ANNOTATIONS,
    text: '# Browser comments:\n',
    contentIntent: { requestId: 'request-1', token: 'token-1' },
  });
  expect(mocks.writeText).not.toHaveBeenCalled();
});

it('delivers empty formatter artifacts unchanged for copy and download', async () => {
  const source = { kind: 'trusted-content-event' } as const;
  mocks.prepareText.mockReturnValue('');
  mocks.sendRuntimeMessage.mockResolvedValue({ success: true });

  await executeToolbarAnnotationExportAction('copy', source);

  expect(mocks.prepareText).toHaveBeenCalledTimes(1);
  expect(mocks.writeText).toHaveBeenCalledWith('');

  mocks.prepareText.mockClear();
  await executeToolbarAnnotationExportAction('download', source);

  expect(mocks.prepareText).toHaveBeenCalledTimes(1);
  expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith({
    type: MessageType.DOWNLOAD_BROWSER_ANNOTATIONS,
    text: '',
    contentIntent: { requestId: 'request-1', token: 'token-1' },
  });
});

it('rejects untrusted copy before formatter and clipboard effects', async () => {
  await expect(executeToolbarAnnotationExportAction('copy')).rejects.toThrow('trusted user event');

  expect(mocks.prepareText).not.toHaveBeenCalled();
  expect(mocks.writeText).not.toHaveBeenCalled();
});

it('rejects an untrusted download before any annotation egress', async () => {
  mocks.prepareText.mockReturnValue('# Browser comments:\nKept dictated text');

  await expect(executeToolbarAnnotationExportAction('download')).rejects.toThrow(
    'trusted user event'
  );

  expect(mocks.attachContentActionIntent).toHaveBeenCalledWith(
    {
      type: MessageType.DOWNLOAD_BROWSER_ANNOTATIONS,
      text: '# Browser comments:\nKept dictated text',
    },
    undefined
  );
  expect(mocks.sendRuntimeMessage).not.toHaveBeenCalled();
  expect(mocks.writeText).not.toHaveBeenCalled();
});

it('rejects clipboard and download oversize before their effects', async () => {
  mocks.prepareText.mockReturnValueOnce('x'.repeat(MAX_CLIPBOARD_TEXT_LENGTH + 1));
  await expect(
    executeToolbarAnnotationExportAction('copy', { kind: 'trusted-content-event' })
  ).rejects.toThrow('clipboard text limit');
  expect(mocks.writeText).not.toHaveBeenCalled();

  mocks.prepareText.mockReturnValueOnce('x'.repeat(MAX_BROWSER_ANNOTATIONS_EXPORT_TEXT_BYTES + 1));
  await expect(
    executeToolbarAnnotationExportAction('download', { kind: 'trusted-content-event' })
  ).rejects.toThrow('direct-download limit');
  expect(mocks.attachContentActionIntent).not.toHaveBeenCalled();
  expect(mocks.sendRuntimeMessage).not.toHaveBeenCalled();
});

it('surfaces runtime rejection and opens configurable export without formatting annotations', async () => {
  mocks.prepareText.mockReturnValue('annotations');
  mocks.sendRuntimeMessage.mockResolvedValueOnce({ error: 'denied', success: false });

  await expect(
    executeToolbarAnnotationExportAction('download', { kind: 'trusted-content-event' })
  ).rejects.toThrow('denied');

  mocks.prepareText.mockClear();
  mocks.sendRuntimeMessage.mockResolvedValueOnce({ success: true });
  const openPromise = executeToolbarAnnotationExportAction('configure-export', {
    kind: 'trusted-content-event',
  });

  expect(mocks.prepareText).not.toHaveBeenCalled();
  expect(mocks.attachContentActionIntent).toHaveBeenLastCalledWith(
    { type: MessageType.OPEN_EXPORT_MODAL },
    { kind: 'trusted-content-event' }
  );
  await openPromise;
});

it('opens the popup export flow for a complete page export', async () => {
  const source = { kind: 'trusted-content-event' } as const;
  mocks.sendRuntimeMessage.mockResolvedValue({ success: true });

  await executeToolbarAnnotationExportAction('export-page', source);

  expect(mocks.attachContentActionIntent).toHaveBeenCalledWith(
    { type: MessageType.OPEN_EXPORT_MODAL },
    source
  );
  expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith({
    contentIntent: { requestId: 'request-1', token: 'token-1' },
    type: MessageType.OPEN_EXPORT_MODAL,
  });
});

it('rejects an untrusted complete export before opening the popup', async () => {
  await expect(executeToolbarAnnotationExportAction('export-page')).rejects.toThrow(
    'trusted user event'
  );

  expect(mocks.sendRuntimeMessage).not.toHaveBeenCalled();
});

it('surfaces popup export launch failures', async () => {
  const source = { kind: 'trusted-content-event' } as const;
  mocks.sendRuntimeMessage.mockResolvedValueOnce({ error: 'popup unavailable', success: false });

  await expect(executeToolbarAnnotationExportAction('export-page', source)).rejects.toThrow(
    'popup unavailable'
  );
});

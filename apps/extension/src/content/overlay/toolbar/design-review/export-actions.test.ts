import { beforeEach, expect, it, vi } from 'vitest';
import type { BrowserAnnotationSessionSnapshot } from '../../../parser/page-preparation/annotations';
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
  finalize: vi.fn(),
  flush: vi.fn(),
  print: vi.fn(),
  sendRuntimeMessage: vi.fn(),
  writeText: vi.fn(),
}));

vi.mock('../../design-review/session/comment-draft-finalization', () => ({
  finalizeDesignReviewCommentDraft: mocks.finalize,
}));
vi.mock('../../design-review/runtime/actions', () => ({
  flushPendingPageStyleHistory: mocks.flush,
}));
vi.mock('../../../parser/page-preparation/annotations/format/print', () => ({
  printReviewReport: mocks.print,
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
  mocks.finalize.mockReset();
  mocks.flush.mockReset();
  mocks.print.mockReset();
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
    { type: MessageType.OPEN_EXPORT_MODAL, startExport: true },
    source
  );
  expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith({
    contentIntent: { requestId: 'request-1', token: 'token-1' },
    type: MessageType.OPEN_EXPORT_MODAL,
    startExport: true,
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

function aggregate() {
  const snapshot: BrowserAnnotationSessionSnapshot = {
    schemaVersion: 1,
    nextAnnotationId: 3,
    nextCreationOrder: 3,
    nextMarkerNumber: 3,
    frameOrders: [],
    domRecords: [1, 2].map((annotationId) => ({
      annotationId,
      creationOrder: annotationId,
      comment: `Saved note ${annotationId}`,
      propertyChanges: [],
      evidence: {
        fileLabel: `Source ${annotationId}`,
        frame: { kind: 'top-document' },
        locator: 'private',
        nodePosition: { x: 0, y: 0 },
        pageUrl: `https://example.test/page-${annotationId}`,
        targetPath: 'p',
        targetSelector: '#missing',
        targetText: 'Missing target',
        viewport: { width: 1280, height: 560 },
      },
    })),
  };
  return {
    snapshot,
    previews: new Map([[2, { dataUrl: 'data:image/png;base64,aGVsbG8=', width: 120, height: 40 }]]),
  };
}
it.each(['copy', 'download'] as const)(
  'exports immutable full-session %s text after draft finalization',
  async (action) => {
    const saved = aggregate();
    const capture = vi.fn(() => saved);
    mocks.finalize.mockImplementation(() => {
      saved.snapshot.domRecords[1]!.comment = 'Finalized draft';
    });
    mocks.sendRuntimeMessage.mockResolvedValue({ success: true });
    const pending = executeToolbarAnnotationExportAction(
      action,
      { kind: 'trusted-content-event' },
      capture
    );
    expect(mocks.finalize).toHaveBeenCalledBefore(mocks.flush);
    expect(mocks.flush).toHaveBeenCalledBefore(capture);
    saved.snapshot.domRecords[1]!.comment = 'Changed after initiating export';
    await pending;
    const text: unknown =
      action === 'copy'
        ? mocks.writeText.mock.calls[0]?.[0]
        : mocks.sendRuntimeMessage.mock.calls[0]?.[0]?.text;
    expect(text).toEqual(expect.stringContaining('Finalized draft'));
    expect(text).toEqual(expect.stringContaining('Saved note 1'));
    expect(text).toEqual(expect.stringContaining('https://example.test/page-2'));
    expect(text).not.toEqual(expect.stringContaining('Changed after initiating export'));
    expect(capture).toHaveBeenCalledOnce();
    expect(mocks.prepareText).not.toHaveBeenCalled();
  }
);
it('prints full-session saved evidence without capturing a current page', async () => {
  const saved = aggregate();
  const capture = vi.fn(() => saved);
  const pending = executeToolbarAnnotationExportAction(
    'pdf',
    { kind: 'trusted-content-event' },
    capture
  );
  saved.snapshot.domRecords[0]!.comment = 'Later change';
  saved.previews.clear();
  await pending;
  expect(mocks.print).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      domRecords: [
        expect.objectContaining({ comment: 'Saved note 1' }),
        expect.objectContaining({ comment: 'Saved note 2' }),
      ],
    }),
    expect.objectContaining({
      previews: new Map([
        [2, { dataUrl: 'data:image/png;base64,aGVsbG8=', width: 120, height: 40 }],
      ]),
    })
  );
  expect(capture).toHaveBeenCalledOnce();
  expect(mocks.sendRuntimeMessage).not.toHaveBeenCalled();
});
it('preserves the draft and refuses aggregate export when finalization fails', async () => {
  const capture = vi.fn(aggregate);
  mocks.finalize.mockImplementation(() => {
    throw new Error('Draft refused');
  });
  await expect(
    executeToolbarAnnotationExportAction('copy', { kind: 'trusted-content-event' }, capture)
  ).rejects.toThrow('Draft refused');
  expect(capture).not.toHaveBeenCalled();
  expect(mocks.writeText).not.toHaveBeenCalled();
});

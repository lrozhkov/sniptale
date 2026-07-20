import { expect, it, vi } from 'vitest';

import { traceEditorImageDocumentApplied, traceEditorImageDocumentCreated } from './events';

const logEditorOpenTraceMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../../core/debug', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../core/debug')>()),
  logEditorOpenTrace: logEditorOpenTraceMock,
}));

it('logs created and applied image document dimensions', () => {
  const document = {
    canvasHeight: 480,
    canvasWidth: 640,
    sourceHeight: 960,
    sourceWidth: 1280,
  };

  traceEditorImageDocumentCreated(document as never);
  traceEditorImageDocumentApplied(document as never);

  expect(logEditorOpenTraceMock).toHaveBeenCalledWith('document:created', {
    canvasHeight: 480,
    canvasWidth: 640,
    sourceHeight: 960,
    sourceWidth: 1280,
  });
  expect(logEditorOpenTraceMock).toHaveBeenCalledWith('document:applied', {
    canvasHeight: 480,
    canvasWidth: 640,
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sendPopupExportTabMessage: vi.fn(),
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => `t:${key}`,
}));

vi.mock('./tab-message-routing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./tab-message-routing')>()),
  sendPopupExportTabMessage: (...args: unknown[]) => mocks.sendPopupExportTabMessage(...args),
}));

import {
  getPopupExportErrorMessage,
  getPopupExportTransportErrorMessage,
  requestPopupExportPreview,
} from './preview-request';

beforeEach(() => {
  mocks.sendPopupExportTabMessage.mockReset();
});

function verifiesExplicitAndFallbackErrorMessages() {
  expect(getPopupExportErrorMessage(new Error('boom'), 'popup.export.prepareExportError')).toBe(
    'boom'
  );
  expect(getPopupExportErrorMessage('ignored', 'popup.export.prepareExportError')).toBe('ignored');
}

function verifiesStaleErrorNormalization() {
  expect(
    getPopupExportTransportErrorMessage(
      'Could not establish connection. Receiving end does not exist.',
      'popup.export.startExportError'
    )
  ).toBe('t:popup.common.stalePageRuntimeHint');
}

async function verifiesPreviewRequestSuccess() {
  mocks.sendPopupExportTabMessage.mockResolvedValue({
    preview: { title: 'Preview' },
    success: true,
  });

  await expect(requestPopupExportPreview(7, 'popup.export.prepareExportError')).resolves.toEqual({
    title: 'Preview',
  });

  expect(mocks.sendPopupExportTabMessage).toHaveBeenCalledWith(
    7,
    expect.objectContaining({
      type: 'EXPORT_POPUP_PREVIEW',
    })
  );
}

async function verifiesFallbackPreviewFailure() {
  mocks.sendPopupExportTabMessage.mockResolvedValue({
    error: '',
    success: false,
  });

  await expect(requestPopupExportPreview(8, 'popup.export.reloadExportError')).rejects.toThrow(
    't:popup.export.reloadExportError'
  );
}

async function verifiesStalePreviewFailure() {
  mocks.sendPopupExportTabMessage.mockResolvedValue({
    error: 'Could not establish connection. Receiving end does not exist.',
    success: false,
  });

  await expect(requestPopupExportPreview(8, 'popup.export.reloadExportError')).rejects.toThrow(
    't:popup.common.stalePageRuntimeHint'
  );
}

describe('popup export runtime preview request', () => {
  it(
    'uses the error message from real errors before falling back to translation',
    verifiesExplicitAndFallbackErrorMessages
  );
  it('normalizes stale page runtime errors into a refresh hint', verifiesStaleErrorNormalization);
  it('requests preview data from the provided tab', verifiesPreviewRequestSuccess);
  it('maps failed preview responses to the fallback translation', verifiesFallbackPreviewFailure);
  it('maps stale preview transport responses to the refresh hint', verifiesStalePreviewFailure);
});

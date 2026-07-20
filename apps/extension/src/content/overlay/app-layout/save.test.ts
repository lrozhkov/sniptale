import { describe, expect, it, vi } from 'vitest';
import { handleContentSaveDialogSave } from './save';

function createTranslateMock() {
  return vi.fn((key: string) => `translated:${key}`);
}

async function verifiesSuccessToast() {
  const saveCaptureRequest = vi.fn().mockResolvedValue({ success: true });
  const showToastMessage = vi.fn();
  const translateMessage = createTranslateMock();

  await handleContentSaveDialogSave({
    actionType: 'download_default',
    filename: 'capture.png',
    presetId: 'preset-1',
    saveCaptureRequest,
    saveDialogState: {
      dataUrl: 'data:image/png;base64,1',
      filename: 'capture.png',
    },
    showToastMessage,
    translateMessage,
  });

  expect(saveCaptureRequest).toHaveBeenCalledWith(
    { dataUrl: 'data:image/png;base64,1', filename: 'capture.png' },
    'download_default',
    'preset-1',
    'capture.png',
    undefined
  );
  expect(showToastMessage).toHaveBeenCalledWith(
    'translated:content.interactiveFrame.screenshotSaved',
    'success'
  );
}

async function verifiesRuntimeErrorToast() {
  const showToastMessage = vi.fn();

  await handleContentSaveDialogSave({
    actionType: 'ask_system',
    filename: 'capture.png',
    presetId: null,
    saveCaptureRequest: vi.fn().mockResolvedValue({
      success: false,
      error: 'save failed',
    }),
    saveDialogState: {
      dataUrl: 'data:image/png;base64,1',
      filename: 'capture.png',
    },
    showToastMessage,
    translateMessage: createTranslateMock(),
  });

  expect(showToastMessage).toHaveBeenCalledWith('save failed', 'error');
}

async function verifiesTranslatedFallbackErrorToast() {
  const showToastMessage = vi.fn();

  await handleContentSaveDialogSave({
    actionType: 'ask_system',
    filename: 'capture.png',
    presetId: null,
    saveCaptureRequest: vi.fn().mockResolvedValue({
      success: false,
      error: '',
    }),
    saveDialogState: {
      dataUrl: 'data:image/png;base64,1',
      filename: 'capture.png',
    },
    showToastMessage,
    translateMessage: createTranslateMock(),
  });

  expect(showToastMessage).toHaveBeenCalledWith(
    'translated:content.interactiveFrame.screenshotSaveError',
    'error'
  );
}

async function verifiesRejectedTransportShowsTranslatedErrorToast() {
  const showToastMessage = vi.fn();

  await handleContentSaveDialogSave({
    actionType: 'ask_system',
    filename: 'capture.png',
    presetId: null,
    saveCaptureRequest: vi.fn().mockRejectedValue(new Error('transport failed')),
    saveDialogState: {
      dataUrl: 'data:image/png;base64,1',
      filename: 'capture.png',
    },
    showToastMessage,
    translateMessage: createTranslateMock(),
  });

  expect(showToastMessage).toHaveBeenCalledWith(
    'translated:content.interactiveFrame.screenshotSaveError',
    'error'
  );
}

describe('content-app-layout.save', () => {
  it('shows a success toast when saving succeeds', verifiesSuccessToast);
  it('shows the runtime error when saving fails', verifiesRuntimeErrorToast);
  it(
    'falls back to the translated error toast when the runtime omits an error message',
    verifiesTranslatedFallbackErrorToast
  );
  it(
    'shows the translated error toast when the runtime transport rejects',
    verifiesRejectedTransportShowsTranslatedErrorToast
  );
});

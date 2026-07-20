import { describe, expect, it, vi } from 'vitest';

const { maybeHandleEditorSaveFailureMock, saveEditorRenderedImageMock } = vi.hoisted(() => ({
  maybeHandleEditorSaveFailureMock: vi.fn(),
  saveEditorRenderedImageMock: vi.fn(),
}));

vi.mock('../../document/file-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../document/file-actions')>()),
  saveEditorRenderedImage: saveEditorRenderedImageMock,
}));

vi.mock('./save-failure', () => ({
  maybeHandleEditorSaveFailure: maybeHandleEditorSaveFailureMock,
}));

import { buildSidebarSaveActions } from './save';

function createSaveActions(hasImage: boolean) {
  return buildSidebarSaveActions({
    controller: {
      exportDocument: vi.fn(),
      renderToDataUrl: vi.fn(),
    },
    confirmOpenStorageManager: vi.fn(async () => false),
    defaultImagePresetId: 'preset-default',
    hasImage,
    savePresets: [{ enabled: true, id: 'preset-default', name: 'Default', order: 0, path: 'out' }],
  });
}

describe('buildSidebarSaveActions', () => {
  it('returns a preset renderer and skips save commands when there is no image', async () => {
    const actions = createSaveActions(false);

    const element = actions.renderSavePresetOptions();
    await actions.onSaveImage();
    await actions.onSaveImageAs();
    await actions.saveToPreset('preset-default');

    expect(element.props.defaultImagePresetId).toBe('preset-default');
    expect(element.props.savePresets).toHaveLength(1);
    expect(saveEditorRenderedImageMock).not.toHaveBeenCalled();
  });

  it('routes successful save commands through saveEditorRenderedImage', async () => {
    saveEditorRenderedImageMock.mockResolvedValue(undefined);
    const actions = createSaveActions(true);

    await actions.onSaveImage();
    await actions.onSaveImageAs();
    await actions.saveToPreset('preset-default');

    expect(saveEditorRenderedImageMock).toHaveBeenNthCalledWith(1, expect.any(Object), undefined);
    expect(saveEditorRenderedImageMock).toHaveBeenNthCalledWith(2, expect.any(Object), {
      actionType: 'ask_system',
    });
    expect(saveEditorRenderedImageMock).toHaveBeenNthCalledWith(3, expect.any(Object), {
      presetId: 'preset-default',
    });
  });

  it('handles storage save failures before rethrowing the error', async () => {
    const error = new Error('Disk full');
    saveEditorRenderedImageMock.mockRejectedValueOnce(error);
    maybeHandleEditorSaveFailureMock.mockResolvedValue(true);
    const actions = createSaveActions(true);

    await expect(actions.onSaveImage()).rejects.toThrow('Disk full');

    expect(maybeHandleEditorSaveFailureMock).toHaveBeenCalledWith({
      confirmOpenStorageManager: expect.any(Function),
      error,
    });
  });
});

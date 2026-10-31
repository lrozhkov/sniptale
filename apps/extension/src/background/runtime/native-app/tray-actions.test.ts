import { beforeEach, expect, it, vi } from 'vitest';
import { handleNativeTrayAction } from './tray-actions';
import { createInitialNativeAppRuntimeStatus } from './status';
import { createNativeLease } from './service.test-support';
const mocks = vi.hoisted(() => ({ gallery: vi.fn(), settings: vi.fn(), editor: vi.fn() }));
vi.mock('../../../platform/navigation/extension-pages', async (original) => ({
  ...(await original<typeof import('../../../platform/navigation/extension-pages')>()),
  openGalleryPage: mocks.gallery,
  openSettingsPage: mocks.settings,
  openVideoEditorPage: mocks.editor,
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.gallery.mockResolvedValue(undefined);
  mocks.settings.mockResolvedValue(undefined);
  mocks.editor.mockResolvedValue(undefined);
});
function request(actionId: string, lease = createNativeLease()) {
  const post = vi.fn();
  return {
    post,
    status: { ...createInitialNativeAppRuntimeStatus('test'), controllerLease: lease },
    message: {
      type: 'app.tray.actionRequested' as const,
      protocolVersion: 2,
      controllerLeaseId: 'lease-1',
      actionId,
      invocationId: 'invocation-1',
      requestedAtEpochMs: Date.now(),
    },
  };
}
it('executes only the declared browser navigation actions', async () => {
  for (const [id, operation] of [
    ['open-gallery', mocks.gallery],
    ['open-settings', mocks.settings],
    ['open-video-editor', mocks.editor],
  ] as const) {
    const args = request(id);
    await handleNativeTrayAction(args);
    expect(operation).toHaveBeenCalledOnce();
    expect(args.post).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'extension.tray.actionResult', accepted: true })
    );
  }
});
it('refuses native capture and recording actions because Desktop owns them', async () => {
  for (const id of [
    'capture-screenshot-screen',
    'start-recording-screen',
    'pause-recording',
    'stop-recording',
    'unknown',
  ]) {
    const args = request(id);
    await handleNativeTrayAction(args);
    expect(args.post).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: 'extension.tray.actionResult', accepted: false })
    );
  }
  expect(mocks.gallery).not.toHaveBeenCalled();
});
it('refuses actions after Desktop changes the selected target', async () => {
  const args = request(
    'open-gallery',
    createNativeLease({ status: 'rejected', selectionStatus: 'available' })
  );
  await handleNativeTrayAction(args);
  expect(mocks.gallery).not.toHaveBeenCalled();
  expect(args.post).toHaveBeenCalledWith(expect.objectContaining({ accepted: false }));
});
it('reports a failed browser navigation without claiming success', async () => {
  mocks.gallery.mockRejectedValue(new Error('tab creation failed'));
  const args = request('open-gallery');
  await handleNativeTrayAction(args);
  expect(args.post).toHaveBeenCalledWith(
    expect.objectContaining({ accepted: false, error: 'Failed to open extension page' })
  );
});

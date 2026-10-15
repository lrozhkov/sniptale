import { beforeEach, expect, it, vi } from 'vitest';
import { attachReviewWebcam, findReviewWebcam, recoverReviewWebcam } from './webcam-source';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { createQuickEditWebcam } from '../../features/video/review/advanced/webcam';

const io = vi.hoisted(() => ({
  get: vi.fn(),
  bytes: vi.fn(),
  recover: vi.fn(),
  list: vi.fn(),
  read: vi.fn(),
  inspect: vi.fn(),
  prepare: vi.fn(),
  protect: vi.fn(),
  publish: vi.fn(),
  cancel: vi.fn(),
  readWorkspace: vi.fn(),
}));
vi.mock('./asset-bytes', () => ({ resolveReviewAssetBytes: io.bytes }));
vi.mock('../../composition/persistence/projects/asset-publication', () => ({
  recoverProjectMediaPublications: io.recover,
}));
vi.mock('../../composition/persistence/media-library', () => ({
  getMediaLibraryEntry: io.get,
  listMediaLibrary: io.list,
}));
vi.mock('../../composition/persistence/projects', () => ({ prepareProjectAsset: io.prepare }));
vi.mock('./source', () => ({ readReviewMediaOriginal: io.read, inspectReviewVideo: io.inspect }));
vi.mock('../../composition/persistence/review-workspaces/store', () => ({
  readVideoWorkspace: io.readWorkspace,
}));

const source = { duration: 12, width: 640, height: 480, mimeType: 'video/webm', size: 4 };
const root = { id: 'display', recordingGroup: { groupId: 'group', role: 'display', order: 0 } };
const candidate = {
  id: 'camera',
  filename: 'camera.webm',
  mimeType: 'video/webm',
  source: { kind: 'recording', recordingId: 'camera-recording' },
  recordingGroup: { groupId: 'group', role: 'webcam', order: 1 },
};
const request = () => ({
  aggregateId: 'display',
  mediaId: 'camera',
  signal: new AbortController().signal,
  assertCurrentTarget: vi.fn(),
  attach: vi.fn(),
});

beforeEach(() => {
  vi.resetAllMocks();
  io.get.mockResolvedValue(root);
  io.list.mockResolvedValue([candidate]);
  io.read.mockResolvedValue({ file: new File(['data'], 'camera.webm', { type: 'video/webm' }) });
  io.inspect.mockResolvedValue({ source });
  io.readWorkspace.mockResolvedValue(null);
  io.prepare.mockResolvedValue({
    id: 'private',
    protect: io.protect,
    publish: io.publish,
    cancel: io.cancel,
  });
});

it('discovers only active webcam siblings of a display, in stable group order, without writes', async () => {
  io.list.mockResolvedValue([
    {
      ...candidate,
      id: 'other',
      recordingGroup: { ...candidate.recordingGroup, groupId: 'other' },
    },
    { ...candidate, id: 'trash', lifecycle: { trashedAt: 1 } },
    { ...candidate, id: 'later', recordingGroup: { ...candidate.recordingGroup, order: 2 } },
    candidate,
  ]);
  expect((await findReviewWebcam('display', new AbortController().signal))?.id).toBe('camera');
  io.get.mockResolvedValue(candidate);
  expect(await findReviewWebcam('camera', new AbortController().signal)).toBeNull();
  expect(io.prepare).not.toHaveBeenCalled();
});

it('publishes private bytes only after an awaited durable attachment', async () => {
  const args = request();
  args.attach.mockImplementation(async () => {
    expect(io.protect).toHaveBeenCalledOnce();
    expect(io.publish).not.toHaveBeenCalled();
  });
  await attachReviewWebcam(args);
  expect(io.prepare).toHaveBeenCalledWith(
    expect.any(File),
    'video/webm',
    'camera.webm',
    undefined,
    undefined,
    { aggregateId: 'display', clipId: 'webcam' },
    { publishToLibrary: false, originMediaId: 'camera' }
  );
  expect(args.attach).toHaveBeenCalledWith('project-asset:private', source);
  expect(io.publish).toHaveBeenCalledOnce();
  expect(io.cancel).not.toHaveBeenCalled();
});

it('reuses a published project asset without creating another byte copy', async () => {
  io.list.mockResolvedValue([
    { ...candidate, source: { kind: 'project-asset', projectAssetId: 'existing' } },
  ]);
  const args = request();
  await attachReviewWebcam(args);
  expect(args.attach).toHaveBeenCalledWith('project-asset:existing', source);
  expect(io.prepare).not.toHaveBeenCalled();
});

it.each(['absent', 'changed', 'bytes', 'metadata'])(
  'refuses %s webcam before staging',
  async (failure) => {
    if (failure === 'absent') io.list.mockResolvedValue([]);
    if (failure === 'changed') io.list.mockResolvedValue([{ ...candidate, id: 'replacement' }]);
    if (failure === 'bytes') io.read.mockResolvedValue(undefined);
    if (failure === 'metadata') io.inspect.mockRejectedValue(new Error('invalid'));
    await expect(attachReviewWebcam(request())).rejects.toThrow();
    expect(io.prepare).not.toHaveBeenCalled();
  }
);

it('cancels pre-attachment failure but retains bytes for an ambiguous durable write or publish failure', async () => {
  const args = request();
  args.attach.mockRejectedValue(new Error('write'));
  await expect(attachReviewWebcam(args)).rejects.toThrow('write');
  expect(io.cancel).toHaveBeenCalledOnce();
  io.cancel.mockClear();
  io.readWorkspace.mockRejectedValue(new Error('storage'));
  await expect(attachReviewWebcam(args)).rejects.toThrow('write');
  expect(io.cancel).not.toHaveBeenCalled();
  args.attach.mockResolvedValue(undefined);
  io.publish.mockRejectedValue(new Error('publish'));
  await expect(attachReviewWebcam(args)).rejects.toThrow('publish');
  expect(io.cancel).not.toHaveBeenCalled();
});

it('cancels protected staging on abort and leaves a committed source recoverable', async () => {
  const abort = new AbortController();
  io.protect.mockImplementation(async () => abort.abort());
  const args = { ...request(), signal: abort.signal };
  await expect(attachReviewWebcam(args)).rejects.toThrow();
  expect(args.attach).not.toHaveBeenCalled();
  expect(io.cancel).toHaveBeenCalledOnce();
});

it('preserves a reference committed before acknowledgement failed', async () => {
  const args = request();
  args.attach.mockRejectedValue(new Error('acknowledgement'));
  io.readWorkspace.mockResolvedValue({
    workspace: {
      advanced: {
        ...createQuickEditAdvancedState(),
        webcam: createQuickEditWebcam('project-asset:private', source, source),
      },
      history: [],
    },
  });
  await expect(attachReviewWebcam(args)).rejects.toThrow('acknowledgement');
  expect(io.readWorkspace).toHaveBeenCalledWith('display');
  expect(io.cancel).not.toHaveBeenCalled();
});

it('recovers a committed camera publication without reacquiring or appending another operation', async () => {
  const args = request();
  io.publish.mockRejectedValueOnce(new Error('storage temporarily unavailable'));
  await expect(attachReviewWebcam(args)).rejects.toThrow('storage temporarily unavailable');
  expect(args.attach).toHaveBeenCalledOnce();
  io.bytes.mockResolvedValue(null);
  const blob = new Blob(['retained camera']);
  io.recover.mockImplementation(async () => {
    io.bytes.mockResolvedValue(blob);
    return 1;
  });
  await expect(recoverReviewWebcam('project-asset:private', args.signal)).resolves.toBeUndefined();
  expect(io.recover).toHaveBeenCalledOnce();
  expect(io.bytes).toHaveBeenNthCalledWith(1, 'project-asset:private');
  expect(io.bytes).toHaveBeenNthCalledWith(2, 'project-asset:private');
  expect(args.attach).toHaveBeenCalledOnce();
  expect(io.prepare).toHaveBeenCalledOnce();
  expect(io.cancel).not.toHaveBeenCalled();
  await recoverReviewWebcam('project-asset:private', args.signal);
  expect(io.recover).toHaveBeenCalledOnce();
});

it('does not replay after cancellation or for a non-project reference', async () => {
  const abort = new AbortController();
  await expect(recoverReviewWebcam('recording:camera', abort.signal)).rejects.toThrow(
    'Invalid webcam'
  );
  io.bytes.mockImplementation(async () => {
    abort.abort();
    return null;
  });
  await expect(recoverReviewWebcam('project-asset:private', abort.signal)).rejects.toThrow();
  expect(io.recover).not.toHaveBeenCalled();
});

it('keeps explicit recovery retryable when publication is still unavailable', async () => {
  io.bytes.mockResolvedValue(null);
  await expect(
    recoverReviewWebcam('project-asset:private', new AbortController().signal)
  ).rejects.toThrow('Review webcam is unavailable');
  expect(io.recover).toHaveBeenCalledOnce();
});

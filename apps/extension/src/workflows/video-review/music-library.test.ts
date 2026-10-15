import { afterEach, expect, it, vi } from 'vitest';
const io = vi.hoisted(() => ({ read: vi.fn(), bind: vi.fn(), inspect: vi.fn(), prepare: vi.fn() }));
vi.mock('../../composition/persistence/projects/library-asset-binding', () => ({
  readLibraryAudioBindingSource: io.read,
  prepareLibraryAudioBinding: io.bind,
}));
vi.mock('./audio-import', () => ({
  inspectReviewAudio: io.inspect,
  prepareReviewAudio: io.prepare,
}));
import { createReviewMusicAttachment } from './music-library';
afterEach(() => vi.resetAllMocks());
function fixture() {
  const binding = {
    assetId: 'project-asset:existing',
    publish: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
  };
  io.read.mockResolvedValue({
    entry: { id: 'existing' },
    file: new Blob(['audio']),
    filename: 'Song',
  });
  io.bind.mockResolvedValue(binding);
  io.inspect.mockResolvedValue(3);
  const args = {
    selection: { kind: 'library' as const, id: 'library' },
    aggregateId: 'review',
    clipId: 'new-clip',
    signal: new AbortController().signal,
    assertCurrentTarget: vi.fn(),
    attach: vi.fn(async () => undefined),
    hasDurableReference: vi.fn(async () => false),
  };
  return { args, binding, operation: createReviewMusicAttachment(args) };
}
it('reuses a Library source and serializes repeated Add without importing another file', async () => {
  const { args, binding, operation } = fixture();
  const first = operation.run();
  expect(operation.run()).toBe(first);
  await first;
  await operation.run();
  expect(args.attach).toHaveBeenCalledOnce();
  expect(args.attach).toHaveBeenCalledWith('project-asset:existing', 3, 'Song');
  expect(binding.publish).toHaveBeenCalledOnce();
  expect(io.prepare).not.toHaveBeenCalled();
  expect(io.bind).toHaveBeenCalledWith(
    expect.anything(),
    { aggregateId: 'review', clipId: 'new-clip' },
    'existing'
  );
});
it('retries publication without reattaching or reading and decoding again', async () => {
  const { args, binding, operation } = fixture();
  binding.publish.mockRejectedValueOnce(new Error('storage'));
  await expect(operation.run()).rejects.toThrow('storage');
  await operation.run();
  expect(args.attach).toHaveBeenCalledOnce();
  expect(io.read).toHaveBeenCalledOnce();
  expect(io.inspect).toHaveBeenCalledOnce();
  expect(binding.publish).toHaveBeenCalledTimes(2);
  expect(binding.cancel).not.toHaveBeenCalled();
});
it('preserves an adopted source when commit throws after durable attachment', async () => {
  const { args, binding, operation } = fixture();
  args.attach.mockRejectedValueOnce(new Error('uncertain'));
  args.hasDurableReference.mockResolvedValue(true);
  await expect(operation.run()).rejects.toThrow('uncertain');
  await operation.run();
  expect(args.attach).toHaveBeenCalledOnce();
  expect(binding.cancel).not.toHaveBeenCalled();
  expect(binding.publish).toHaveBeenCalledOnce();
});
it('does not assume adoption when the durability read also fails', async () => {
  const { args, binding, operation } = fixture();
  args.attach.mockRejectedValueOnce(new Error('write'));
  args.hasDurableReference.mockRejectedValueOnce(new Error('read'));
  await expect(operation.run()).rejects.toThrow('write');
  expect(binding.cancel).not.toHaveBeenCalled();
  expect(binding.publish).not.toHaveBeenCalled();
  await operation.run();
  expect(args.attach).toHaveBeenCalledTimes(2);
  expect(io.bind).toHaveBeenCalledOnce();
});
it('cancels an unadopted claim and refuses corrupt bytes before binding', async () => {
  const { args, binding, operation } = fixture();
  args.attach.mockRejectedValueOnce(new Error('quota'));
  await expect(operation.run()).rejects.toThrow('quota');
  expect(binding.cancel).toHaveBeenCalledOnce();
  io.inspect.mockRejectedValueOnce(new Error('decode'));
  await expect(operation.run()).rejects.toThrow('decode');
  expect(io.bind).toHaveBeenCalledOnce();
});

it('uses the staged file import once and resumes publication without another Library item', async () => {
  const { args } = fixture();
  const staged = {
    assetId: 'project-asset:uploaded',
    duration: 8,
    protect: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
    discard: vi.fn(async () => undefined),
    publish: vi.fn(async () => undefined),
  };
  staged.publish.mockRejectedValueOnce(new Error('publication'));
  io.prepare.mockResolvedValue(staged);
  const file = new File(['audio'], 'upload.webm', { type: 'audio/webm' });
  const operation = createReviewMusicAttachment({ ...args, selection: { kind: 'file', file } });
  await expect(operation.run()).rejects.toThrow('publication');
  await operation.run();
  expect(io.prepare).toHaveBeenCalledOnce();
  expect(io.prepare).toHaveBeenCalledWith(file, args.signal, {
    aggregateId: 'review',
    clipId: 'new-clip',
  });
  expect(args.attach).toHaveBeenCalledOnce();
  expect(staged.protect).toHaveBeenCalledOnce();
  expect(staged.publish).toHaveBeenCalledTimes(2);
  expect(io.bind).not.toHaveBeenCalled();
});
it('rejects a changed project after decoding before claiming Library bytes', async () => {
  const { args, operation } = fixture();
  io.inspect.mockImplementationOnce(async () => {
    args.assertCurrentTarget.mockImplementation(() => {
      throw new Error('changed');
    });
    return 3;
  });
  await expect(operation.run()).rejects.toThrow('changed');
  expect(io.bind).not.toHaveBeenCalled();
  expect(args.attach).not.toHaveBeenCalled();
});
it('cancels a claimed but unadopted source when closing before commit', async () => {
  const { args, binding } = fixture();
  const controller = new AbortController();
  io.bind.mockImplementationOnce(async () => {
    controller.abort();
    return binding;
  });
  const operation = createReviewMusicAttachment({ ...args, signal: controller.signal });
  await expect(operation.run()).rejects.toMatchObject({ name: 'AbortError' });
  expect(args.attach).not.toHaveBeenCalled();
  expect(binding.cancel).toHaveBeenCalledOnce();
  expect(binding.publish).not.toHaveBeenCalled();
});

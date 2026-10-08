import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const io = vi.hoisted(() => ({
  entry: vi.fn(),
  blob: vi.fn(),
  presentation: vi.fn(),
  prepare: vi.fn(),
  publish: vi.fn(),
  cancel: vi.fn(),
  asset: vi.fn(),
  event: vi.fn(),
}));
vi.mock('../persistence/media-library', () => ({
  getMediaLibraryEntry: io.entry,
  getMediaAssetBlob: io.blob,
}));
vi.mock('../persistence/aggregate-presentations', () => ({
  getAggregatePresentation: io.presentation,
}));
vi.mock('../../workflows/background-images/intake', () => ({ prepareBackgroundImage: io.prepare }));
vi.mock('../persistence/projects', () => ({ prepareProjectAsset: io.asset }));
vi.mock('../../features/media-hub/events', () => ({ publishMediaHubLibraryChanged: io.event }));
import {
  readLibraryBackground,
  readBundledBackground,
  retainBackgroundInLibrary,
} from './acquisition';
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.resetAllMocks();
  io.entry.mockResolvedValue({
    id: 'image',
    filename: 'bg.png',
    kind: 'image',
    workspaceRevision: 2,
  });
  io.prepare.mockImplementation(async (file) => file);
});
it('uses the current edited presentation and preserves the selected Library identity', async () => {
  io.presentation.mockResolvedValue({
    presentationRevision: 2,
    previewBlob: new Blob(['edited'], { type: 'image/png' }),
  });
  const result = await readLibraryBackground('image');
  expect(await result.file.text()).toBe('edited');
  expect(result.originMediaId).toBe('image');
  expect(io.blob).not.toHaveBeenCalled();
});
it('refuses stale presentations and selection that becomes trashed, rather than reverting to original', async () => {
  io.presentation.mockResolvedValue({ presentationRevision: 1, previewBlob: new Blob(['old']) });
  await expect(readLibraryBackground('image')).rejects.toThrow();
  expect(io.blob).not.toHaveBeenCalled();
  io.entry.mockResolvedValue({ id: 'image', kind: 'image', lifecycle: { trashedAt: 1 } });
  await expect(readLibraryBackground('image')).rejects.toThrow();
  expect(io.prepare).not.toHaveBeenCalled();
});

it('uses original bytes only for an unedited Library image and respects cancellation', async () => {
  io.entry.mockResolvedValue({ id: 'image', kind: 'image', filename: 'bg.png' });
  io.presentation.mockResolvedValue(undefined);
  io.blob.mockResolvedValue(new Blob(['original'], { type: 'image/png' }));
  expect(await (await readLibraryBackground('image')).file.text()).toBe('original');
  const controller = new AbortController();
  controller.abort();
  await expect(readLibraryBackground('image', controller.signal)).rejects.toThrow();
  io.entry.mockResolvedValue(undefined);
  await expect(readLibraryBackground('image')).rejects.toThrow();
});

it('loads only known bundled paths and rejects failed asset responses', async () => {
  vi.stubGlobal('window', { location: { origin: 'https://extension.test' } });
  const fetch = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['image']) });
  vi.stubGlobal('fetch', fetch);
  expect((await readBundledBackground('builtin:cobalt-silk')).file.type).toBe('image/webp');
  expect((await readBundledBackground('builtin:blue-hour')).file.type).toBe('image/svg+xml');
  await expect(readBundledBackground('unknown')).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(2);
  fetch.mockResolvedValue({ ok: false });
  await expect(readBundledBackground('builtin:blue-hour')).rejects.toThrow();
});
it('publishes an explicit Settings upload once and cancels failed publication', async () => {
  const file = new File(['x'], 'bg.png', { type: 'image/png' });
  io.asset.mockResolvedValue({ id: 'new', publish: io.publish, cancel: io.cancel });
  expect(await retainBackgroundInLibrary({ file, originMediaId: 'existing' })).toBe('existing');
  expect(io.asset).not.toHaveBeenCalled();
  expect(await retainBackgroundInLibrary({ file })).toBe('project-asset:new');
  expect(io.event).toHaveBeenCalledWith('create', ['project-asset:new']);
  io.publish.mockRejectedValue(new Error('write failed'));
  await expect(retainBackgroundInLibrary({ file })).rejects.toThrow('write failed');
  expect(io.cancel).toHaveBeenCalledOnce();
});

it('passes the edited Library bytes to an opt-in policy before generic normalization', async () => {
  io.presentation.mockResolvedValue({
    presentationRevision: 2,
    previewBlob: new Blob(['animated-original'], { type: 'image/webp' }),
  });
  const policy = vi.fn(async (file: File) => file);
  const result = await readLibraryBackground('image', undefined, policy);
  expect(await result.file.text()).toBe('animated-original');
  expect(result.originMediaId).toBe('image');
  expect(policy).toHaveBeenCalledOnce();
  expect(io.prepare).not.toHaveBeenCalled();
  policy.mockRejectedValueOnce(new Error('animated'));
  await expect(readLibraryBackground('image', undefined, policy)).rejects.toThrow('animated');
});

it('refuses an edited Library selection changed or cancelled during custom preparation', async () => {
  io.presentation.mockResolvedValue({
    presentationRevision: 2,
    previewBlob: new Blob(['current'], { type: 'image/png' }),
  });
  const policy = vi.fn(async (file: File) => {
    io.entry.mockResolvedValue({ id: 'image', kind: 'image', workspaceRevision: 3 });
    return file;
  });
  await expect(readLibraryBackground('image', undefined, policy)).rejects.toThrow('changed');
  io.entry.mockResolvedValue({
    id: 'image',
    filename: 'image.png',
    kind: 'image',
    workspaceRevision: 2,
  });
  const controller = new AbortController();
  policy.mockImplementationOnce(async (file: File) => {
    controller.abort();
    return file;
  });
  await expect(readLibraryBackground('image', controller.signal, policy)).rejects.toMatchObject({
    name: 'AbortError',
  });
});

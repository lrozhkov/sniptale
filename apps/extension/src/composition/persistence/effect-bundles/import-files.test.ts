import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  parse: vi.fn(),
  save: vi.fn(),
  saveGl: vi.fn(),
  init: vi.fn(),
  permit: { fixture: 'catalogue-permit' },
  lock: vi.fn(),
}));
vi.mock('../../../features/video/project/effect-bundle', async (original) => ({
  ...(await original<typeof import('../../../features/video/project/effect-bundle')>()),
  importAnimationArtifact: mocks.parse,
}));
vi.mock('./index', async (original) => ({
  ...(await original<typeof import('./index')>()),
  saveAnimationArtifact: mocks.save,
}));
vi.mock('./gl-presets', () => ({ saveGlPresetCatalogSource: mocks.saveGl }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: mocks.init,
}));
vi.mock('../infrastructure/mutation-barrier', async (original) => ({
  ...(await original<typeof import('../infrastructure/mutation-barrier')>()),
  runWithPersistenceDomainMutationLock: mocks.lock,
}));
import { importEffectFiles } from './import-files';
beforeEach(() => {
  vi.resetAllMocks();
  mocks.lock.mockImplementation(async (_domain, operation) => operation(mocks.permit));
  mocks.parse.mockResolvedValue({ ok: true, documents: [] });
  mocks.save.mockResolvedValue({ entry: { packId: 'animation.one' }, unavailablePreferences: [] });
  mocks.saveGl.mockResolvedValue({ id: 'gl.one' });
});
it('routes ordinary Lottie and closed GL files to their source-only owners in file order', async () => {
  const source = JSON.stringify({ format: 'sniptale-gl-preset', version: 1 });
  const files = [new File(['{}'], 'animation.json'), new File([source], 'transition.json')];
  expect(await importEffectFiles(files)).toEqual(
    files.map((file) => ({ filename: file.name, status: 'imported' }))
  );
  expect(mocks.parse).toHaveBeenCalledTimes(1);
  expect(mocks.parse.mock.calls[0]?.[0]).toBe(files[0]);
  expect(mocks.save.mock.calls[0]?.[2]).toBe(mocks.permit);
  expect(mocks.saveGl).toHaveBeenCalledWith(source, expect.any(Number), mocks.permit, undefined);
});
it('retains successful imports around animation admission and GL persistence failures', async () => {
  const files = [
    new File(['{}'], 'one.json'),
    new File(['{}'], 'bad.json'),
    new File(['{"format":"sniptale-gl-preset"}'], 'quota.json'),
    new File(['{}'], 'last.json'),
  ];
  mocks.parse
    .mockResolvedValueOnce({ ok: true })
    .mockResolvedValueOnce({ ok: false, primaryCode: 'BUNDLE_JSON_INVALID' })
    .mockResolvedValueOnce({ ok: true });
  mocks.saveGl.mockRejectedValueOnce(new Error('quota'));
  expect(await importEffectFiles(files)).toEqual(
    files.map((file, index) => ({
      filename: file.name,
      status: index === 0 || index === 3 ? 'imported' : 'failed',
    }))
  );
  expect(mocks.save).toHaveBeenCalledTimes(2);
});
it('enters command authority before the first file read and preserves it through publication', async () => {
  const file = new File(['{"format":"sniptale-gl-preset"}'], 'delayed.json');
  vi.spyOn(file, 'arrayBuffer').mockImplementation(async () => {
    expect(mocks.lock).toHaveBeenCalledWith('animation-catalog', expect.any(Function));
    expect(mocks.init).toHaveBeenCalledWith(mocks.permit);
    return new TextEncoder().encode('{"format":"sniptale-gl-preset"}').buffer;
  });
  await importEffectFiles([file]);
  expect(mocks.saveGl.mock.calls[0]?.[2]).toBe(mocks.permit);
});
it('does not publish a GL file cancelled during its read or continue with later files', async () => {
  const controller = new AbortController();
  const first = new File(['{}'], 'cancelled.json');
  vi.spyOn(first, 'arrayBuffer').mockImplementation(async () => {
    controller.abort();
    return new TextEncoder().encode('{"format":"sniptale-gl-preset"}').buffer;
  });
  const files = [first, new File(['{}'], 'later.json')];
  expect(await importEffectFiles(files, controller.signal)).toEqual(
    files.map((file) => ({ filename: file.name, status: 'failed' }))
  );
  expect(mocks.saveGl).not.toHaveBeenCalled();
  expect(mocks.parse).not.toHaveBeenCalled();
  expect(mocks.save).not.toHaveBeenCalled();
});
it('leaves archive decoding to the isolated animation importer and permits a deterministic retry', async () => {
  const file = new File([new Uint8Array([80, 75, 3, 4])], 'animation.lottie');
  mocks.parse
    .mockResolvedValueOnce({ ok: false, primaryCode: 'BUNDLE_JSON_INVALID' })
    .mockResolvedValueOnce({ ok: true });
  expect((await importEffectFiles([file]))[0]?.status).toBe('failed');
  expect((await importEffectFiles([file]))[0]?.status).toBe('imported');
  expect(mocks.saveGl).not.toHaveBeenCalled();
});

it('completes cold database admission before taking the file command write permit', async () => {
  let prepared = false;
  mocks.init.mockImplementation(async (permit) => {
    if (permit !== undefined && !prepared) throw Error('Database admission failed: blocked');
    if (permit === undefined) prepared = true;
  });
  expect(await importEffectFiles([new File(['{}'], 'first.json')])).toEqual([
    { filename: 'first.json', status: 'imported' },
  ]);
  expect(mocks.init.mock.calls[0]).toEqual([]);
  expect(mocks.init.mock.calls[1]).toEqual([mocks.permit]);
});

it('does not open storage or read files for an already cancelled command', async () => {
  const controller = new AbortController();
  controller.abort();
  expect(await importEffectFiles([new File(['{}'], 'cancelled.json')], controller.signal)).toEqual([
    { filename: 'cancelled.json', status: 'failed' },
  ]);
  expect(mocks.init).not.toHaveBeenCalled();
  expect(mocks.lock).not.toHaveBeenCalled();
  expect(mocks.parse).not.toHaveBeenCalled();
});

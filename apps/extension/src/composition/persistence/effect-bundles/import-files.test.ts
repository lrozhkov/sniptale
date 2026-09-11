import { beforeEach, expect, it, vi } from 'vitest';
const { parse, save } = vi.hoisted(() => ({ parse: vi.fn(), save: vi.fn() }));
vi.mock('../../../features/video/project/effect-bundle', async (original) => ({
  ...(await original<typeof import('../../../features/video/project/effect-bundle')>()),
  importEffectArtifact: parse,
}));
vi.mock('./index', async (original) => ({
  ...(await original<typeof import('./index')>()),
  saveEffectArtifact: save,
}));
import { importEffectFiles } from './import-files';
beforeEach(() => vi.clearAllMocks());
it('retains successful imports around parser and persistence failures in file order', async () => {
  const files = ['one.json', 'bad.json', 'quota.json', 'last.json'].map(
    (name) => new File(['{}'], name)
  );
  parse
    .mockResolvedValueOnce({ ok: true, artifact: 'first' })
    .mockResolvedValueOnce({ ok: false })
    .mockResolvedValueOnce({ ok: true, artifact: 'quota' })
    .mockResolvedValueOnce({ ok: true, artifact: 'last' });
  save
    .mockResolvedValueOnce({})
    .mockRejectedValueOnce(new Error('quota'))
    .mockResolvedValueOnce({});
  expect(await importEffectFiles(files)).toEqual(
    files.map((file, index) => ({
      filename: file.name,
      status: index === 0 || index === 3 ? 'imported' : 'failed',
    }))
  );
  expect(save.mock.calls.map((call) => call[0])).toEqual(['first', 'quota', 'last']);
});
it('allows deterministic replacement of repeated IDs instead of concurrent writes', async () => {
  parse.mockResolvedValue({ ok: true, artifact: 'same' });
  save.mockResolvedValue({});
  expect(
    await importEffectFiles([new File(['{}'], 'first.json'), new File(['{}'], 'second.json')])
  ).toHaveLength(2);
  expect(save).toHaveBeenCalledTimes(2);
});

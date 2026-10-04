import { beforeEach, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { createPagePackageManifestFixture } from '../../features/web-snapshot/manifest.test-support';
import { hashWebSnapshotAssetBytes } from '../../features/web-snapshot/asset-manifest';
import { createPagePackageHtmlDownload } from './html';

const { serialize } = vi.hoisted(() => ({ serialize: vi.fn() }));
vi.mock('../../features/web-snapshot/html-export', () => ({
  createWebSnapshotHtmlExport: serialize,
}));

beforeEach(() => {
  serialize.mockReset().mockResolvedValue({
    blob: new Blob(['standalone'], { type: 'text/html' }),
    filename: 'page.html',
  });
});

async function archive(
  options: { assets?: boolean; corrupt?: boolean; extra?: boolean; intent?: 'save' | 'export' } = {}
) {
  const html = '<html><body>Captured</body></html>';
  const bytes = new TextEncoder().encode(html);
  const files = [
    { path: 'snapshot/index.html', mimeType: 'text/html', bytes },
    {
      path: 'page-screenshot.png',
      mimeType: 'image/png',
      bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    },
    {
      path: 'thumbnail.webp',
      mimeType: 'image/webp',
      bytes: new TextEncoder().encode('RIFF0000WEBP'),
    },
  ];
  if (options.assets)
    files.push({
      path: 'assets/site.css',
      mimeType: 'text/css',
      bytes: new TextEncoder().encode('body{color:red}'),
    });
  const entries = await Promise.all(
    files.map(async (file) => ({
      path: file.path,
      mimeType: file.mimeType,
      component: 'webCopy' as const,
      size: file.bytes.length,
      sha256: options.corrupt ? '0'.repeat(64) : await hashWebSnapshotAssetBytes(file.bytes),
    }))
  );
  const manifest = createPagePackageManifestFixture({
    intent: options.intent ?? 'export',
    diagnosticsLevel: 'none',
    entries,
  });
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(manifest));
  for (const file of files) zip.file(file.path, file.bytes, { createFolders: false });
  if (options.extra) zip.file('unlisted.txt', 'unexpected');
  const buffer = await zip.generateAsync({ type: 'arraybuffer' });
  return new File([buffer], 'page.zip', { type: 'application/zip' });
}

it('passes verified web-copy content to the shared standalone serializer', async () => {
  const result = await createPagePackageHtmlDownload(await archive());
  expect(await result.text()).toBe('standalone');
  expect(serialize).toHaveBeenCalledWith(
    expect.objectContaining({
      html: '<html><body>Captured</body></html>',
      assetBasePath: 'snapshot/index.html',
      assets: [],
    })
  );
});

it.each([{ corrupt: true }, { extra: true }, { intent: 'save' as const }])(
  'rejects invalid archives before HTML publication: %j',
  async (options) => {
    await expect(createPagePackageHtmlDownload(await archive(options))).rejects.toThrow();
    expect(serialize).not.toHaveBeenCalled();
  }
);

it.each([false, true])(
  'releases embedded asset URLs after conversion, including failure=%s',
  async (fail) => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    if (fail) serialize.mockRejectedValueOnce(new Error('cannot serialize'));
    const result = createPagePackageHtmlDownload(await archive({ assets: true }));
    if (fail) await expect(result).rejects.toThrow('cannot serialize');
    else await result;
    const input = serialize.mock.calls.at(-1)?.[0];
    expect(input.assets).toEqual([
      expect.objectContaining({
        path: 'assets/site.css',
        mimeType: 'text/css',
        url: expect.stringMatching(/^blob:/u),
      }),
    ]);
    expect(revoke).toHaveBeenCalledWith(input.assets[0].url);
    revoke.mockRestore();
  }
);

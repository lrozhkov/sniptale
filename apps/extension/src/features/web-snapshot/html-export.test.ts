// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { createPagePackageManifestFixture } from './manifest.test-support';
import type { WebSnapshotHtmlExportInput } from './html-export';
import { createWebSnapshotHtmlExport } from './html-export';

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('Invalid blob'));
    reader.onerror = reject;
    reader.readAsText(blob);
  });
}

function fixture(html: string, files: Array<{ path: string; type: string; text: string }> = []) {
  const extractPackageFile = vi.fn(async (path: string) => {
    const file = files.find((entry) => entry.path === path);
    if (!file) throw new Error('Missing resource');
    const blob = new Blob([file.text], { type: file.type });
    Object.defineProperty(blob, 'text', { value: () => readBlob(blob) });
    return blob;
  });
  const loaded: WebSnapshotHtmlExportInput = {
    assets: files.map((file) => ({
      path: file.path,
      mimeType: file.type,
      size: file.text.length,
      url: `blob:${file.path}`,
      downloadUrl: null,
    })),
    html,
    manifest: createPagePackageManifestFixture({
      source: { title: 'Пример / page', url: 'https://example.com/page', faviconUrl: null },
    }),
    extractPackageFile,
  };
  return loaded;
}

function decodeData(url: string): string {
  return atob(url.slice(url.indexOf(',') + 1).split('#')[0] ?? '');
}

it('embeds saved CSS imports, fonts, images, SVG fragments and shadow content without blob dependencies', async () => {
  const loaded = fixture(
    `<html>
      <head>
      <link rel="stylesheet" href="blob:assets/main.css">
      </head>
      <body>
      <h1>Пример</h1>
      <img src="blob:assets/photo.png" srcset="blob:assets/photo.png 2x">
      <div style="background:url(blob:assets/photo.png)">
      </div>
      <x-card>
      <template shadowrootmode="open">
      <img src="blob:assets/icon.svg#mark">
      </template>
      </x-card>
      </body>
      </html>`,
    [
      {
        path: 'assets/main.css',
        type: 'text/css',
        text: '@import "nested.css"; body{background:url(photo.png)}',
      },
      {
        path: 'assets/nested.css',
        type: 'text/css',
        text: '@font-face{font-family:Saved;src:url(font.woff2)} h1{color:red}',
      },
      { path: 'assets/font.woff2', type: 'font/woff2', text: 'font-bytes' },
      { path: 'assets/photo.png', type: 'image/png', text: 'image-bytes' },
      {
        path: 'assets/icon.svg',
        type: 'image/svg+xml',
        text: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><path id="mark" d="M0 0"/></svg>',
      },
    ]
  );
  const result = await createWebSnapshotHtmlExport(loaded);
  const html = await readBlob(result.blob);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  expect(result.filename).toBe('Пример_page.html');
  expect(result.blob.type).toBe('text/html;charset=utf-8');
  expect(html).not.toContain('blob:');
  expect(html).toContain('data:image/png;base64,');
  expect(html).toContain('data:image/svg+xml;base64,');
  expect(doc.querySelector('template')?.getAttribute('shadowrootmode')).toBe('open');
  const css = decodeData(doc.querySelector('link')!.getAttribute('href')!);
  expect(css).toContain('data:image/png;base64,');
  const nested = css.match(/data:text\/css[^"\s)]+/u)?.[0];
  expect(decodeData(nested!)).toContain('data:font/woff2;base64,');
  expect(doc.querySelector('meta[charset]')?.getAttribute('charset')).toBe('utf-8');
  expect(doc.querySelector('meta[name="sniptale-source"]')?.getAttribute('content')).toBe(
    'https://example.com/page'
  );
});

it('retains passive form state while stripping executable and external content', async () => {
  const loaded = fixture(
    `<head>
      <meta http-equiv="refresh" content="0;url=https://bad.test">
      <style>body{background:url(https://bad.test/a)}</style>
      </head>
      <body>
      <script>alert(1)</script>
      <a href="https://bad.test">External</a>
      <a href="#section">Local</a>
      <img src="https://bad.test/a" onerror="alert(1)">
      <form action="https://bad.test">
      <input value="saved">
      <input type="password" value="secret">
      </form>
      <iframe src="https://bad.test">
      </iframe>
      </body>`
  );
  const html = await readBlob((await createWebSnapshotHtmlExport(loaded)).blob);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  expect(
    doc.querySelector('script, iframe, [onerror], [action], input[value="secret"]')
  ).toBeNull();
  expect(doc.querySelector('a')?.getAttribute('href')).toBe('https://bad.test/');
  expect(doc.querySelector('a')?.getAttribute('target')).toBe('_blank');
  expect(doc.querySelector('a')?.getAttribute('rel')).toContain('noopener');
  expect(doc.querySelector('a[href="#section"]')).not.toBeNull();
  expect(doc.querySelector('input')?.getAttribute('value')).toBe('saved');
  expect(doc.querySelector('img')?.hasAttribute('src')).toBe(false);
  expect(doc.querySelector('meta[http-equiv]')?.getAttribute('content')).toContain(
    "default-src 'none'"
  );
});

it('restores validated captured and relative links without allowing active URLs', async () => {
  const loaded = fixture(`<body>
    <base target="_blank" href="https://other.test/">
    <a href="../article">Relative</a>
    <a data-sniptale-external-href="https://saved.test/story">Captured</a>
    <a href="javascript:alert(1)">Script</a>
    <a href="data:text/html,evil">Data</a>
    <a href="#part" download target="_blank">Part</a>
    <div id="part">Destination</div>
  </body>`);
  const html = await readBlob((await createWebSnapshotHtmlExport(loaded)).blob);
  const anchors = [...new DOMParser().parseFromString(html, 'text/html').querySelectorAll('a')];
  expect(anchors[0]?.getAttribute('href')).toBe('https://example.com/article');
  expect(anchors[1]?.getAttribute('href')).toBe('https://saved.test/story');
  expect(anchors[2]?.hasAttribute('href')).toBe(false);
  expect(anchors[3]?.hasAttribute('href')).toBe(false);
  expect(anchors[4]?.getAttribute('href')).toBe('#part');
  expect(anchors[4]?.hasAttribute('download')).toBe(false);
  expect(anchors[4]?.hasAttribute('target')).toBe(false);
  expect(new DOMParser().parseFromString(html, 'text/html').querySelector('base')).toBeNull();
  expect(anchors.slice(0, 2).every((anchor) => anchor.getAttribute('target') === '_blank')).toBe(
    true
  );
  expect(
    anchors.slice(0, 2).every((anchor) => anchor.getAttribute('rel')?.includes('noreferrer'))
  ).toBe(true);
});

it('breaks cyclic CSS imports and removes remote imports', async () => {
  const loaded = fixture('<link rel="stylesheet" href="blob:assets/a.css">', [
    { path: 'assets/a.css', type: 'text/css', text: '@import "b.css"; p{color:red}' },
    {
      path: 'assets/b.css',
      type: 'text/css',
      text: '@import "a.css"; @import "https://bad.test/x"; b{color:blue}',
    },
  ]);
  const html = await readBlob((await createWebSnapshotHtmlExport(loaded)).blob);
  expect(html).not.toContain('blob:');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const css = decodeData(doc.querySelector('link')!.getAttribute('href')!);
  const nested = decodeData(css.match(/data:text\/css[^"\s)]+/u)![0]);
  expect(nested).toContain('color:blue');
  expect(nested).not.toContain('@import');
});

it('propagates failed verified extraction instead of returning a partial artifact', async () => {
  const loaded = fixture('<img src="blob:assets/a.png">', [
    { path: 'assets/a.png', type: 'image/png', text: 'image' },
  ]);
  loaded.extractPackageFile = vi.fn().mockRejectedValue(new Error('Digest mismatch'));
  await expect(createWebSnapshotHtmlExport(loaded)).rejects.toThrow('Digest mismatch');
});

it('exports XHTML captures as ordinary HTML with their text and styles', async () => {
  const loaded = fixture(
    '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><style><![CDATA[p { color: red; }]]></style></head><body><p>Saved &amp; readable</p></body></html>'
  );
  const html = await readBlob((await createWebSnapshotHtmlExport(loaded)).blob);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  expect(doc.querySelector('p')?.textContent).toBe('Saved & readable');
  expect(doc.querySelector('style')?.textContent).toBe('p { color: red; }');
  expect(html).not.toContain('<?xml');
});

it('rejects excessive stylesheet nesting before producing a download', async () => {
  const files = Array.from({ length: 34 }, (_, index) => ({
    path: `assets/${index}.css`,
    type: 'text/css',
    text: `@import "${index + 1}.css";`,
  }));
  const loaded = fixture('<link rel="stylesheet" href="blob:assets/0.css">', files);
  await expect(createWebSnapshotHtmlExport(loaded)).rejects.toThrow('nesting is too deep');
});

it.each([false, true])(
  'removes SVG navigation mutations from inline and shadow SVG (XHTML: %s)',
  async (xhtml) => {
    const svg =
      '<svg><a><set attributeName="href" to="https://bad.test/" />' +
      '<animate attributeName="href" values="https://bad.test/" />' +
      '<text x="0" y="20">Open</text></a></svg>';
    const body = `${svg}<x-card><template shadowrootmode="open">${svg}</template></x-card>`;
    const loaded = fixture(
      xhtml
        ? `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head/><body>${body}</body></html>`
        : body
    );

    const html = await readBlob((await createWebSnapshotHtmlExport(loaded)).blob);
    expect(html).not.toContain('<set');
    expect(html).not.toContain('<animate');
    expect(html).toContain('Open');
    expect(html).not.toContain('https://bad.test');
  }
);

it('embeds captured relative resources in raw archive HTML and removes active content', async () => {
  const loaded = fixture(
    '<!doctype html><html><head><link rel="stylesheet" href="../assets/main.css"></head><body><img src="../assets/image.png"><script>alert(1)</script><iframe src="https://example.com"></iframe></body></html>',
    [
      { path: 'assets/main.css', type: 'text/css', text: 'body{color:red}' },
      { path: 'assets/image.png', type: 'image/png', text: 'image' },
    ]
  );
  const result = await createWebSnapshotHtmlExport({
    ...loaded,
    assetBasePath: 'snapshot/index.html',
  });
  const html = await readBlob(result.blob);
  expect(html).toContain('data:text/css');
  expect(html).toContain('data:image/png');
  expect(html).not.toContain('<script');
  expect(html).not.toContain('<iframe');
  expect(html).not.toContain('../assets/');
  expect(html).not.toContain('blob:');
});

it('keeps safe links in raw archives and XHTML captures', async () => {
  for (const source of [
    '<html><body><a href="../article">Story</a></body></html>',
    '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><a href="../article">Story</a></body></html>',
  ]) {
    const loaded = fixture(source);
    const result = await createWebSnapshotHtmlExport({
      ...loaded,
      assetBasePath: 'snapshot/index.html',
    });
    const doc = new DOMParser().parseFromString(await readBlob(result.blob), 'text/html');
    expect(doc.querySelector('a')?.getAttribute('href')).toBe('https://example.com/article');
  }
});

it.each(['html', 'xhtml'] as const)(
  'preserves inline CSS text through raw %s archive normalization',
  async (format) => {
    const opening =
      format === 'xhtml'
        ? '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml">'
        : '<html>';
    const css =
      format === 'xhtml'
        ? 'body &gt; p { color: rgb(1,2,3); } p::before { content: "&amp;"; }'
        : 'body > p { color: rgb(1,2,3); } p::before { content: "&"; }';
    const source = `${opening}<head><style>${css}</style></head><body><p>Text</p></body></html>`;
    const result = await createWebSnapshotHtmlExport({
      ...fixture(source),
      assetBasePath: 'snapshot/index.html',
    });
    const html = await readBlob(result.blob);
    const document = new DOMParser().parseFromString(html, 'text/html');
    expect(document.querySelector('style')?.textContent).toContain('body > p');
    expect(document.querySelector('style')?.textContent).toContain('content: "&"');
  }
);

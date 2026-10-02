// @vitest-environment jsdom
import { Blob as NodeBlob } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { admitSavedScenarioHtml } from './preview-document';
import { SCENARIO_PREVIEW_MAX_BYTES } from './preview-contract';
beforeEach(() => {
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal('crypto', webcrypto);
});
afterEach(() => vi.unstubAllGlobals());

async function fixture(mode: 'guide' | 'tour') {
  const script = "globalThis.document.body.dataset.ready = 'true';";
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(script));
  const hash = btoa(String.fromCharCode(...new Uint8Array(digest)));
  const policy =
    mode === 'guide'
      ? `default-src 'none'; script-src 'sha256-${hash}'; img-src data:; font-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'`
      : `default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'; img-src data:; media-src data:; base-uri 'none'; form-action 'none'`;
  const data = mode === 'tour' ? '<script type="application/json" id="tour-data">{}</script>' : '';
  const html = [
    '<!doctype html><html><head>',
    `<meta http-equiv="Content-Security-Policy" content="${policy}">`,
    '</head><body><h1>Saved</h1>',
    data,
    `<script>${script}</script>`,
    '</body></html>',
  ].join('');
  return { hash, html, blob: new Blob([html], { type: 'text/html' }) };
}

it.each(['guide', 'tour'] as const)(
  'admits the exact saved %s Blob with only the extension-supplied fixed executable',
  async (mode) => {
    const f = await fixture(mode);
    expect(await admitSavedScenarioHtml(f.blob, mode, f.hash)).toBe(true);
    expect(await f.blob.text()).toBe(f.html);
    expect(document.body.dataset['ready']).toBeUndefined();
  }
);

it.each([
  '<script>globalThis.alert(1)</script>',
  '<img onerror="alert(1)" src="data:x">',
  '<iframe srcdoc="evil"></iframe>',
  '<base href="https://evil.test">',
  '<meta http-equiv="refresh" content="0;url=https://evil.test">',
  '<a href="java&#10;script:alert(1)">Open</a>',
])('rejects additional active content %s before mounting a file', async (extra) => {
  const f = await fixture('guide');
  expect(
    await admitSavedScenarioHtml(
      new Blob([f.html.replace('</body>', extra + '</body>')]),
      'guide',
      f.hash
    )
  ).toBe(false);
});

it('rejects changed executable bytes, archive-selected hashes and weakened CSP', async () => {
  const f = await fixture('guide');
  for (const html of [
    f.html.replace('dataset.ready', 'dataset.stolen'),
    f.html.replace("default-src 'none'", 'default-src *'),
  ])
    expect(await admitSavedScenarioHtml(new Blob([html]), 'guide', f.hash)).toBe(false);
  expect(await admitSavedScenarioHtml(f.blob, 'guide', 'A'.repeat(43) + '=')).toBe(false);
  const large = new Blob(['x']);
  Object.defineProperty(large, 'size', { value: SCENARIO_PREVIEW_MAX_BYTES + 1 });
  expect(await admitSavedScenarioHtml(large, 'guide', f.hash)).toBe(false);
});

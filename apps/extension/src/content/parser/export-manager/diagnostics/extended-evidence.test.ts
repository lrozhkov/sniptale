// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTENT_ROOT_ID } from '@sniptale/ui/branding';
import {
  buildExtendedDiagnosticArtifacts,
  MAX_EXTENDED_DIAGNOSTIC_METADATA_INPUT_BYTES,
} from './extended-evidence';
import { MAX_EXTENDED_DIAGNOSTIC_ELEMENTS } from './extended-evidence.dom';

const digestText = async (value: string) => (value.length % 2 === 0 ? 'a' : 'b').repeat(64);

function resetDocument(): void {
  document.documentElement.innerHTML = `
    <head>
      <title>Architecture diagnostics</title>
      <style>.secret { background: url("https://cdn.test/a.png?view=full&token=style-secret#x") }</style>
      <link rel="stylesheet" href="https://cdn.test/site.css?theme=dark&key=style-key#x">
      <script src="https://cdn.test/app.js?mode=debug&token=script-secret#x"></script>
      <script>window.inlineSecret = "never-export-this-script-body";</script>
    </head>
    <body>
      <main id="diagnostic-main" class="layout two-column">
        <a href="https://user:pass@example.test/page?view=grid&token=url-secret#section"
           onclick="sendSecret('handler-secret')">Architecture content</a>
        <div style="width: 320px; background: url('https://cdn.test/bg.png?size=2&sig=css-secret#x')">Visible text</div>
        <input type="password" value="password-secret" checked>
        <input type="file" value="C:\\private\\secret.txt">
        <textarea>typed-private-value</textarea>
        <select><option value="private-option" selected>Selected private answer</option></select>
        <iframe src="https://frame.test/view?layout=wide&auth=frame-secret#x"
                srcdoc="<script>frame-secret</script>"></iframe>
        <object data="https://object.test/private.bin?token=object-secret"></object>
      </main>
      <div id="${CONTENT_ROOT_ID}">extension-owned-secret</div>
    </body>
  `;
}

beforeEach(resetDocument);

describe('extended diagnostic evidence', () => {
  it('keeps useful live structure while excluding executable and form-control content', async () => {
    const artifacts = await buildExtendedDiagnosticArtifacts({
      digestText,
      source: {
        document,
        pageUrl: 'https://example.test/current?view=full&credential=page-secret#fragment',
      },
    });
    expect(artifacts.map(({ path, mimeType }) => ({ path, mimeType }))).toEqual([
      {
        path: 'diagnostics/extended/live-dom.html.txt',
        mimeType: 'text/plain',
      },
      {
        path: 'diagnostics/extended/document-metadata.json',
        mimeType: 'application/json',
      },
      {
        path: 'diagnostics/extended/scripts.json',
        mimeType: 'application/json',
      },
      {
        path: 'diagnostics/extended/stylesheets.json',
        mimeType: 'application/json',
      },
      {
        path: 'diagnostics/extended/frames.json',
        mimeType: 'application/json',
      },
      {
        path: 'diagnostics/extended/transformations.json',
        mimeType: 'application/json',
      },
      {
        path: 'diagnostics/extended/redactions.json',
        mimeType: 'application/json',
      },
    ]);

    const html = artifacts[0]!.content;
    expect(html).toContain('Architecture content');
    expect(html).toContain('class="layout two-column"');
    expect(html).toContain('id="diagnostic-main"');
    expect(html).toContain('view=grid');
    expect(html).toMatch(/token=(?:redacted|\*{3})/);
    expect(html).not.toContain('user:pass');
    expect(html).not.toContain('#section');
    expect(html).not.toContain('password-secret');
    expect(html).not.toContain('secret.txt');
    expect(html).not.toContain('typed-private-value');
    expect(html).not.toContain('Selected private answer');
    expect(html).not.toContain('handler-secret');
    expect(html).not.toContain('never-export-this-script-body');
    expect(html).not.toContain('frame-secret');
    expect(html).not.toContain('extension-owned-secret');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<object');
    expect(html).toContain('data-sniptale-diagnostic-placeholder="script"');
    expect(html).toContain('data-sniptale-diagnostic-onclick="[handler omitted; length=28]"');

    const scripts = artifacts.find((entry) => entry.path.endsWith('/scripts.json'))!.content;
    expect(scripts).toContain('mode=debug');
    expect(scripts).toMatch(/token=(?:redacted|\*{3})/);
    expect(scripts).toContain('bodySha256');
    expect(scripts).not.toContain('never-export-this-script-body');
    const stylesheets = artifacts.find((entry) =>
      entry.path.endsWith('/stylesheets.json')
    )!.content;
    expect(stylesheets).toContain('theme=dark');
    expect(stylesheets).toMatch(/key=(?:redacted|\*{3})/);
    expect(stylesheets).not.toContain('.secret');
    const metadata = artifacts.find((entry) =>
      entry.path.endsWith('/document-metadata.json')
    )!.content;
    expect(metadata).toContain('view=full');
    expect(metadata).toMatch(/credential=(?:redacted|\*{3})/);
    expect(metadata).not.toContain('#fragment');
    const transformations = artifacts.find((entry) =>
      entry.path.endsWith('/transformations.json')
    )!.content;
    expect(transformations).toContain('external-navigation-disabled');
    expect(transformations).toContain('inline-handler-removed');
    expect(transformations).toContain('executable-removed');
    expect(transformations).not.toContain('handler-secret');
    expect(transformations).not.toContain('url-secret');
    const redactions = artifacts.find((entry) => entry.path.endsWith('/redactions.json'))!.content;
    expect(redactions).toContain('form-control-state');
    expect(redactions).toContain('inline-handler');
    expect(redactions).toContain('stylesheet-body');
  });

  it('rejects invalid injected hashes without exporting script content', async () => {
    await expect(
      buildExtendedDiagnosticArtifacts({
        digestText: async () => 'invalid',
        source: { document },
      })
    ).rejects.toThrow('lowercase SHA-256');
  });

  it('rejects one oversized executable body before hashing or cloning it', async () => {
    document.documentElement.innerHTML = `<head><script></script></head><body></body>`;
    document.querySelector('script')!.textContent = 'x'.repeat(32 * 1024 * 1024 + 1);
    const digest = vi.fn(digestText);
    const clone = vi.spyOn(document.documentElement, 'cloneNode');

    await expect(
      buildExtendedDiagnosticArtifacts({ digestText: digest, source: { document } })
    ).rejects.toThrow('DOM exceeds the input byte limit');
    expect(digest).not.toHaveBeenCalled();
    expect(clone).not.toHaveBeenCalled();
  });

  it('rejects one oversized retained metadata scalar before projection', async () => {
    const clone = vi.spyOn(document.documentElement, 'cloneNode');
    await expect(
      buildExtendedDiagnosticArtifacts({
        digestText,
        source: {
          document,
          pageUrl: `https://example.test/${'x'.repeat(
            MAX_EXTENDED_DIAGNOSTIC_METADATA_INPUT_BYTES
          )}`,
        },
      })
    ).rejects.toThrow('metadata exceeds the byte limit');
    expect(clone).not.toHaveBeenCalled();
  });

  it('rejects the hostile element frontier before selector inventory, clone, or digest', async () => {
    const root = document.documentElement;
    let remaining = MAX_EXTENDED_DIAGNOSTIC_ELEMENTS;
    vi.spyOn(document, 'createTreeWalker').mockReturnValue({
      nextNode: () => (remaining-- > 0 ? root : null),
    } as TreeWalker);
    const selectors = vi.spyOn(document, 'querySelectorAll');
    const clone = vi.spyOn(root, 'cloneNode');
    const digest = vi.fn(digestText);

    await expect(
      buildExtendedDiagnosticArtifacts({ digestText: digest, source: { document } })
    ).rejects.toThrow('element limit');
    expect(selectors).not.toHaveBeenCalled();
    expect(clone).not.toHaveBeenCalled();
    expect(digest).not.toHaveBeenCalled();
  });
});

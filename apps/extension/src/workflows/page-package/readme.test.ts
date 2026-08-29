import { expect, it } from 'vitest';
import { addPagePackageReadme } from './readme';

it('adds a root manifest-listed guide derived from the actual package components', async () => {
  const contributions = await addPagePackageReadme({
    contributions: [
      {
        component: 'webCopy',
        mimeType: 'text/html',
        path: 'snapshot/index.html',
        sha256: 'a'.repeat(64),
        size: 13,
        source: new Blob(['safe snapshot'], { type: 'text/html' }),
      },
      {
        component: 'diagnostics',
        mimeType: 'text/plain',
        path: 'diagnostics/extended/page/live-dom.html.txt',
        sha256: 'b'.repeat(64),
        size: 8,
        source: new Blob(['evidence'], { type: 'text/plain' }),
      },
    ],
    diagnosticsLevel: 'extended',
    intent: 'save',
    source: { faviconUrl: null, title: 'Private page', url: 'https://example.test/' },
  });

  expect(contributions[0]).toMatchObject({
    component: 'webCopy',
    mimeType: 'text/markdown',
    path: 'README.md',
  });
  const text = await contributions[0]?.source.text();
  expect(text).toContain('Page Package v1');
  expect(text).toContain('Safe Web copy');
  expect(text).toContain('Inert diagnostics');
  expect(text).toContain('Scripts and inline event handlers are removed');
  expect(text).toContain('cookies, browser storage');
  expect(text).toContain('safe URL query values may remain');
  expect(text).toContain('diagnostics/index.json');
  expect(text).toContain('Diagnostic map');
  expect(text).toContain('not an execution trace');
  expect(text).toContain('no request or response headers');
  expect(text).toContain('without user-entered values');
  expect(text).toContain('Applied limitations');
  expect(text).toContain('application safety ceilings');
  expect(text).toContain('Validate `manifest.json`');
  const diagnosticIndex = contributions.find(({ path }) => path === 'diagnostics/index.json');
  expect(diagnosticIndex).toBeDefined();
  const index = JSON.parse((await diagnosticIndex!.source.text()) || 'null') as unknown;
  expect(index).toMatchObject({
    authority: {
      archiveInventory: 'manifest.json',
      publishedRepresentation: 'snapshot/index.html',
    },
    representations: [
      { available: true, path: 'diagnostics/extended/page/live-dom.html.txt', stage: 'live' },
      { available: false, path: null, stage: 'prepared' },
      { available: true, path: 'snapshot/index.html', stage: 'published' },
    ],
  });
});

it('replaces an earlier root guide when the combined package contents change', async () => {
  const oldReadme = {
    component: 'pageData' as const,
    mimeType: 'text/markdown',
    path: 'README.md',
    sha256: 'a'.repeat(64),
    size: 3,
    source: new Blob(['old'], { type: 'text/markdown' }),
  };
  const contributions = await addPagePackageReadme({
    contributions: [oldReadme],
    diagnosticsLevel: 'none',
    intent: 'export',
    source: { faviconUrl: null, title: null, url: null },
  });

  expect(contributions.filter(({ path }) => path === 'README.md')).toHaveLength(1);
  await expect(contributions[0]?.source.text()).resolves.not.toBe('old');
});

it('does not claim that an extended diagnostic placeholder is a published Web copy', async () => {
  const contributions = await addPagePackageReadme({
    contributions: [
      {
        component: 'diagnostics',
        mimeType: 'text/plain',
        path: 'diagnostics/extended/page/published-dom.html.txt',
        sha256: 'a'.repeat(64),
        size: 24,
        source: new Blob(['Web Copy was not selected'], { type: 'text/plain' }),
      },
    ],
    diagnosticsLevel: 'extended',
    intent: 'export',
    source: { faviconUrl: null, title: null, url: null },
  });

  const diagnosticIndex = contributions.find(({ path }) => path === 'diagnostics/index.json');
  const index = JSON.parse((await diagnosticIndex!.source.text()) || 'null') as {
    authority: { publishedRepresentation: string | null };
    representations: Array<{ available: boolean; path: string | null; stage: string }>;
    safety: { publishedDocumentIsSanitized: boolean };
  };
  expect(index.authority.publishedRepresentation).toBeNull();
  expect(index.representations).toContainEqual({
    available: false,
    path: null,
    stage: 'published',
  });
  expect(index.safety.publishedDocumentIsSanitized).toBe(false);
});

it('omits analysis instructions for package paths that were not selected', async () => {
  const contributions = await addPagePackageReadme({
    contributions: [
      {
        component: 'attachments',
        mimeType: 'text/plain',
        path: 'attachments/note.txt',
        sha256: 'a'.repeat(64),
        size: 4,
        source: new Blob(['note'], { type: 'text/plain' }),
      },
    ],
    diagnosticsLevel: 'none',
    intent: 'export',
    source: { faviconUrl: null, title: null, url: null },
  });

  const text = await contributions[0]!.source.text();
  expect(contributions[0]!.component).toBe('attachments');
  expect(text).not.toContain('snapshot/index.html');
  expect(text).not.toContain('page-screenshot.png');
  expect(text).toContain('attachments');
});

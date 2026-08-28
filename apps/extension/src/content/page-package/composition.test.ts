import { describe, expect, it } from 'vitest';
import { createArchiveArtifact } from '../parser/export-manager/archive';
import { composeCombinedPagePackage, composeExportPagePackage } from './composition';
import { composePagePackage } from '../../workflows/page-package/composer';
import { createSafeWebCopyContributions } from '../../workflows/page-package/contributions/web-copy';
import { createDiagnosticContributions } from '../../workflows/page-package/contributions/diagnostics';
import {
  MAX_PAGE_PACKAGE_URL_BYTES,
  MAX_PAGE_PACKAGE_WARNING_BYTES,
} from '@sniptale/runtime-contracts/page-package';

describe('composeExportPagePackage', () => {
  it('preserves Blob export entries in canonical Page Package components', async () => {
    const pagePackage = await composeExportPagePackage({
      artifact: createArchiveArtifact({
        archiveBaseName: 'page',
        entries: [
          { path: 'page.json', textContent: '{"ok":true}' },
          {
            path: 'files/figure.png',
            binaryContent: new Blob(['image'], { type: 'image/png' }),
            mimeType: 'image/png',
          },
          { path: 'logs/errors.log', textContent: 'warning' },
        ],
        errors: ['warning'],
        stats: { filesCount: 1, filesFailed: 0, rowsCount: 2, sectionsCount: 1 },
      }),
      capturedAt: '2026-08-27T10:00:00.000Z',
      id: 'page-id',
      source: {
        faviconUrl: null,
        title: 'Page',
        url: 'https://page.test/',
        viewport: { deviceScaleFactor: 2, height: 1080, width: 1920 },
      },
    });

    expect(pagePackage.manifest).toMatchObject({
      diagnosticsLevel: 'standard',
      id: 'page-id',
      intent: 'export',
      source: { title: 'Page', url: 'https://page.test/' },
      warnings: ['warning'],
    });
    expect(
      pagePackage.entries.map(({ component, path, source }) => ({
        component,
        path,
        sourceIsBlob: source instanceof Blob,
      }))
    ).toEqual([
      { component: 'pageData', path: 'README.md', sourceIsBlob: true },
      { component: 'pageData', path: 'exports/data/page.json', sourceIsBlob: true },
      { component: 'images', path: 'exports/images/figure.png', sourceIsBlob: true },
      {
        component: 'diagnostics',
        path: 'diagnostics/export/logs/errors.log',
        sourceIsBlob: true,
      },
    ]);
  });

  it('adds the complete inert extended inventory only to an explicitly extended Export', async () => {
    const extendedDiagnosticArtifacts = [
      {
        content: '<html><body>visible evidence</body></html>',
        mimeType: 'text/plain' as const,
        path: 'diagnostics/extended/live-dom.html.txt' as const,
      },
      {
        content: '{}',
        mimeType: 'application/json' as const,
        path: 'diagnostics/extended/document-metadata.json' as const,
      },
      {
        content: '{}',
        mimeType: 'application/json' as const,
        path: 'diagnostics/extended/scripts.json' as const,
      },
      {
        content: '{}',
        mimeType: 'application/json' as const,
        path: 'diagnostics/extended/stylesheets.json' as const,
      },
      {
        content: '{}',
        mimeType: 'application/json' as const,
        path: 'diagnostics/extended/frames.json' as const,
      },
      {
        content: '{}',
        mimeType: 'application/json' as const,
        path: 'diagnostics/extended/transformations.json' as const,
      },
      {
        content: '{}',
        mimeType: 'application/json' as const,
        path: 'diagnostics/extended/redactions.json' as const,
      },
    ];
    const pagePackage = await composeExportPagePackage({
      artifact: createArchiveArtifact({
        archiveBaseName: 'page',
        entries: [{ path: 'logs/errors.log', textContent: 'standard evidence' }],
        errors: [],
        stats: { filesCount: 0, filesFailed: 0, rowsCount: 0, sectionsCount: 0 },
      }),
      diagnosticsLevel: 'extended',
      extendedDiagnosticArtifacts,
      source: { faviconUrl: null, title: 'Page', url: 'https://page.test/', viewport: null },
    });

    expect(pagePackage.manifest.diagnosticsLevel).toBe('extended');
    expect(
      pagePackage.entries
        .filter(({ path }) => path.startsWith('diagnostics/extended/'))
        .map(({ path }) => path)
    ).toEqual(extendedDiagnosticArtifacts.map(({ path }) => path));
  });

  it('does not claim diagnostics when the export artifact has none', async () => {
    const pagePackage = await composeExportPagePackage({
      artifact: createArchiveArtifact({
        archiveBaseName: 'page',
        entries: [{ path: 'page.md', textContent: '# Page' }],
        errors: [],
        stats: { filesCount: 0, filesFailed: 0, rowsCount: 0, sectionsCount: 0 },
      }),
      capturedAt: '2026-08-27T10:00:00.000Z',
      id: 'page-id',
      source: { faviconUrl: null, title: null, url: null, viewport: null },
    });

    expect(pagePackage.manifest.diagnosticsLevel).toBe('none');
    expect(pagePackage.manifest.components.map(({ id }) => id)).toEqual(['pageData']);
  });

  it('retains the mature full-page capture at the canonical Page Package path', async () => {
    const screenshot = new Blob(['screenshot'], { type: 'image/png' });
    const pagePackage = await composeExportPagePackage({
      artifact: createArchiveArtifact({
        archiveBaseName: 'page',
        entries: [
          {
            path: 'page-screenshot.png',
            binaryContent: screenshot,
            mimeType: 'image/png',
          },
        ],
        errors: [],
        stats: { filesCount: 1, filesFailed: 0, rowsCount: 0, sectionsCount: 0 },
      }),
      capturedAt: '2026-08-27T10:00:00.000Z',
      id: 'page-id',
      source: { faviconUrl: null, title: 'Page', url: 'https://page.test/', viewport: null },
    });

    expect(pagePackage.entries).toEqual([
      expect.objectContaining({
        component: 'images',
        path: 'README.md',
      }),
      expect.objectContaining({
        component: 'images',
        path: 'page-screenshot.png',
        source: screenshot,
      }),
    ]);
    expect(pagePackage.manifest.components).toEqual([
      expect.objectContaining({ entryCount: 2, id: 'images', status: 'complete' }),
    ]);
  });

  it('closes retained producer URLs and warnings under the manifest contract', async () => {
    const pagePackage = await composeExportPagePackage({
      artifact: createArchiveArtifact({
        archiveBaseName: 'page',
        entries: [{ path: 'page.md', textContent: '# Page' }],
        errors: ['e\u0301'.repeat(MAX_PAGE_PACKAGE_WARNING_BYTES)],
        stats: { filesCount: 0, filesFailed: 1, rowsCount: 0, sectionsCount: 0 },
      }),
      capturedAt: '2026-08-27T10:00:00.000Z',
      id: 'page-id',
      source: {
        faviconUrl: `https://page.test/${'f'.repeat(MAX_PAGE_PACKAGE_URL_BYTES)}`,
        title: 'Page',
        url: `https://page.test/${'u'.repeat(MAX_PAGE_PACKAGE_URL_BYTES)}`,
        viewport: null,
      },
    });

    expect(pagePackage.manifest.source).toEqual({ faviconUrl: null, title: 'Page', url: null });
    expect(new TextEncoder().encode(pagePackage.manifest.warnings[0] ?? '').byteLength).toBe(
      MAX_PAGE_PACKAGE_WARNING_BYTES
    );
  });
});

describe('composeCombinedPagePackage', () => {
  it('retains the Web-copy root and adds Export Manager contributions without nested archives', async () => {
    const digest = async () => 'a'.repeat(64);
    const webCopy = await composePagePackage(
      {
        capturedAt: '2026-08-27T10:00:00.000Z',
        componentStatuses: { webCopy: 'partial' },
        contributions: await createSafeWebCopyContributions(
          {
            assets: [],
            html: '<!doctype html><title>Page</title>',
            screenshotBlob: new Blob(['screen'], { type: 'image/png' }),
            thumbnailBlob: new Blob(['thumb'], { type: 'image/webp' }),
          },
          digest
        ),
        diagnosticsLevel: 'none',
        failedResourceCount: 1,
        id: 'page-id',
        intent: 'save',
        source: { faviconUrl: null, title: 'Page', url: 'https://page.test/' },
        viewport: { deviceScaleFactor: 1, height: 720, width: 1280 },
        warnings: ['asset unavailable'],
      },
      digest
    );
    const combined = await composeCombinedPagePackage({
      artifact: createArchiveArtifact({
        archiveBaseName: 'page',
        entries: [{ path: 'page.json', textContent: '{"ok":true}' }],
        errors: ['export note'],
        stats: { filesCount: 0, filesFailed: 0, rowsCount: 1, sectionsCount: 1 },
      }),
      intent: 'export',
      webCopy,
    });

    expect(combined.manifest).toMatchObject({
      id: 'page-id',
      intent: 'export',
      source: { title: 'Page', url: 'https://page.test/' },
      warnings: ['asset unavailable', 'export note'],
    });
    expect(combined.entries.map((entry) => entry.path)).toEqual([
      'README.md',
      'snapshot/index.html',
      'page-screenshot.png',
      'thumbnail.webp',
      'exports/data/page.json',
    ]);
    expect(combined.manifest.components).toEqual([
      expect.objectContaining({ id: 'webCopy', status: 'partial' }),
      expect.objectContaining({ id: 'pageData', status: 'complete' }),
    ]);
  });

  it('projects diagnostics out of the mature Web Snapshot result when the admitted plan is none', async () => {
    const digest = async () => 'a'.repeat(64);
    const contributions = [
      ...(await createSafeWebCopyContributions(
        {
          assets: [],
          html: '<!doctype html><title>Page</title>',
          screenshotBlob: new Blob(['screen'], { type: 'image/png' }),
          thumbnailBlob: new Blob(['thumb'], { type: 'image/webp' }),
        },
        digest
      )),
      ...(await createDiagnosticContributions({
        digest,
        intent: 'save',
        level: 'standard',
        standardAssets: [{ content: 'private page evidence', path: 'dom.html' }],
      })),
    ];
    const webCopy = await composePagePackage(
      {
        capturedAt: '2026-08-27T10:00:00.000Z',
        componentStatuses: {},
        contributions,
        diagnosticsLevel: 'standard',
        failedResourceCount: 0,
        id: 'page-none',
        intent: 'save',
        source: { faviconUrl: null, title: 'Page', url: 'https://page.test/' },
        viewport: null,
        warnings: [],
      },
      digest
    );

    const projected = await composeCombinedPagePackage({
      artifact: null,
      diagnosticsLevel: 'none',
      intent: 'save',
      webCopy,
    });

    expect(projected.manifest.diagnosticsLevel).toBe('none');
    expect(projected.manifest.components.map(({ id }) => id)).not.toContain('diagnostics');
    expect(projected.entries.some(({ component }) => component === 'diagnostics')).toBe(false);
  });
});

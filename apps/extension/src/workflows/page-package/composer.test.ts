import { describe, expect, it } from 'vitest';
import { composePagePackage } from './composer';
import type { PagePackageContribution } from './paths';

function webCopyContributions(): PagePackageContribution<string>[] {
  return [
    {
      component: 'webCopy',
      mimeType: 'text/html',
      path: 'snapshot/index.html',
      sha256: 'a'.repeat(64),
      size: 10,
      source: 'html',
    },
    {
      component: 'webCopy',
      mimeType: 'image/png',
      path: 'page-screenshot.png',
      sha256: 'b'.repeat(64),
      size: 20,
      source: 'screenshot',
    },
    {
      component: 'webCopy',
      mimeType: 'image/webp',
      path: 'thumbnail.webp',
      sha256: 'c'.repeat(64),
      size: 5,
      source: 'thumbnail',
    },
  ];
}

describe('Page Package composer', () => {
  it('builds canonical exact bytes without including the manifest in its entry inventory', async () => {
    const result = await composePagePackage(
      {
        capturedAt: '2026-08-27T10:00:00.000Z',
        componentStatuses: { webCopy: 'complete' },
        contributions: webCopyContributions(),
        diagnosticsLevel: 'none',
        failedResourceCount: 0,
        id: 'page-1',
        intent: 'save',
        source: {
          url: 'https://example.test',
          title: 'Example',
          faviconUrl: null,
        },
        viewport: { width: 1920, height: 1080, deviceScaleFactor: 2 },
        warnings: [],
      },
      async () => 'd'.repeat(64)
    );
    expect(result.manifest.entries.map((entry) => entry.path)).not.toContain('manifest.json');
    expect(result.manifest.stats).toEqual({
      entryCount: 3,
      totalBytes: 35,
      failedResourceCount: 0,
      warningCount: 0,
    });
    expect(result.manifestText).toBe(`${JSON.stringify(result.manifest, null, 2)}\n`);
    expect(new TextDecoder().decode(result.manifestBytes)).toBe(result.manifestText);
    expect(result.manifestSha256).toBe('d'.repeat(64));
  });

  it('normalizes titles but rejects missing Web-copy requirements and invalid digest providers', async () => {
    const base = {
      capturedAt: '2026-08-27T10:00:00.000Z',
      componentStatuses: { webCopy: 'complete' as const },
      contributions: webCopyContributions(),
      diagnosticsLevel: 'none' as const,
      failedResourceCount: 0,
      id: 'page-1',
      intent: 'save' as const,
      source: { url: null, title: 'e\u0301', faviconUrl: null },
      viewport: null,
      warnings: [],
    };
    const normalized = await composePagePackage(base, async () => 'a'.repeat(64));
    expect(normalized.manifest.source.title).toBe('é');
    await expect(
      composePagePackage({ ...base, contributions: webCopyContributions().slice(1) }, async () =>
        'a'.repeat(64)
      )
    ).rejects.toThrow('version 1 contract');
    await expect(composePagePackage(base, async () => 'invalid')).rejects.toThrow(
      'invalid SHA-256'
    );
  });

  it('normalizes contribution paths before admission and rejects normalized collisions', async () => {
    const contribution = {
      component: 'pageData' as const,
      mimeType: 'application/json',
      path: 'exports/data/e\u0301.json',
      sha256: 'a'.repeat(64),
      size: 1,
      source: 'first',
    };
    const input = {
      capturedAt: '2026-08-27T10:00:00.000Z',
      componentStatuses: { pageData: 'complete' as const },
      contributions: [contribution],
      diagnosticsLevel: 'none' as const,
      failedResourceCount: 0,
      id: 'page-1',
      intent: 'export' as const,
      source: { url: null, title: null, faviconUrl: null },
      viewport: null,
      warnings: [],
    };
    const normalized = await composePagePackage(input, async () => 'a'.repeat(64));
    expect(normalized.entries[0]?.path).toBe('exports/data/é.json');
    expect(normalized.manifest.entries[0]?.path).toBe('exports/data/é.json');
    await expect(
      composePagePackage(
        {
          ...input,
          contributions: [
            contribution,
            { ...contribution, path: 'exports/data/é.json', source: 'second' },
          ],
        },
        async () => 'a'.repeat(64)
      )
    ).rejects.toThrow('Duplicate Page Package path');
  });
});

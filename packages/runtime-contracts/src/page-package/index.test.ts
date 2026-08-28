import { describe, expect, it } from 'vitest';
import {
  getPagePackageExtendedDiagnosticMimeType,
  isPagePackageEntryPath,
  isPagePackageMimeType,
  isPagePackageWebCopyAssetMimeType,
  PAGE_PACKAGE_EXTENDED_DIAGNOSTIC_ENTRY_PROFILE,
  parsePageCollectionManifest,
  parsePagePackageManifest,
  type PagePackageEntry,
  type PagePackageManifest,
} from '.';

function createManifest(): PagePackageManifest {
  const entries = [
    {
      path: 'snapshot/index.html',
      mimeType: 'text/html',
      size: 10,
      sha256: 'a'.repeat(64),
      component: 'webCopy' as const,
    },
    {
      path: 'page-screenshot.png',
      mimeType: 'image/png',
      size: 20,
      sha256: 'b'.repeat(64),
      component: 'webCopy' as const,
    },
    {
      path: 'thumbnail.webp',
      mimeType: 'image/webp',
      size: 5,
      sha256: 'c'.repeat(64),
      component: 'webCopy' as const,
    },
  ];
  return {
    schemaVersion: 1,
    kind: 'page-package',
    id: 'page-1',
    capturedAt: '2026-08-27T10:00:00.000Z',
    intent: 'save',
    source: { url: 'https://example.test', title: 'Example', faviconUrl: null },
    viewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
    diagnosticsLevel: 'none',
    components: [{ id: 'webCopy', status: 'complete', entryCount: 3, totalBytes: 35 }],
    entries,
    warnings: [],
    stats: {
      entryCount: 3,
      totalBytes: 35,
      failedResourceCount: 0,
      warningCount: 0,
    },
  };
}

function withDiagnostics(
  level: PagePackageManifest['diagnosticsLevel'],
  entries: PagePackageEntry[],
  intent: PagePackageManifest['intent'] = 'export'
): PagePackageManifest {
  const manifest = createManifest();
  const diagnosticBytes = entries.reduce((total, entry) => total + entry.size, 0);
  manifest.intent = intent;
  manifest.diagnosticsLevel = level;
  manifest.entries.push(...entries);
  manifest.components.push({
    id: 'diagnostics',
    status: 'complete',
    entryCount: entries.length,
    totalBytes: diagnosticBytes,
  });
  manifest.stats.entryCount += entries.length;
  manifest.stats.totalBytes += diagnosticBytes;
  return manifest;
}

function createExtendedDiagnosticEntries(): PagePackageEntry[] {
  return PAGE_PACKAGE_EXTENDED_DIAGNOSTIC_ENTRY_PROFILE.map((profile, index) => ({
    ...profile,
    component: 'diagnostics' as const,
    sha256: String(index + 1).repeat(64),
    size: 1,
  }));
}

describe('Page Package contract', () => {
  it('parses one exact internally consistent manifest', () => {
    expect(parsePagePackageManifest(createManifest())).toEqual(createManifest());
  });

  it('rejects extra keys, mismatched inventory, missing required web-copy entries and collisions', () => {
    expect(parsePagePackageManifest({ ...createManifest(), extra: true })).toBeNull();
    const mismatched = createManifest();
    mismatched.stats.totalBytes = 34;
    expect(parsePagePackageManifest(mismatched)).toBeNull();
    const missing = createManifest();
    missing.entries = missing.entries.slice(1);
    missing.components[0] = {
      ...missing.components[0]!,
      entryCount: 2,
      totalBytes: 25,
    };
    missing.stats = { ...missing.stats, entryCount: 2, totalBytes: 25 };
    expect(parsePagePackageManifest(missing)).toBeNull();
    const collision = createManifest();
    collision.entries.push({
      ...collision.entries[0]!,
      path: 'SNAPSHOT/INDEX.HTML',
    });
    collision.components[0] = {
      ...collision.components[0]!,
      entryCount: 4,
      totalBytes: 45,
    };
    collision.stats = { ...collision.stats, entryCount: 4, totalBytes: 45 };
    expect(parsePagePackageManifest(collision)).toBeNull();
  });

  it('enforces diagnostics intent and non-mutating NFC strings', () => {
    const extended = createManifest();
    extended.diagnosticsLevel = 'extended';
    expect(parsePagePackageManifest(extended)).toBeNull();
    const nonNfc = createManifest();
    nonNfc.source.title = 'e\u0301';
    expect(parsePagePackageManifest(nonNfc)).toBeNull();
  });

  it('uses one exact MIME and component path grammar', () => {
    expect(isPagePackageMimeType('application/json')).toBe(true);
    expect(isPagePackageMimeType('text/html; charset=utf-8')).toBe(false);
    expect(isPagePackageEntryPath('images', 'exports/images/photo.png', 'image/png')).toBe(true);
    expect(isPagePackageEntryPath('webCopy', 'exports/images/photo.png', 'image/png')).toBe(false);
    expect(isPagePackageWebCopyAssetMimeType('image/png')).toBe(true);
    expect(isPagePackageEntryPath('webCopy', 'assets/photo.png', 'image/png')).toBe(true);
    expect(isPagePackageEntryPath('webCopy', 'assets/payload.html', 'text/html')).toBe(false);
    expect(isPagePackageEntryPath('webCopy', 'assets/payload.js', 'application/javascript')).toBe(
      false
    );
    expect(
      isPagePackageEntryPath('attachments', 'attachments/archive.ZIP', 'application/zip')
    ).toBe(false);
  });

  it('owns one closed extended diagnostic path and MIME profile', () => {
    expect(getPagePackageExtendedDiagnosticMimeType('diagnostics/extended/live-dom.html.txt')).toBe(
      'text/plain'
    );
    expect(getPagePackageExtendedDiagnosticMimeType('diagnostics/extended/scripts.json')).toBe(
      'application/json'
    );
    expect(
      getPagePackageExtendedDiagnosticMimeType('diagnostics/extended/live-dom.html')
    ).toBeNull();
    expect(getPagePackageExtendedDiagnosticMimeType('diagnostics/extended/script.js')).toBeNull();
  });

  it('binds diagnostic level to inert paths and the complete extended profile', () => {
    expect(
      parsePagePackageManifest(withDiagnostics('extended', createExtendedDiagnosticEntries()))
    ).not.toBeNull();
    expect(
      parsePagePackageManifest(
        withDiagnostics('standard', [
          {
            component: 'diagnostics',
            mimeType: 'application/json',
            path: 'diagnostics/standard/logs/meta.json',
            sha256: 'e'.repeat(64),
            size: 1,
          },
        ])
      )
    ).not.toBeNull();

    const missing = createExtendedDiagnosticEntries().slice(1);
    expect(parsePagePackageManifest(withDiagnostics('extended', missing))).toBeNull();
    const renamed = createExtendedDiagnosticEntries();
    renamed[0] = {
      ...renamed[0]!,
      path: 'diagnostics/extended/live-dom.html',
      mimeType: 'text/html',
    };
    expect(parsePagePackageManifest(withDiagnostics('extended', renamed))).toBeNull();
    expect(
      parsePagePackageManifest(withDiagnostics('standard', createExtendedDiagnosticEntries()))
    ).toBeNull();
    expect(
      parsePagePackageManifest(
        withDiagnostics('standard', [
          {
            component: 'diagnostics',
            mimeType: 'text/plain',
            path: 'diagnostics/standard/payload.html',
            sha256: 'f'.repeat(64),
            size: 1,
          },
        ])
      )
    ).toBeNull();
  });
});

describe('Page Collection contract', () => {
  it('parses exact successful-page totals and rejects inconsistent equations', () => {
    const value = {
      schemaVersion: 1,
      kind: 'page-collection',
      id: 'collection-1',
      createdAt: '2026-08-27T10:00:00.000Z',
      pages: [
        {
          ordinal: 1,
          rootPath: 'pages/001-Example',
          manifestPath: 'pages/001-Example/manifest.json',
          pageId: 'page-1',
          title: 'Example',
          manifestSha256: 'd'.repeat(64),
          manifestSize: 100,
          totalBytes: 135,
        },
      ],
      warnings: [],
      stats: {
        requestedPageCount: 2,
        pageCount: 1,
        totalPageBytes: 135,
        failedPageCount: 1,
        warningCount: 0,
      },
    };
    expect(parsePageCollectionManifest(value)).toEqual(value);
    expect(
      parsePageCollectionManifest({
        ...value,
        stats: { ...value.stats, requestedPageCount: 1 },
      })
    ).toBeNull();
  });
});

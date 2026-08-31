import {
  PAGE_PACKAGE_ARCHIVE_PATHS,
  PAGE_PACKAGE_SCHEMA_VERSION,
  type PagePackageComponent,
  type PagePackageEntry,
  type PagePackageManifest,
} from '@sniptale/runtime-contracts/page-package';

const DEFAULT_HASH = '0'.repeat(64);

function requiredEntries(includeStandardDiagnostics: boolean): PagePackageEntry[] {
  const entries: PagePackageEntry[] = [
    {
      component: 'webCopy',
      mimeType: 'text/html',
      path: PAGE_PACKAGE_ARCHIVE_PATHS.snapshotHtml,
      sha256: DEFAULT_HASH,
      size: 0,
    },
    {
      component: 'webCopy',
      mimeType: 'image/png',
      path: PAGE_PACKAGE_ARCHIVE_PATHS.screenshot,
      sha256: DEFAULT_HASH,
      size: 0,
    },
    {
      component: 'webCopy',
      mimeType: 'image/webp',
      path: PAGE_PACKAGE_ARCHIVE_PATHS.thumbnail,
      sha256: DEFAULT_HASH,
      size: 0,
    },
  ];
  if (includeStandardDiagnostics) {
    entries.push({
      component: 'diagnostics',
      mimeType: 'text/plain',
      path: 'diagnostics/standard/errors.log',
      sha256: DEFAULT_HASH,
      size: 0,
    });
  }
  return entries;
}

function deriveComponents(entries: readonly PagePackageEntry[]): PagePackageComponent[] {
  const components = new Map<PagePackageEntry['component'], PagePackageComponent>();
  for (const entry of entries) {
    const current = components.get(entry.component) ?? {
      entryCount: 0,
      id: entry.component,
      status: 'complete' as const,
      totalBytes: 0,
    };
    current.entryCount += 1;
    current.totalBytes += entry.size;
    if (entry.path === PAGE_PACKAGE_ARCHIVE_PATHS.partialScreenshot) {
      current.status = 'partial';
    }
    components.set(entry.component, current);
  }
  return Array.from(components.values());
}

export function createPagePackageManifestFixture(
  overrides: Partial<PagePackageManifest> = {}
): PagePackageManifest {
  const diagnosticsLevel = overrides.diagnosticsLevel ?? 'standard';
  const entries = overrides.entries
    ? [...overrides.entries]
    : requiredEntries(diagnosticsLevel !== 'none');
  const warnings = overrides.warnings ? [...overrides.warnings] : [];
  return {
    schemaVersion: PAGE_PACKAGE_SCHEMA_VERSION,
    kind: 'page-package',
    id: 'snapshot-1',
    capturedAt: '2026-08-27T00:00:00.000Z',
    intent: 'save',
    source: { faviconUrl: null, title: 'Snapshot', url: 'https://example.test/' },
    viewport: null,
    diagnosticsLevel,
    ...overrides,
    entries,
    components: overrides.components ? [...overrides.components] : deriveComponents(entries),
    warnings,
    stats: overrides.stats ?? {
      entryCount: entries.length,
      failedResourceCount: 0,
      totalBytes: entries.reduce((total, entry) => total + entry.size, 0),
      warningCount: warnings.length,
    },
  };
}

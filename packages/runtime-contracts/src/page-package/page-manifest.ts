import {
  MAX_PAGE_PACKAGE_ENTRIES,
  MAX_PAGE_PACKAGE_ENTRY_BYTES,
  MAX_PAGE_PACKAGE_ID_BYTES,
  MAX_PAGE_PACKAGE_TITLE_BYTES,
  MAX_PAGE_PACKAGE_TOTAL_BYTES,
  MAX_PAGE_PACKAGE_URL_BYTES,
  PAGE_PACKAGE_ARCHIVE_PATHS,
  resolvePagePackageScreenshotEntry,
  PAGE_PACKAGE_COMPONENT_IDS,
  PAGE_PACKAGE_EXTENDED_DIAGNOSTIC_ENTRY_PROFILE,
  PAGE_PACKAGE_SCHEMA_VERSION,
  type PagePackageComponent,
  type PagePackageComponentId,
  type PagePackageDiagnosticsLevel,
  type PagePackageEntry,
  type PagePackageIntent,
  type PagePackageManifest,
  type PagePackageSource,
  type PagePackageStats,
  type PagePackageViewport,
} from './contracts';
import {
  isExtendedDiagnosticPath,
  isPagePackageEntryPath,
  isPagePackageMimeType,
} from './entry-policy';
import {
  addWithinSafeInteger,
  hasExactKeys,
  isBoundedString,
  isCanonicalIsoInstant,
  isNfcBoundedString,
  isNonNegativeSafeInteger,
  isPositiveSafeInteger,
  isRecord,
  isSha256,
  parseWarnings,
} from './parser-primitives';

const REQUIRED_WEB_COPY_PATHS = [
  PAGE_PACKAGE_ARCHIVE_PATHS.snapshotHtml,
  PAGE_PACKAGE_ARCHIVE_PATHS.thumbnail,
] as const;

function isComponentId(value: unknown): value is PagePackageComponentId {
  return (
    typeof value === 'string' &&
    PAGE_PACKAGE_COMPONENT_IDS.includes(value as PagePackageComponentId)
  );
}

function parseSource(value: unknown): PagePackageSource | null {
  if (!isRecord(value) || !hasExactKeys(value, ['url', 'title', 'faviconUrl'])) return null;
  if (
    !(value.url === null || isBoundedString(value.url, MAX_PAGE_PACKAGE_URL_BYTES, true)) ||
    !(
      value.title === null || isNfcBoundedString(value.title, MAX_PAGE_PACKAGE_TITLE_BYTES, true)
    ) ||
    !(
      value.faviconUrl === null ||
      isBoundedString(value.faviconUrl, MAX_PAGE_PACKAGE_URL_BYTES, true)
    )
  ) {
    return null;
  }
  return { url: value.url, title: value.title, faviconUrl: value.faviconUrl };
}

function parseViewport(value: unknown): PagePackageViewport | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !hasExactKeys(value, ['width', 'height', 'deviceScaleFactor'])) {
    return undefined;
  }
  if (
    !isPositiveSafeInteger(value.width) ||
    !isPositiveSafeInteger(value.height) ||
    typeof value.deviceScaleFactor !== 'number' ||
    !Number.isFinite(value.deviceScaleFactor) ||
    value.deviceScaleFactor <= 0
  ) {
    return undefined;
  }
  return {
    width: value.width,
    height: value.height,
    deviceScaleFactor: value.deviceScaleFactor,
  };
}

function parseComponents(value: unknown): PagePackageComponent[] | null {
  if (!Array.isArray(value) || value.length > PAGE_PACKAGE_COMPONENT_IDS.length) return null;
  const result: PagePackageComponent[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (
      !isRecord(item) ||
      !hasExactKeys(item, ['id', 'status', 'entryCount', 'totalBytes']) ||
      !isComponentId(item.id) ||
      (item.status !== 'complete' && item.status !== 'partial') ||
      !isNonNegativeSafeInteger(item.entryCount) ||
      !isNonNegativeSafeInteger(item.totalBytes) ||
      item.totalBytes > MAX_PAGE_PACKAGE_TOTAL_BYTES ||
      seen.has(item.id)
    ) {
      return null;
    }
    seen.add(item.id);
    result.push(item as unknown as PagePackageComponent);
  }
  return result;
}

function parseEntries(value: unknown): PagePackageEntry[] | null {
  if (!Array.isArray(value) || value.length > MAX_PAGE_PACKAGE_ENTRIES) return null;
  const result: PagePackageEntry[] = [];
  const paths = new Set<string>();
  for (const item of value) {
    if (
      !isRecord(item) ||
      !hasExactKeys(item, ['path', 'mimeType', 'size', 'sha256', 'component']) ||
      typeof item.path !== 'string' ||
      !isPagePackageMimeType(item.mimeType) ||
      !isNonNegativeSafeInteger(item.size) ||
      item.size > MAX_PAGE_PACKAGE_ENTRY_BYTES ||
      !isSha256(item.sha256) ||
      !isComponentId(item.component) ||
      !isPagePackageEntryPath(item.component, item.path, item.mimeType)
    ) {
      return null;
    }
    const collisionKey = item.path.toLocaleLowerCase('en-US');
    if (paths.has(collisionKey)) return null;
    paths.add(collisionKey);
    result.push(item as unknown as PagePackageEntry);
  }
  return result;
}

function validatePageInventory(args: {
  components: PagePackageComponent[];
  entries: PagePackageEntry[];
  diagnosticsLevel: PagePackageDiagnosticsLevel;
  intent: PagePackageIntent;
}): boolean {
  const byComponent = new Map<PagePackageComponentId, { count: number; total: number }>();
  let totalBytes = 0;
  for (const entry of args.entries) {
    const current = byComponent.get(entry.component) ?? { count: 0, total: 0 };
    const componentTotal = addWithinSafeInteger(current.total, entry.size);
    const pageTotal = addWithinSafeInteger(totalBytes, entry.size);
    if (componentTotal === null || pageTotal === null || pageTotal > MAX_PAGE_PACKAGE_TOTAL_BYTES) {
      return false;
    }
    current.count += 1;
    current.total = componentTotal;
    byComponent.set(entry.component, current);
    totalBytes = pageTotal;
  }
  const listed = new Set(args.components.map((component) => component.id));
  for (const component of args.components) {
    const actual = byComponent.get(component.id);
    if (
      actual === undefined ||
      actual.count === 0 ||
      actual.count !== component.entryCount ||
      actual.total !== component.totalBytes
    ) {
      return false;
    }
  }
  if ([...byComponent.keys()].some((id) => !listed.has(id))) return false;
  const hasPackageScreenshotPath = args.entries.some(
    (entry) =>
      entry.path === PAGE_PACKAGE_ARCHIVE_PATHS.screenshot ||
      entry.path === PAGE_PACKAGE_ARCHIVE_PATHS.partialScreenshot
  );
  const packageScreenshot = resolvePagePackageScreenshotEntry(args.entries);
  if (hasPackageScreenshotPath && packageScreenshot === null) {
    return false;
  }
  if (packageScreenshot?.coverage === 'viewport') {
    const screenshotEntry = args.entries.find((entry) => entry.path === packageScreenshot.path);
    const screenshotComponent = args.components.find(
      (component) => component.id === screenshotEntry?.component
    );
    if (screenshotComponent?.status !== 'partial') return false;
  }
  const webCopyPaths = new Set(
    args.entries.filter((entry) => entry.component === 'webCopy').map((entry) => entry.path)
  );
  const webCopyScreenshot = resolvePagePackageScreenshotEntry(
    args.entries.filter((entry) => entry.component === 'webCopy')
  );
  if (
    listed.has('webCopy') &&
    (REQUIRED_WEB_COPY_PATHS.some((required) => !webCopyPaths.has(required)) ||
      webCopyScreenshot === null)
  ) {
    return false;
  }
  const hasDiagnostics = listed.has('diagnostics');
  if ((args.diagnosticsLevel === 'none') === hasDiagnostics) return false;
  const extendedEntries = args.entries.filter(
    (entry) => entry.component === 'diagnostics' && isExtendedDiagnosticPath(entry.path)
  );
  if (args.diagnosticsLevel !== 'extended') return extendedEntries.length === 0;
  return (
    extendedEntries.length === PAGE_PACKAGE_EXTENDED_DIAGNOSTIC_ENTRY_PROFILE.length &&
    PAGE_PACKAGE_EXTENDED_DIAGNOSTIC_ENTRY_PROFILE.every((profile) =>
      extendedEntries.some(
        (entry) => entry.path === profile.path && entry.mimeType === profile.mimeType
      )
    )
  );
}

interface PageManifestRoot {
  capturedAt: string;
  components: unknown;
  diagnosticsLevel: PagePackageDiagnosticsLevel;
  entries: unknown;
  id: string;
  intent: PagePackageIntent;
  source: unknown;
  stats: unknown;
  viewport: unknown;
  warnings: unknown;
}

function parsePageManifestRoot(value: unknown): PageManifestRoot | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'schemaVersion',
      'kind',
      'id',
      'capturedAt',
      'intent',
      'source',
      'viewport',
      'diagnosticsLevel',
      'components',
      'entries',
      'warnings',
      'stats',
    ]) ||
    value.schemaVersion !== PAGE_PACKAGE_SCHEMA_VERSION ||
    value.kind !== 'page-package' ||
    !isBoundedString(value.id, MAX_PAGE_PACKAGE_ID_BYTES) ||
    !isCanonicalIsoInstant(value.capturedAt) ||
    (value.intent !== 'save' && value.intent !== 'export') ||
    (value.diagnosticsLevel !== 'none' &&
      value.diagnosticsLevel !== 'standard' &&
      value.diagnosticsLevel !== 'extended')
  ) {
    return null;
  }
  return value as unknown as PageManifestRoot;
}

function parsePageStats(value: unknown): PagePackageStats | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['entryCount', 'totalBytes', 'failedResourceCount', 'warningCount'])
  )
    return null;
  if (
    !isNonNegativeSafeInteger(value.entryCount) ||
    !isNonNegativeSafeInteger(value.totalBytes) ||
    !isNonNegativeSafeInteger(value.failedResourceCount) ||
    !isNonNegativeSafeInteger(value.warningCount)
  ) {
    return null;
  }
  return value as unknown as PagePackageStats;
}

interface ParsedPageManifestParts {
  components: PagePackageComponent[];
  entries: PagePackageEntry[];
  source: PagePackageSource;
  stats: PagePackageStats;
  viewport: PagePackageViewport | null;
  warnings: string[];
}

function parsePageManifestParts(root: PageManifestRoot): ParsedPageManifestParts | null {
  const source = parseSource(root.source);
  const viewport = parseViewport(root.viewport);
  const components = parseComponents(root.components);
  const entries = parseEntries(root.entries);
  const warnings = parseWarnings(root.warnings);
  const stats = parsePageStats(root.stats);
  if (!source || viewport === undefined || !components || !entries || !warnings || !stats) {
    return null;
  }
  return { components, entries, source, stats, viewport, warnings };
}

function hasConsistentPageManifest(
  root: PageManifestRoot,
  parts: ParsedPageManifestParts
): boolean {
  const { components, entries, stats, warnings } = parts;
  const totalBytes = entries.reduce((total, entry) => total + entry.size, 0);
  return !(
    stats.entryCount !== entries.length ||
    stats.totalBytes !== totalBytes ||
    stats.warningCount !== warnings.length ||
    !validatePageInventory({
      components,
      entries,
      diagnosticsLevel: root.diagnosticsLevel,
      intent: root.intent,
    })
  );
}

function createPageManifest(
  root: PageManifestRoot,
  parts: ParsedPageManifestParts
): PagePackageManifest {
  return {
    schemaVersion: PAGE_PACKAGE_SCHEMA_VERSION,
    kind: 'page-package',
    id: root.id,
    capturedAt: root.capturedAt,
    intent: root.intent,
    source: parts.source,
    viewport: parts.viewport,
    diagnosticsLevel: root.diagnosticsLevel,
    components: parts.components,
    entries: parts.entries,
    warnings: parts.warnings,
    stats: {
      entryCount: parts.stats.entryCount,
      totalBytes: parts.stats.totalBytes,
      failedResourceCount: parts.stats.failedResourceCount,
      warningCount: parts.stats.warningCount,
    },
  };
}

export function parsePagePackageManifest(value: unknown): PagePackageManifest | null {
  const root = parsePageManifestRoot(value);
  if (!root) return null;
  const parts = parsePageManifestParts(root);
  return parts && hasConsistentPageManifest(root, parts) ? createPageManifest(root, parts) : null;
}

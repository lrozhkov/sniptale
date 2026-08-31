import {
  MAX_PAGE_PACKAGE_TITLE_BYTES,
  PAGE_PACKAGE_COMPONENT_IDS,
  PAGE_PACKAGE_SCHEMA_VERSION,
  parsePagePackageManifest,
  type PagePackageComponentId,
  type PagePackageComponentStatus,
  type PagePackageDiagnosticsLevel,
  type PagePackageIntent,
  type PagePackageManifest,
  type PagePackageSource,
  type PagePackageViewport,
} from '@sniptale/runtime-contracts/page-package';
import { assertUniquePagePackagePaths, type PagePackageContribution } from './paths';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const UTF8_ENCODER = new TextEncoder();

type PagePackageDigest = (bytes: Uint8Array) => Promise<string>;

interface ComposePagePackageInput<Source> {
  capturedAt: string;
  componentStatuses: Readonly<Partial<Record<PagePackageComponentId, PagePackageComponentStatus>>>;
  contributions: readonly PagePackageContribution<Source>[];
  diagnosticsLevel: PagePackageDiagnosticsLevel;
  failedResourceCount: number;
  id: string;
  intent: PagePackageIntent;
  source: PagePackageSource;
  viewport: PagePackageViewport | null;
  warnings: readonly string[];
}

export interface ComposedPagePackage<Source> {
  entries: readonly PagePackageContribution<Source>[];
  manifest: PagePackageManifest;
  manifestBytes: Uint8Array;
  manifestSha256: string;
  manifestText: string;
}

function normalizeNfc(value: string | null): string | null {
  return value === null ? null : value.normalize('NFC');
}

function assertBoundedNormalizedTitle(value: string | null): void {
  if (value !== null && UTF8_ENCODER.encode(value).byteLength > MAX_PAGE_PACKAGE_TITLE_BYTES) {
    throw new Error('Page Package title exceeds its byte limit.');
  }
}

function serializePagePackageManifest(manifest: PagePackageManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export async function composePagePackage<Source>(
  input: ComposePagePackageInput<Source>,
  digest: PagePackageDigest
): Promise<ComposedPagePackage<Source>> {
  const contributions = input.contributions.map((contribution) => ({
    ...contribution,
    path: contribution.path.normalize('NFC'),
  }));
  assertUniquePagePackagePaths(contributions);
  const title = normalizeNfc(input.source.title);
  assertBoundedNormalizedTitle(title);
  const entryMetadata = contributions.map(({ source: _source, ...entry }) => entry);
  const components = PAGE_PACKAGE_COMPONENT_IDS.flatMap((id) => {
    const entries = entryMetadata.filter((entry) => entry.component === id);
    if (entries.length === 0) return [];
    return [
      {
        id,
        status: input.componentStatuses[id] ?? 'complete',
        entryCount: entries.length,
        totalBytes: entries.reduce((total, entry) => total + entry.size, 0),
      },
    ];
  });
  const manifestCandidate: PagePackageManifest = {
    schemaVersion: PAGE_PACKAGE_SCHEMA_VERSION,
    kind: 'page-package',
    id: input.id,
    capturedAt: input.capturedAt,
    intent: input.intent,
    source: {
      url: input.source.url,
      title,
      faviconUrl: input.source.faviconUrl,
    },
    viewport: input.viewport,
    diagnosticsLevel: input.diagnosticsLevel,
    components,
    entries: entryMetadata,
    warnings: [...input.warnings],
    stats: {
      entryCount: entryMetadata.length,
      totalBytes: entryMetadata.reduce((total, entry) => total + entry.size, 0),
      failedResourceCount: input.failedResourceCount,
      warningCount: input.warnings.length,
    },
  };
  const manifest = parsePagePackageManifest(manifestCandidate);
  if (!manifest) throw new Error('Page Package manifest violates the version 1 contract.');
  const manifestText = serializePagePackageManifest(manifest);
  const manifestBytes = UTF8_ENCODER.encode(manifestText);
  const manifestSha256 = await digest(manifestBytes);
  if (!SHA256_PATTERN.test(manifestSha256)) {
    throw new Error('Page Package digest dependency returned an invalid SHA-256 value.');
  }
  return {
    entries: contributions,
    manifest,
    manifestBytes,
    manifestSha256,
    manifestText,
  };
}

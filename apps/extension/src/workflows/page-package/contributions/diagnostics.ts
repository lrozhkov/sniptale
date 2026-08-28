import {
  getPagePackageExtendedDiagnosticMimeType,
  MAX_PAGE_PACKAGE_ENTRIES,
  PAGE_PACKAGE_EXTENDED_DIAGNOSTIC_ENTRY_PROFILE,
  type PagePackageDiagnosticsLevel,
  type PagePackageIntent,
} from '@sniptale/runtime-contracts/page-package';
import {
  assertSafeArchivePath,
  createArchivePathAllocator,
} from '../../../composition/archive-transfer/path';
import { assertPagePackageContribution, type PagePackageContribution } from '../paths';
import { createBlobContribution, type PagePackageBlobDigest } from './blob';

const ACTIVE_TEXT_EXTENSIONS = [
  'css',
  'htm',
  'html',
  'js',
  'mjs',
  'cjs',
  'svg',
  'xhtml',
  'xml',
] as const;

interface DiagnosticTextAsset {
  content: string;
  path: string;
}

interface ExtendedDiagnosticTextAsset extends DiagnosticTextAsset {
  mimeType: 'application/json' | 'text/plain';
}

interface PreparedDiagnosticEntry {
  blob: Blob;
  mimeType: 'application/json' | 'text/plain';
  path: string;
}

function finalExtension(path: string): string {
  const leaf = path.split('/').at(-1) ?? '';
  const index = leaf.lastIndexOf('.');
  return index >= 0 ? leaf.slice(index + 1).toLocaleLowerCase('en-US') : '';
}

function assertSourcePath(path: string): void {
  assertSafeArchivePath(path);
  if (path.normalize('NFC') !== path || finalExtension(path) === 'zip') {
    throw new Error(`Invalid diagnostic source path: ${path}.`);
  }
}

function safeStandardSegments(path: string): string[] {
  assertSourcePath(path);
  const segments = path.split('/');
  if (
    ACTIVE_TEXT_EXTENSIONS.includes(finalExtension(path) as (typeof ACTIVE_TEXT_EXTENSIONS)[number])
  ) {
    segments[segments.length - 1] = `${segments.at(-1)!}.txt`;
  }
  return segments;
}

function inferStandardMimeType(path: string): 'application/json' | 'text/plain' {
  return finalExtension(path) === 'json' ? 'application/json' : 'text/plain';
}

function prepareStandardEntries(assets: readonly DiagnosticTextAsset[]): PreparedDiagnosticEntry[] {
  const allocator = createArchivePathAllocator();
  return assets.map((asset) => {
    if (typeof asset.content !== 'string') {
      throw new Error(`Diagnostic asset must contain text: ${asset.path}.`);
    }
    const sourceSegments = safeStandardSegments(asset.path);
    const mimeType = inferStandardMimeType(asset.path);
    return {
      blob: new Blob([asset.content], { type: mimeType }),
      mimeType,
      path: allocator.reserve(['diagnostics', 'standard', ...sourceSegments]),
    };
  });
}

function prepareExtendedEntries(
  assets: readonly ExtendedDiagnosticTextAsset[]
): PreparedDiagnosticEntry[] {
  if (assets.length !== PAGE_PACKAGE_EXTENDED_DIAGNOSTIC_ENTRY_PROFILE.length) {
    throw new Error('Extended diagnostic inventory is incomplete.');
  }
  return assets.map((asset, index) => {
    const profile = PAGE_PACKAGE_EXTENDED_DIAGNOSTIC_ENTRY_PROFILE[index];
    const requiredMime = getPagePackageExtendedDiagnosticMimeType(asset.path);
    if (
      profile?.path !== asset.path ||
      profile.mimeType !== asset.mimeType ||
      requiredMime !== asset.mimeType ||
      typeof asset.content !== 'string'
    ) {
      throw new Error(`Invalid extended diagnostic artifact: ${asset.path}.`);
    }
    return {
      blob: new Blob([asset.content], { type: asset.mimeType }),
      mimeType: asset.mimeType,
      path: asset.path,
    };
  });
}

function assertPreparedEntries(entries: readonly PreparedDiagnosticEntry[]): void {
  if (entries.length > MAX_PAGE_PACKAGE_ENTRIES) {
    throw new Error('Diagnostic entry count exceeds the Page Package limit.');
  }
  const collisionKeys = new Set<string>();
  for (const entry of entries) {
    const collisionKey = entry.path.toLocaleLowerCase('en-US');
    if (collisionKeys.has(collisionKey)) {
      throw new Error(`Duplicate diagnostic contribution path: ${entry.path}.`);
    }
    collisionKeys.add(collisionKey);
    assertPagePackageContribution({
      component: 'diagnostics',
      mimeType: entry.mimeType,
      path: entry.path,
      sha256: '0'.repeat(64),
      size: entry.blob.size,
      source: entry.blob,
    });
  }
}

export async function createDiagnosticContributions(args: {
  digest: PagePackageBlobDigest;
  extendedAssets?: readonly ExtendedDiagnosticTextAsset[] | undefined;
  intent: PagePackageIntent;
  level: PagePackageDiagnosticsLevel;
  standardAssets?: readonly DiagnosticTextAsset[] | undefined;
}): Promise<PagePackageContribution<Blob>[]> {
  const standardAssets = args.standardAssets ?? [];
  const extendedAssets = args.extendedAssets ?? [];
  if (args.level === 'none') return [];
  if (args.level === 'standard' && extendedAssets.length > 0) {
    throw new Error('Extended diagnostic artifacts require the extended level.');
  }
  if (args.level === 'extended' && args.intent !== 'export') {
    throw new Error('Extended diagnostics are available only for direct export.');
  }
  const requestedEntryCount =
    standardAssets.length + (args.level === 'extended' ? extendedAssets.length : 0);
  if (requestedEntryCount > MAX_PAGE_PACKAGE_ENTRIES) {
    throw new Error('Diagnostic entry count exceeds the Page Package limit.');
  }
  const entries = [
    ...prepareStandardEntries(standardAssets),
    ...(args.level === 'extended' ? prepareExtendedEntries(extendedAssets) : []),
  ];
  assertPreparedEntries(entries);
  const contributions: PagePackageContribution<Blob>[] = [];
  for (const entry of entries) {
    contributions.push(
      await createBlobContribution({
        ...entry,
        component: 'diagnostics',
        digest: args.digest,
      })
    );
  }
  return contributions;
}

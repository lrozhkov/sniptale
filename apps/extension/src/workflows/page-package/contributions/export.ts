import {
  isPagePackageEntryPath,
  MAX_PAGE_PACKAGE_ENTRIES,
  type PagePackageComponentId,
} from '@sniptale/runtime-contracts/page-package';
import {
  assertSafeArchivePath,
  createArchivePathAllocator,
} from '../../../composition/archive-transfer/path';
import type { PagePackageContribution } from '../paths';
import {
  createBlobContribution,
  normalizeContributionMimeType,
  type PagePackageBlobDigest,
} from './blob';

interface ExportBlobPackageEntry {
  binaryBase64?: string;
  binaryContent?: Blob;
  mimeType?: string;
  path: string;
  textContent?: string;
}

function inferTextMimeType(path: string, declared?: string): string {
  if (declared) return normalizeContributionMimeType(declared);
  const lowerPath = path.toLocaleLowerCase('en-US');
  if (lowerPath.endsWith('.json')) return 'application/json';
  if (lowerPath.endsWith('.md')) return 'text/markdown';
  return 'text/plain';
}

function resolveEntryBlob(entry: ExportBlobPackageEntry): {
  blob: Blob;
  mimeType: string;
} {
  if (entry.binaryBase64 !== undefined) {
    throw new Error('Page Package export contributions require Blob binary mode.');
  }
  const hasText = typeof entry.textContent === 'string';
  const hasBlob = entry.binaryContent instanceof Blob;
  if (hasText === hasBlob) {
    throw new Error(`Export entry must contain exactly one Blob or text source: ${entry.path}.`);
  }
  if (hasText) {
    const mimeType = inferTextMimeType(entry.path, entry.mimeType);
    return {
      blob: new Blob([entry.textContent!], { type: mimeType }),
      mimeType,
    };
  }
  const mimeType = normalizeContributionMimeType(entry.mimeType ?? entry.binaryContent!.type);
  return { blob: entry.binaryContent!, mimeType };
}

function classifyEntry(
  path: string,
  mimeType: string
): {
  component: PagePackageComponentId;
  prefix: string[];
  sourceSegments: string[];
} {
  assertSafeArchivePath(path);
  const sourceSegments = path.split('/');
  if (path === 'page-screenshot.png' && mimeType === 'image/png') {
    return { component: 'images', prefix: [], sourceSegments };
  }
  const first = sourceSegments[0]?.toLocaleLowerCase('en-US');
  if (first === 'logs' || first === 'diagnostics') {
    return {
      component: 'diagnostics',
      prefix: ['diagnostics', 'export'],
      sourceSegments,
    };
  }
  const withoutFiles = first === 'files' ? sourceSegments.slice(1) : sourceSegments;
  if (mimeType.startsWith('image/')) {
    return {
      component: 'images',
      prefix: ['exports', 'images'],
      sourceSegments: withoutFiles,
    };
  }
  if (first === 'files') {
    return {
      component: 'attachments',
      prefix: ['attachments'],
      sourceSegments: withoutFiles,
    };
  }
  return { component: 'pageData', prefix: ['exports', 'data'], sourceSegments };
}

function makeDiagnosticEntryInert(
  classification: ReturnType<typeof classifyEntry>,
  mimeType: string
): ReturnType<typeof classifyEntry> {
  if (classification.component !== 'diagnostics') return classification;
  const candidatePath = [...classification.prefix, ...classification.sourceSegments].join('/');
  if (isPagePackageEntryPath('diagnostics', candidatePath, mimeType)) return classification;
  const sourceSegments = [...classification.sourceSegments];
  sourceSegments[sourceSegments.length - 1] = `${sourceSegments.at(-1)!}.txt`;
  const inertPath = [...classification.prefix, ...sourceSegments].join('/');
  if (!isPagePackageEntryPath('diagnostics', inertPath, mimeType)) return classification;
  return { ...classification, sourceSegments };
}

export async function createExportContributions(
  entries: readonly ExportBlobPackageEntry[],
  digest: PagePackageBlobDigest
): Promise<PagePackageContribution<Blob>[]> {
  if (entries.length > MAX_PAGE_PACKAGE_ENTRIES) {
    throw new Error('Export entry count exceeds the Page Package limit.');
  }
  const allocator = createArchivePathAllocator();
  const contributions: PagePackageContribution<Blob>[] = [];
  for (const entry of entries) {
    const { blob, mimeType } = resolveEntryBlob(entry);
    const classification = makeDiagnosticEntryInert(classifyEntry(entry.path, mimeType), mimeType);
    if (classification.sourceSegments.length === 0) {
      throw new Error(`Export entry has no filename: ${entry.path}.`);
    }
    const path = allocator.reserve([...classification.prefix, ...classification.sourceSegments]);
    contributions.push(
      await createBlobContribution({
        blob,
        component: classification.component,
        digest,
        mimeType,
        path,
      })
    );
  }
  return contributions;
}

import {
  normalizePagePackageOptionalUrl,
  normalizePagePackageWarnings,
  type PagePackageExtendedDiagnosticPath,
  type PagePackageViewport,
} from '@sniptale/runtime-contracts/page-package';
import type { ExportResult } from '@sniptale/runtime-contracts/export';
import type { PagePackageIntent } from '@sniptale/runtime-contracts/page-package';
import type { PagePackageDiagnosticsLevel } from '@sniptale/runtime-contracts/page-package';
import { hashWebSnapshotAssetBlob } from '../../features/web-snapshot/asset-manifest';
import {
  composePagePackage,
  type ComposedPagePackage,
} from '../../workflows/page-package/composer';
import { createExportContributions } from '../../workflows/page-package/contributions/export';
import { createDiagnosticContributions } from '../../workflows/page-package/contributions/diagnostics';
import { sanitizeWebSnapshotSourceUrl } from '../../features/web-snapshot/public';

export interface PagePackageArchiveArtifact {
  entries: readonly {
    binaryBase64?: string;
    binaryContent?: Blob;
    mimeType?: string;
    path: string;
    textContent?: string;
  }[];
  errors: readonly string[];
  stats: ExportResult['stats'];
}

export interface PagePackageExtendedDiagnosticArtifact {
  content: string;
  mimeType: 'application/json' | 'text/plain';
  path: PagePackageExtendedDiagnosticPath;
}

export interface ExportPagePackageSource {
  faviconUrl: string | null;
  title: string | null;
  url: string | null;
  viewport: PagePackageViewport | null;
}

export type ComposedExportPagePackage = ComposedPagePackage<Blob> & {
  producerStats: ExportResult['stats'];
};

function digestBytes(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  copy.set(bytes);
  return hashWebSnapshotAssetBlob(new Blob([copy]));
}

async function projectDiagnosticContributions(args: {
  contributions: Awaited<ReturnType<typeof createExportContributions>>;
  diagnosticsLevel: PagePackageDiagnosticsLevel;
  extendedDiagnosticArtifacts?: readonly PagePackageExtendedDiagnosticArtifact[] | undefined;
  intent: PagePackageIntent;
}) {
  const withoutDiagnostics = args.contributions.filter(
    (contribution) => contribution.component !== 'diagnostics'
  );
  if (args.diagnosticsLevel === 'none') return withoutDiagnostics;
  const standardDiagnostics = args.contributions.filter(
    (contribution) => contribution.component === 'diagnostics'
  );
  if (args.diagnosticsLevel === 'standard') return [...withoutDiagnostics, ...standardDiagnostics];
  const extendedDiagnostics = await createDiagnosticContributions({
    digest: hashWebSnapshotAssetBlob,
    extendedAssets: args.extendedDiagnosticArtifacts,
    intent: args.intent,
    level: 'extended',
  });
  return [...withoutDiagnostics, ...standardDiagnostics, ...extendedDiagnostics];
}

/** Adapts the existing Blob-backed Export Manager artifact into Page Package V1. */
export async function composeExportPagePackage(args: {
  artifact: PagePackageArchiveArtifact;
  capturedAt?: string | undefined;
  diagnosticsLevel?: PagePackageDiagnosticsLevel | undefined;
  extendedDiagnosticArtifacts?: readonly PagePackageExtendedDiagnosticArtifact[] | undefined;
  id?: string | undefined;
  source: ExportPagePackageSource;
}): Promise<ComposedExportPagePackage> {
  const producedContributions = await createExportContributions(
    args.artifact.entries,
    hashWebSnapshotAssetBlob
  );
  const defaultDiagnosticsLevel = producedContributions.some(
    (entry) => entry.component === 'diagnostics'
  )
    ? 'standard'
    : 'none';
  const diagnosticsLevel = args.diagnosticsLevel ?? defaultDiagnosticsLevel;
  const contributions = await projectDiagnosticContributions({
    contributions: producedContributions,
    diagnosticsLevel,
    extendedDiagnosticArtifacts: args.extendedDiagnosticArtifacts,
    intent: 'export',
  });

  const pagePackage = await composePagePackage(
    {
      capturedAt: args.capturedAt ?? new Date().toISOString(),
      componentStatuses: {},
      contributions,
      diagnosticsLevel,
      failedResourceCount: args.artifact.stats.filesFailed,
      id: args.id ?? crypto.randomUUID(),
      intent: 'export',
      source: {
        faviconUrl: normalizePagePackageOptionalUrl(
          args.source.faviconUrl === null
            ? null
            : sanitizeWebSnapshotSourceUrl(args.source.faviconUrl)
        ),
        title: args.source.title,
        url: normalizePagePackageOptionalUrl(
          args.source.url === null ? null : sanitizeWebSnapshotSourceUrl(args.source.url)
        ),
      },
      viewport: args.source.viewport,
      warnings: normalizePagePackageWarnings(args.artifact.errors),
    },
    digestBytes
  );
  return { ...pagePackage, producerStats: { ...args.artifact.stats } };
}

/** Combines already-produced safe Web-copy and Export Manager contributions. */
export async function composeCombinedPagePackage(args: {
  artifact: PagePackageArchiveArtifact | null;
  diagnosticsLevel?: PagePackageDiagnosticsLevel | undefined;
  extendedDiagnosticArtifacts?: readonly PagePackageExtendedDiagnosticArtifact[] | undefined;
  intent: PagePackageIntent;
  webCopy: ComposedPagePackage<Blob>;
}): Promise<ComposedPagePackage<Blob>> {
  const exportContributions = args.artifact
    ? await createExportContributions(args.artifact.entries, hashWebSnapshotAssetBlob)
    : [];
  const producedContributions = [...args.webCopy.entries, ...exportContributions];
  const diagnosticsLevel =
    args.diagnosticsLevel ??
    (producedContributions.some((entry) => entry.component === 'diagnostics')
      ? 'standard'
      : 'none');
  const contributions = await projectDiagnosticContributions({
    contributions: producedContributions,
    diagnosticsLevel,
    extendedDiagnosticArtifacts: args.extendedDiagnosticArtifacts,
    intent: args.intent,
  });
  const componentStatuses = Object.fromEntries(
    args.webCopy.manifest.components.map((component) => [component.id, component.status])
  );
  const failedResourceCount =
    args.webCopy.manifest.stats.failedResourceCount + (args.artifact?.stats.filesFailed ?? 0);
  if (!Number.isSafeInteger(failedResourceCount)) {
    throw new Error('Combined Page Package resource count exceeds its safe integer limit.');
  }
  return composePagePackage(
    {
      capturedAt: args.webCopy.manifest.capturedAt,
      componentStatuses,
      contributions,
      diagnosticsLevel,
      failedResourceCount,
      id: args.webCopy.manifest.id,
      intent: args.intent,
      source: args.webCopy.manifest.source,
      viewport: args.webCopy.manifest.viewport,
      warnings: normalizePagePackageWarnings([
        ...args.webCopy.manifest.warnings,
        ...(args.artifact?.errors ?? []),
      ]),
    },
    digestBytes
  );
}

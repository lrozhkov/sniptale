import type { PagePackageViewport } from '@sniptale/runtime-contracts/page-package';
import type { PagePackageScreenshotCoverage } from '@sniptale/runtime-contracts/page-package';
import type { ComposedPagePackage } from '../../../workflows/page-package/composer';

export interface WebSnapshotAssetEntry {
  blob: Blob;
  localPath: string;
  originalUrl: string;
}

export interface WebSnapshotDiagnosticAssetLedger {
  entries: Array<{
    authoredKind: 'absolute' | 'embedded' | 'relative';
    authoredUrl: string | null;
    fragment: string | null;
    localPath: string | null;
    mimeType: string | null;
    requestUrl: string | null;
    resolvedUrl: string | null;
    sha256: string | null;
    size: number | null;
    status: 'captured' | 'skipped';
    reason: string | null;
    usage: { attribute: string; element: string };
  }>;
  omitted: number;
  total: number;
}

export interface WebSnapshotDiagnosticAssetTargetCollection {
  entries: Array<{
    authoredKind: 'absolute' | 'embedded' | 'relative';
    authoredUrl: string | null;
    fragment: string | null;
    requestIdentity: string;
    requestUrl: string | null;
    resolvedUrl: string | null;
    usage: { attribute: string; element: string };
  }>;
  total: number;
}

export interface WebSnapshotPageSource {
  title: string | null;
  url: string;
  viewport?: PagePackageViewport;
}

export interface WebSnapshotWarningStats {
  failedAssetCount: number;
  networkWarningCount: number;
  sanitizerWarningCount: number;
  warningCount: number;
}

export interface WebSnapshotBuildResult {
  diagnosticAssetLedger: WebSnapshotDiagnosticAssetLedger;
  manifest: ComposedPagePackage<Blob>['manifest'];
  pagePackage: ComposedPagePackage<Blob>;
  screenshotBlob: Blob;
  screenshotCoverage: PagePackageScreenshotCoverage;
  screenshotMimeType: 'image/png';
  snapshotSessionId: string;
  warnings: string[];
}

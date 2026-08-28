import type { ExportOptions } from '@sniptale/runtime-contracts/export';
import type { PagePackageDiagnosticsLevel } from '@sniptale/runtime-contracts/page-package';
import type {
  ComposedExportPagePackage,
  ExportPagePackageSource,
  PagePackageArchiveArtifact,
  PagePackageExtendedDiagnosticArtifact,
} from './composition';
import { composeExportPagePackage } from './composition';

export interface PagePackageExportProducer {
  buildBlobPackage(options: ExportOptions): Promise<PagePackageArchiveArtifact>;
}

/** Sequences the existing Export Manager producer without owning its parser behavior. */
export async function buildExportPagePackage(args: {
  diagnosticsLevel?: PagePackageDiagnosticsLevel | undefined;
  extendedDiagnosticArtifacts?: readonly PagePackageExtendedDiagnosticArtifact[] | undefined;
  exportProducer: PagePackageExportProducer;
  options: ExportOptions;
  source: ExportPagePackageSource;
}): Promise<ComposedExportPagePackage> {
  const artifact = await args.exportProducer.buildBlobPackage(args.options);
  return composeExportPagePackage({
    artifact,
    diagnosticsLevel: args.diagnosticsLevel,
    extendedDiagnosticArtifacts: args.extendedDiagnosticArtifacts,
    source: args.source,
  });
}

export { composeExportPagePackage } from './composition';
export { composeCombinedPagePackage } from './composition';
export type { ExportPagePackageSource } from './composition';

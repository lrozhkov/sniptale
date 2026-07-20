import { discoverLockedProductionPackages } from './lock-closure.mjs';
import { selectDependencyLegalMaterials } from './license-selection.mjs';

export { discoverLockedProductionPackages } from './lock-closure.mjs';
export {
  DEFAULT_REVIEWED_LICENSE_SELECTIONS,
  selectDependencyLegalMaterials,
} from './license-selection.mjs';
export { formatThirdPartyNotices, writeDependencyLegalClosure } from './output.mjs';

/** Discovers the complete production closure and resolves its redistributable legal material. */
export async function generateDependencyLegalClosure(options = {}) {
  const records = await discoverLockedProductionPackages(options);
  return selectDependencyLegalMaterials(records, {
    canonicalLicenseAliases: options.canonicalLicenseAliases,
    pinnedSources: options.pinnedSources,
    reviewedSelections: options.reviewedSelections,
  });
}

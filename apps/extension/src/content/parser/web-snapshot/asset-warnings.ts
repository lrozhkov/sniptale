import { formatWebSnapshotWarningUrl } from './asset-session';
import type { AssetTargetWarning } from './asset-targets';

const AUTHENTICATED_ASSET_PROVENANCE_WARNING = [
  'Authenticated same-site assets were enabled for this web snapshot;',
  'saved assets may include resources loaded with the current signed-in session.',
].join(' ');

export function createPrivacyWarnings(
  targetWarnings: readonly AssetTargetWarning[],
  allowAuthenticatedSameOriginAssets: boolean,
  baseUrl?: string
): string[] {
  const warnings = targetWarnings.map(
    (warning) =>
      `Asset skipped: ${formatWebSnapshotWarningUrl(warning.url, baseUrl)} (${warning.reason})`
  );

  if (allowAuthenticatedSameOriginAssets) {
    warnings.unshift(AUTHENTICATED_ASSET_PROVENANCE_WARNING);
  }

  return warnings;
}

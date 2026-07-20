import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseExtensionManifestVersion(value: unknown, manifestPath: string): string {
  if (!isRecord(value) || typeof value.version !== 'string' || value.version.length === 0) {
    throw new Error(`Extension manifest version is missing: ${manifestPath}`);
  }

  return value.version;
}

export function readExtensionManifestVersion(repositoryRoot: string): string {
  const manifestPath = join(repositoryRoot, 'apps/extension/manifest.json');
  return parseExtensionManifestVersion(
    JSON.parse(readFileSync(manifestPath, 'utf8')),
    manifestPath
  );
}

export function createContentRuntimeBuildId(mode: string, releaseVersion?: string): string {
  if (mode === 'release') {
    if (releaseVersion == null || releaseVersion.length === 0) {
      throw new Error('Release content runtime build id requires an extension version.');
    }
    return `release-${releaseVersion}`;
  }
  return `${mode}-${Date.now().toString(36)}`;
}

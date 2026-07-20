import fs from 'node:fs/promises';
import path from 'node:path';

import { readOssReleasePolicy, sha256 } from '../oss-release-policy.mjs';
import { formatThirdPartyNotices, generateDependencyLegalClosure } from './index.mjs';

function manropeMetadata(policy) {
  const manrope = policy.bundledAssets.find((asset) => asset.id === 'manrope');
  if (!manrope) throw new Error('OSS release policy is missing Manrope metadata.');
  return { ...manrope, licensePath: 'LICENSES/OFL-1.1.txt' };
}

async function collectFiles(root, relativeDirectory) {
  const directory = path.resolve(root, relativeDirectory);
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(root, relativePath)));
    else files.push(relativePath);
  }
  return files.sort();
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function validateLicenseArtifacts(root, policy, closure) {
  const errors = [];
  const expectedPaths = closure.licenseFiles.map((file) => file.archivePath).sort();
  const actualPaths = await collectFiles(root, policy.dependencyLegal.licenseDirectory);
  if (!sameJson(actualPaths, expectedPaths)) {
    errors.push('Dependency license artifact inventory is incomplete or stale');
  }
  for (const licenseFile of closure.licenseFiles) {
    let contents;
    try {
      contents = await fs.readFile(path.resolve(root, licenseFile.archivePath));
    } catch {
      errors.push(`Dependency license artifact is missing: ${licenseFile.archivePath}`);
      continue;
    }
    if (sha256(contents) !== sha256(licenseFile.contents)) {
      errors.push(`Dependency license artifact content drift: ${licenseFile.archivePath}`);
    }
  }
  for (const entry of closure.entries.filter(
    (candidate) => candidate.licenseStorageKind === 'canonical-file'
  )) {
    let contents;
    try {
      contents = await fs.readFile(path.resolve(root, entry.archivePath));
    } catch {
      errors.push(`Canonical dependency license file is missing: ${entry.archivePath}`);
      continue;
    }
    if (sha256(contents) !== entry.sha256) {
      errors.push(`Canonical dependency license content drift: ${entry.archivePath}`);
    }
  }
  return errors;
}

/** Compares tracked legal outputs with a fresh dependency closure from lockfile and installed tree. */
export async function validateDependencyLegalClosure(root = process.cwd()) {
  const errors = [];
  let policy;
  let closure;
  try {
    policy = readOssReleasePolicy(root);
    closure = await generateDependencyLegalClosure({
      canonicalLicenseAliases: policy.dependencyLegal.canonicalLicenseAliases,
      pinnedSources: policy.dependencyLegal.pinnedSources,
      repoRoot: root,
      reviewedSelections: policy.dependencyLegal.reviewedSelections,
    });
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
  let manifest;
  try {
    manifest = JSON.parse(
      await fs.readFile(path.resolve(root, policy.dependencyLegal.manifestPath), 'utf8')
    );
  } catch {
    return [`Dependency legal manifest is missing: ${policy.dependencyLegal.manifestPath}`];
  }
  const expectedManifest = { entries: closure.entries, schemaVersion: 1 };
  if (!sameJson(manifest, expectedManifest)) {
    errors.push('Dependency legal manifest is incomplete or stale');
  }
  errors.push(...(await validateLicenseArtifacts(root, policy, closure)));
  const expectedNotices = formatThirdPartyNotices({
    entries: closure.entries,
    manrope: manropeMetadata(policy),
  });
  const notices = await fs.readFile(path.resolve(root, 'THIRD_PARTY_NOTICES.md'), 'utf8');
  if (notices !== expectedNotices) errors.push('THIRD_PARTY_NOTICES.md is incomplete or stale');
  for (const entry of manifest.entries ?? []) {
    if (entry.selectedLicense?.includes('MPL-2.0') && !entry.correspondingSourceUrl) {
      errors.push(`MPL corresponding-source URL is missing: ${entry.packageName}@${entry.version}`);
    }
  }
  return errors;
}

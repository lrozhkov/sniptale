import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  CANONICAL_LICENSE_DIGESTS,
  REQUIRED_RELEASE_LEGAL_PATHS,
  sha256,
} from '../../release/oss-release-policy.mjs';
import {
  isNonEmptyString,
  validatePolicyEntries,
} from './oss-release-validation.policy-schema.mjs';

export function sameStringSet(left, right) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function duplicateValues(values) {
  return [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
}

function validateCorePolicyShape(policy) {
  const errors = [];
  const arrays = [
    'workspacePackages',
    'legalFiles',
    'bundledAssets',
    'contributorFiles',
    'releaseDocs',
    'forbiddenReleaseDocFragments',
  ];
  if (policy?.schemaVersion !== 1) {
    errors.push('OSS release policy has an invalid schema');
  }
  for (const key of arrays) {
    if (!Array.isArray(policy?.[key])) errors.push(`OSS release policy ${key} must be an array`);
  }
  if (errors.length > 0) return errors;
  if (
    !isNonEmptyString(policy.project?.author) ||
    !isNonEmptyString(policy.project?.copyright) ||
    policy.project?.license !== 'AGPL-3.0-or-later'
  ) {
    errors.push('OSS release project identity is incomplete');
  }
  if (!isNonEmptyString(policy.releaseConsumerManifest)) {
    errors.push('OSS release consumer manifest path is missing');
  }
  if (
    !isNonEmptyString(policy.dependencyLegal?.manifestPath) ||
    policy.dependencyLegal?.licenseDirectory !== 'LICENSES/dependencies' ||
    !Array.isArray(policy.dependencyLegal?.canonicalLicenseAliases) ||
    !Array.isArray(policy.dependencyLegal?.pinnedSources) ||
    !Array.isArray(policy.dependencyLegal?.reviewedSelections)
  ) {
    errors.push('OSS release dependency legal policy is incomplete');
  }
  if (policy?.securityReporting !== 'excluded' || policy?.publication !== 'local-only') {
    errors.push('OSS release policy must remain local-only without a security-reporting channel');
  }
  return errors;
}

export function validatePolicyShape(policy) {
  const coreErrors = validateCorePolicyShape(policy);
  return coreErrors.length > 0 ? coreErrors : validatePolicyEntries(policy);
}

export function validateLegalFiles(root, policy) {
  const errors = [];
  const archivePaths = policy.legalFiles.map((entry) => entry.archivePath);
  const sourcePaths = policy.legalFiles.map((entry) => entry.source);
  const manifestPath = path.resolve(root, policy.dependencyLegal.manifestPath);
  let dependencyManifest;
  try {
    dependencyManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    errors.push(`dependency legal manifest is missing: ${policy.dependencyLegal.manifestPath}`);
  }
  const dependencyArchivePaths = Array.isArray(dependencyManifest?.entries)
    ? dependencyManifest.entries.map((entry) => entry.archivePath)
    : [];
  if (dependencyManifest && dependencyManifest.schemaVersion !== 1) {
    errors.push('dependency legal manifest has an invalid schema');
  }
  const expectedLegalPaths = new Set([
    ...REQUIRED_RELEASE_LEGAL_PATHS,
    policy.dependencyLegal.manifestPath,
    ...dependencyArchivePaths,
  ]);
  if (!sameStringSet(archivePaths, expectedLegalPaths)) {
    errors.push('release legal payload must contain the complete canonical file set');
  }
  if (!sameStringSet(sourcePaths, expectedLegalPaths)) {
    errors.push('release legal sources must contain the complete canonical file set');
  }
  for (const duplicate of duplicateValues(archivePaths)) {
    errors.push(`duplicate release legal archive path: ${duplicate}`);
  }
  for (const entry of policy.legalFiles) {
    const absolutePath = path.resolve(root, entry.source);
    if (!existsSync(absolutePath)) {
      errors.push(`release legal file is missing: ${entry.source}`);
      continue;
    }
    if (sha256(readFileSync(absolutePath)) !== entry.sha256) {
      errors.push(`release legal file digest drift: ${entry.source}`);
    }
    const standardDigest = CANONICAL_LICENSE_DIGESTS.get(entry.source);
    if (standardDigest && entry.sha256 !== standardDigest) {
      errors.push(`canonical license digest drift: ${entry.source}`);
    }
  }
  return errors;
}

export function validateNoticeContents(root, policy) {
  const errors = [];
  const noticePath = path.resolve(root, 'NOTICE');
  const noticesPath = path.resolve(root, 'THIRD_PARTY_NOTICES.md');
  const notice = existsSync(noticePath) ? readFileSync(noticePath, 'utf8') : '';
  const notices = existsSync(noticesPath) ? readFileSync(noticesPath, 'utf8') : '';
  for (const marker of [policy.project.copyright, policy.project.license, 'Manrope']) {
    if (marker && !notice.includes(marker))
      errors.push(`NOTICE is missing required marker: ${marker}`);
  }
  const manrope = policy.bundledAssets.find((asset) => asset.id === 'manrope');
  for (const marker of [
    manrope?.copyright,
    manrope?.sourcePackage,
    manrope?.version,
    manrope?.license,
  ]) {
    if (marker && !notices.includes(marker)) {
      errors.push(`third-party notice is missing required marker: ${marker}`);
    }
  }
  for (const artifact of manrope?.artifacts ?? []) {
    if (!notices.includes(artifact.path) || !notices.includes(artifact.sha256)) {
      errors.push(`third-party notice is missing bundled artifact: ${artifact.path}`);
    }
  }
  return errors;
}

import fs from 'node:fs';
import path from 'node:path';

import { repoRoot } from '../../core/shared.mjs';

export function readPolicy(rootDir = repoRoot, policyPath) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, policyPath), 'utf8'));
}

export function toRootRelativePath(rootDir, filePath) {
  if (!path.isAbsolute(filePath)) {
    return filePath.replaceAll('\\', '/');
  }

  return path.relative(rootDir, filePath).replaceAll('\\', '/');
}

export function hasPolicyMetadata(entry) {
  return (
    typeof entry?.file === 'string' &&
    entry.file.length > 0 &&
    typeof entry?.owner === 'string' &&
    entry.owner.length > 0 &&
    typeof entry?.justification === 'string' &&
    entry.justification.length > 0 &&
    typeof entry?.reviewNote === 'string' &&
    entry.reviewNote.length > 0
  );
}

export function collectPolicyMetadataViolations(entries, policyPath, kind) {
  const violations = [];

  for (const entry of entries) {
    if (!hasPolicyMetadata(entry)) {
      violations.push({
        rule: `security-policy-${kind}-metadata`,
        file: policyPath,
        message:
          `Security policy entry "${entry?.file ?? '<unknown>'}" is missing ` +
          'file/owner/justification/reviewNote metadata.',
      });
    }
  }

  return violations;
}

export function collectPolicyDuplicateViolations(entries, policyPath, kind) {
  const violations = [];
  const seenFiles = new Set();

  for (const entry of entries) {
    if (typeof entry?.file !== 'string' || entry.file.length === 0) {
      continue;
    }

    if (seenFiles.has(entry.file)) {
      violations.push({
        rule: `security-policy-${kind}-duplicate-target`,
        file: policyPath,
        message:
          `Security policy entry "${entry.file}" is duplicated. ` +
          'Keep one owner entry per canonical file path.',
      });
    }

    seenFiles.add(entry.file);
  }

  return violations;
}

export function collectPolicyTargetViolations(entries, policyPath, kind, rootDir = repoRoot) {
  const violations = [];

  for (const entry of entries) {
    if (!hasPolicyMetadata(entry)) {
      continue;
    }

    const absolutePath = path.join(rootDir, entry.file);
    if (!fs.existsSync(absolutePath)) {
      violations.push({
        rule: `security-policy-${kind}-missing-target`,
        file: policyPath,
        message:
          `Security policy entry "${entry.file}" points to a missing file. ` +
          'Update the allowlist to the real canonical owner path.',
      });
    }
  }

  return violations;
}

export function collectPolicyRegistryViolations(entries, policyPath, kind, rootDir = repoRoot) {
  return [
    ...collectPolicyMetadataViolations(entries, policyPath, kind),
    ...collectPolicyDuplicateViolations(entries, policyPath, kind),
    ...collectPolicyTargetViolations(entries, policyPath, kind, rootDir),
  ];
}

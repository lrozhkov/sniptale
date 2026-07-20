import fs from 'node:fs';

import {
  collectLineViolations,
  createViolation,
  lineNumber,
  normalizePath,
} from './audit-guardrail-shared.mjs';
import {
  BACKUP_IMPORT_OWNER_PATTERN,
  isBoundaryParserOwner,
  isZipOwner,
} from './audit-guardrail-storage-owners.mjs';
export {
  collectPersistenceAuthorityViolations,
  collectStorageMutationOwnershipViolations,
} from './audit-guardrail-storage-persistence.mjs';

const ZIP_REPEATED_GENERATION_MESSAGE = [
  'Package builders must not generate full archives repeatedly for size probing;',
  'use a fixed-point manifest/package flow.',
].join(' ');
const BACKUP_ATOMICITY_MESSAGE = [
  'Backup/import owners that write multiple stores must preflight all descriptors',
  'and blobs before the first write.',
].join(' ');
const PRIVACY_SETTINGS_MESSAGE = [
  'needs a default, persisted parser, runtime propagation proof,',
  'and disabled-path proof.',
].join(' ');

function collectZipLineViolations(
  { generateCount, line, packageProfileScore, relativePath },
  index
) {
  const lineViolations = [];
  if (/\.loadAsync\s*\(/u.test(line) && packageProfileScore < 3) {
    lineViolations.push(
      createViolation(
        'zip-package-profile-missing',
        relativePath,
        lineNumber(index),
        'Untrusted ZIP/package loading needs caps, safe path policy, manifest parser, and rollback/cleanup profile.'
      )
    );
  }
  if (/\.generateAsync\s*\(/u.test(line) && generateCount > 1) {
    lineViolations.push(
      createViolation(
        'zip-package-repeated-generation',
        relativePath,
        lineNumber(index),
        ZIP_REPEATED_GENERATION_MESSAGE
      )
    );
  }
  if (/\.generateAsync\s*\(/u.test(line) && packageProfileScore < 2) {
    lineViolations.push(
      createViolation(
        'zip-package-output-profile-missing',
        relativePath,
        lineNumber(index),
        'Package generation needs a manifest/fixed-point profile and resource caps in the owner.'
      )
    );
  }
  return lineViolations;
}

export function collectZipPackageProfileViolations(files) {
  return collectLineViolations(files, ({ lines, relativePath, source }) => {
    const usesZipPackage = /\bJSZip\b|\.generateAsync|\.loadAsync/u.test(source);
    if (!isZipOwner(relativePath) || !usesZipPackage) {
      return [];
    }

    const packageProfileScore = [
      /\b(?:MAX_\w*(?:FILE_COUNT|COMPRESSED|INFLATED|ENTRY|PACKAGE|ZIP)\w*|assert\w*ZipLimits)\b/u,
      /\b(?:manifest|metadata)\b/u,
      /\b(?:assert\w*Safe\w*Path|safe\w*path|sanitize\w*path|normalize\w*path)\b/iu,
      /\b(?:local\w*path|inflated|rollback|cleanup|remove|delete)\b/iu,
    ].filter((pattern) => pattern.test(source)).length;
    const generateCount = lines.filter((line) => /\.generateAsync\s*\(/u.test(line)).length;
    return lines.flatMap((line, index) =>
      collectZipLineViolations({ generateCount, line, packageProfileScore, relativePath }, index)
    );
  });
}

export function collectBackupImportAtomicityViolations(files) {
  return collectLineViolations(files, ({ lines, relativePath, source }) => {
    if (!BACKUP_IMPORT_OWNER_PATTERN.test(relativePath)) {
      return [];
    }
    const writeLine = lines.findIndex((line) => /\b(?:save\w+|put|add|delete)\w*\s*\(/u.test(line));
    if (writeLine < 0) {
      return [];
    }
    const beforeWrite = lines.slice(0, writeLine + 1).join('\n');
    const hasPreflight =
      /(?:preflight\w*|prepare\w*|\bvalidate\b|\bparse\b|loadBackupParts\b|ensureMediaHubStorageHeadroom\b)/iu.test(
        beforeWrite
      );
    const multiStoreIntent =
      /\b(?:assets|exports|metadata|telemetry|projects|webSnapshot|recordings?)\b/iu.test(source);
    if (!multiStoreIntent || hasPreflight) {
      return [];
    }
    return [
      createViolation(
        'backup-import-preflight-before-write',
        relativePath,
        lineNumber(writeLine),
        BACKUP_ATOMICITY_MESSAGE
      ),
    ];
  });
}

export function collectPrivacyFeatureSettingsViolations(files) {
  const targetFiles = files.filter((file) =>
    /apps\/extension\/src\/composition\/persistence\/settings\//u.test(normalizePath(file))
  );
  if (targetFiles.length === 0) {
    return [];
  }
  const source = targetFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  return ['authenticatedSnapshotAssetsEnabled', 'rawDiagnosticsEnabled'].flatMap((feature) => {
    if (!source.includes(feature)) {
      return [];
    }
    const hasDefault = source.includes(`${feature}:`);
    const hasParser = source.includes(feature) && /parseOptionalBoolean/u.test(source);
    return hasDefault && hasParser
      ? []
      : [
          createViolation(
            'privacy-feature-settings-incomplete',
            'apps/extension/src/composition/persistence/settings',
            1,
            `Sensitive privacy feature "${feature}" ${PRIVACY_SETTINGS_MESSAGE}`
          ),
        ];
  });
}

export function collectContractParserCoverageViolations(files) {
  return collectLineViolations(files, ({ lines, relativePath }) => {
    if (!isBoundaryParserOwner(relativePath)) {
      return [];
    }
    return lines.flatMap((line, index) => {
      const bypassesParser =
        /\bas\s+(?:VideoProject|ScenarioProjectV3?|WebSnapshotRecord|MediaLibraryEntry)\b/u.test(
          line
        );
      if (!bypassesParser) {
        return [];
      }
      return [
        createViolation(
          'contract-parser-coverage',
          relativePath,
          lineNumber(index),
          'Boundary project/snapshot/media records must use canonical parsers instead of domain casts.'
        ),
      ];
    });
  });
}

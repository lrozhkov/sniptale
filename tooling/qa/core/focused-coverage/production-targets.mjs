import fs from 'node:fs';

import { fromRelativePath } from '../shared.mjs';
import { PRODUCT_SOURCE_ROOTS } from '../quality.config.mjs';
import { isCoverageExcluded, isCoverageTargetFile } from '../verify-test-coverage.registry.mjs';

const TEST_FILE_PATTERN = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;

let productionFileCache = null;

function createMappingViolation(rule, file, message) {
  return { file, message, rule };
}

function collectProductionFiles(dir) {
  const files = [];
  if (!fs.existsSync(fromRelativePath(dir))) {
    return files;
  }

  for (const entry of fs.readdirSync(fromRelativePath(dir), { withFileTypes: true })) {
    const relativePath = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...collectProductionFiles(relativePath));
    } else if (entry.isFile() && /\.(?:ts|tsx|js|jsx|mjs|cjs)$/u.test(entry.name)) {
      files.push(relativePath);
    }
  }

  return files;
}

function getProductionFiles() {
  productionFileCache ??= PRODUCT_SOURCE_ROOTS.flatMap((root) => collectProductionFiles(root));
  return productionFileCache;
}

function hasProductionPrefixMatch(productionPrefix) {
  return getProductionFiles().some(
    (file) =>
      file.startsWith(productionPrefix) &&
      !TEST_FILE_PATTERN.test(file) &&
      isCoverageTargetFile(file) &&
      !isCoverageExcluded(file)
  );
}

function hasAnyProductionPrefixMatch(productionPrefix) {
  return getProductionFiles().some((file) => file.startsWith(productionPrefix));
}

function collectProductionFileViolations(mapping) {
  if (mapping.productionFile == null) return [];
  if (mapping.productionFile != null && !fs.existsSync(fromRelativePath(mapping.productionFile))) {
    if (mapping.allowMissingProductionTarget) {
      return [];
    }
    return [
      createMappingViolation(
        'focused-coverage-owner-mapping-missing-production-file',
        mapping.productionFile,
        'Mapped owner production file does not exist.'
      ),
    ];
  }

  if (mapping.productionFile != null && isCoverageExcluded(mapping.productionFile)) {
    return [
      createMappingViolation(
        'focused-coverage-owner-mapping-excluded-production-file',
        mapping.productionFile,
        'Mapped owner production file is excluded by the coverage registry.'
      ),
    ];
  }

  if (mapping.productionFile != null && !isCoverageTargetFile(mapping.productionFile)) {
    return [
      createMappingViolation(
        'focused-coverage-owner-mapping-non-coverage-production-file',
        mapping.productionFile,
        'Mapped owner production file is not a coverage registry target.'
      ),
    ];
  }

  return [];
}

function collectProductionPrefixViolations(mapping) {
  if (mapping.productionPrefix != null && !hasProductionPrefixMatch(mapping.productionPrefix)) {
    if (
      mapping.allowMissingProductionTarget &&
      !hasAnyProductionPrefixMatch(mapping.productionPrefix)
    ) {
      return [];
    }
    return [
      createMappingViolation(
        'focused-coverage-owner-mapping-empty-production-prefix',
        mapping.productionPrefix,
        'Mapped owner production prefix does not match any non-excluded coverage target.'
      ),
    ];
  }

  return [];
}

export function collectMappingProductionTargetViolations(mapping) {
  return [
    ...collectProductionFileViolations(mapping),
    ...collectProductionPrefixViolations(mapping),
  ];
}

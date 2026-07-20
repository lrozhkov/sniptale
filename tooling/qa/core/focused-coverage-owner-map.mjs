import fs from 'node:fs';
import { fromRelativePath } from './shared.mjs';
import { FOCUSED_COVERAGE_OWNER_MAPPINGS } from './focused-coverage/maps/index.mjs';
import { collectMappingProductionTargetViolations } from './focused-coverage/production-targets.mjs';

const TEST_FILE_PATTERN = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;
export { FOCUSED_COVERAGE_OWNER_MAPPINGS };

function normalizeEntry(entry) {
  return {
    allowCrossOwner: entry.allowCrossOwner === true,
    allowMissingProductionTarget: entry.allowMissingProductionTarget === true,
    exclusive: entry.exclusive === true,
    owner: entry.owner,
    productionFile: entry.productionFile ?? null,
    productionPrefix: entry.productionPrefix ?? null,
    reason: entry.reason,
    testFiles: entry.testFiles ?? [],
  };
}

function getRuntimeOwner(file) {
  const extensionPrefix = 'apps/extension/src/';
  if (file.startsWith(extensionPrefix)) {
    const runtime = file.slice(extensionPrefix.length).split('/')[0];
    return runtime ? `${extensionPrefix}${runtime}/` : null;
  }

  const [root, runtime] = file.split('/');
  return root === 'src' && runtime ? `${root}/${runtime}/` : null;
}

function mappingMatchesFile(mapping, file) {
  return (
    mapping.productionFile === file ||
    (mapping.productionPrefix != null && file.startsWith(mapping.productionPrefix))
  );
}

function createMappingViolation(rule, file, message) {
  return { file, message, rule };
}

function validateMappingShape(mapping) {
  const violations = [];
  if (!mapping.owner || !mapping.reason) {
    violations.push(
      createMappingViolation(
        'focused-coverage-owner-mapping-metadata',
        mapping.productionFile ?? mapping.productionPrefix ?? '<unknown>',
        'Mapping requires owner and reason metadata.'
      )
    );
  }
  if (!mapping.productionFile && !mapping.productionPrefix) {
    violations.push(
      createMappingViolation(
        'focused-coverage-owner-mapping-target',
        '<unknown>',
        'Mapping requires productionFile or productionPrefix.'
      )
    );
  }
  return violations;
}

function validateMappingProductionTarget(mapping) {
  return collectMappingProductionTargetViolations(mapping);
}

function validateMappingTests(mapping) {
  return mapping.testFiles.flatMap((testFile) => {
    const violations = [];
    if (!TEST_FILE_PATTERN.test(testFile)) {
      violations.push(
        createMappingViolation(
          'focused-coverage-owner-mapping-test',
          testFile,
          'Mapped owner file must be a test/spec file.'
        )
      );
    }
    if (!fs.existsSync(fromRelativePath(testFile))) {
      violations.push(
        createMappingViolation(
          'focused-coverage-owner-mapping-missing-test',
          testFile,
          'Mapped owner test file does not exist.'
        )
      );
    }
    return violations;
  });
}

function validateMappingRuntimeOwner(mapping) {
  if (mapping.allowCrossOwner || mapping.productionPrefix == null) {
    return [];
  }

  const productionOwner = getRuntimeOwner(mapping.productionPrefix);
  return mapping.testFiles
    .filter((testFile) => productionOwner != null && !testFile.startsWith(productionOwner))
    .map((testFile) =>
      createMappingViolation(
        'focused-coverage-owner-mapping-cross-owner',
        testFile,
        `Mapped test crosses ${productionOwner} without allowCrossOwner.`
      )
    );
}

export function collectFocusedCoverageOwnerMappingViolations({
  mappings = FOCUSED_COVERAGE_OWNER_MAPPINGS,
} = {}) {
  return mappings
    .map(normalizeEntry)
    .flatMap((mapping) => [
      ...validateMappingShape(mapping),
      ...validateMappingProductionTarget(mapping),
      ...validateMappingTests(mapping),
      ...validateMappingRuntimeOwner(mapping),
    ]);
}

export function resolveMappedCoverageOwnerTests(
  file,
  { mappings = FOCUSED_COVERAGE_OWNER_MAPPINGS } = {}
) {
  const normalizedMappings = mappings.map(normalizeEntry);
  const allMatchingMappings = normalizedMappings.filter((mapping) =>
    mappingMatchesFile(mapping, file)
  );
  const exclusiveMappings = allMatchingMappings.filter((mapping) => mapping.exclusive);
  const exactExclusiveMappings = exclusiveMappings.filter(
    (mapping) => mapping.productionFile === file
  );
  const exactMappings = allMatchingMappings.filter((mapping) => mapping.productionFile === file);
  const matchingMappings =
    exactExclusiveMappings.length > 0
      ? exactExclusiveMappings
      : exclusiveMappings.length > 0
        ? exclusiveMappings
        : exactMappings.length > 0
          ? exactMappings
          : allMatchingMappings;

  return [...new Set(matchingMappings.flatMap((mapping) => mapping.testFiles))].sort();
}

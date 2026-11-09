import fs from 'node:fs';
import path from 'node:path';
import { fromRelativePath, repoRoot } from '../../analysis/repository/shared-paths.mjs';
import { FOCUSED_COVERAGE_OWNER_MAPPINGS } from './maps/index.mjs';
import { collectMappingProductionTargetViolations } from './production-targets.mjs';
import { parseDeclarativeConstArrayModule } from '../../analysis/repository/declarative-inventory.mjs';
import { createSourceFile } from '../../analysis/structural-risk/ast.mjs';

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
    productionDataFiles: entry.productionDataFiles ?? null,
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
    (Array.isArray(mapping.productionDataFiles) && mapping.productionDataFiles.includes(file)) ||
    (mapping.productionPrefix != null && file.startsWith(mapping.productionPrefix))
  );
}

function createMappingViolation(rule, file, message) {
  return { file, message, rule };
}

export function collectFocusedCoverageOwnerMapInventoryViolations(
  files = [],
  { root = repoRoot } = {}
) {
  return files.flatMap((file) => {
    const absolutePath = path.join(root, file);
    if (!fs.existsSync(absolutePath)) {
      return [
        createMappingViolation(
          'focused-coverage-owner-map-inventory-missing',
          file,
          'Inventory-only focused owner map does not exist.'
        ),
      ];
    }
    const sourceFile = createSourceFile(file, fs.readFileSync(absolutePath, 'utf8'));
    return parseDeclarativeConstArrayModule(sourceFile) != null
      ? []
      : [
          createMappingViolation(
            'focused-coverage-owner-map-inventory-declarative-shape',
            file,
            'Inventory-only focused owner maps require one exported const array of static literal data.'
          ),
        ];
  });
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
  const targetKinds = [
    mapping.productionFile,
    mapping.productionPrefix,
    mapping.productionDataFiles,
  ].filter((target) => target != null).length;
  if (targetKinds !== 1) {
    violations.push(
      createMappingViolation(
        'focused-coverage-owner-mapping-target',
        '<unknown>',
        'Mapping requires exactly one target: productionFile, productionPrefix, or productionDataFiles.'
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
  if (mapping.allowCrossOwner) return [];
  const dataFiles = Array.isArray(mapping.productionDataFiles) ? mapping.productionDataFiles : [];
  const targets = mapping.productionPrefix == null ? dataFiles : [mapping.productionPrefix];
  const productionOwners = new Set(
    targets.filter((file) => typeof file === 'string').map(getRuntimeOwner)
  );
  return [...productionOwners].flatMap((productionOwner) =>
    mapping.testFiles
      .filter((testFile) => productionOwner != null && !testFile.startsWith(productionOwner))
      .map((testFile) =>
        createMappingViolation(
          'focused-coverage-owner-mapping-cross-owner',
          testFile,
          `Mapped test crosses ${productionOwner} without allowCrossOwner.`
        )
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
    (mapping) =>
      mapping.productionFile === file ||
      (Array.isArray(mapping.productionDataFiles) && mapping.productionDataFiles.includes(file))
  );
  const exactMappings = allMatchingMappings.filter(
    (mapping) =>
      mapping.productionFile === file ||
      (Array.isArray(mapping.productionDataFiles) && mapping.productionDataFiles.includes(file))
  );
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

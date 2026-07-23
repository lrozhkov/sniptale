import fs from 'node:fs';
import path from 'node:path';
import { fromRelativePath, repoRoot } from './shared.mjs';
import { FOCUSED_COVERAGE_OWNER_MAPPINGS } from './focused-coverage/maps/index.mjs';
import { collectMappingProductionTargetViolations } from './focused-coverage/production-targets.mjs';
import { createSourceFile, ts } from './structural-risk/ast.mjs';

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

function unwrapInventoryExpression(expression) {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function isStaticInventoryProperty(property) {
  return (
    ts.isPropertyAssignment(property) &&
    !ts.isComputedPropertyName(property.name) &&
    isStaticInventoryExpression(property.initializer)
  );
}

function isStaticInventoryExpression(expression) {
  const current = unwrapInventoryExpression(expression);
  if (
    ts.isStringLiteral(current) ||
    ts.isNumericLiteral(current) ||
    ts.isNoSubstitutionTemplateLiteral(current) ||
    current.kind === ts.SyntaxKind.TrueKeyword ||
    current.kind === ts.SyntaxKind.FalseKeyword ||
    current.kind === ts.SyntaxKind.NullKeyword
  ) {
    return true;
  }
  if (ts.isArrayLiteralExpression(current)) {
    return current.elements.every(
      (element) => !ts.isSpreadElement(element) && isStaticInventoryExpression(element)
    );
  }
  return (
    ts.isObjectLiteralExpression(current) && current.properties.every(isStaticInventoryProperty)
  );
}

function isExportedConstStatement(statement) {
  return (
    ts.isVariableStatement(statement) &&
    statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ===
      true &&
    (statement.declarationList.flags & ts.NodeFlags.Const) !== 0
  );
}

function isDeclarativeOwnerMappingModule(sourceFile) {
  if (sourceFile.parseDiagnostics.length > 0 || sourceFile.statements.length !== 1) {
    return false;
  }
  const [statement] = sourceFile.statements;
  if (!isExportedConstStatement(statement) || statement.declarationList.declarations.length !== 1) {
    return false;
  }
  const [declaration] = statement.declarationList.declarations;
  return (
    ts.isIdentifier(declaration.name) &&
    declaration.initializer != null &&
    ts.isArrayLiteralExpression(unwrapInventoryExpression(declaration.initializer)) &&
    isStaticInventoryExpression(declaration.initializer)
  );
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
    return isDeclarativeOwnerMappingModule(sourceFile)
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

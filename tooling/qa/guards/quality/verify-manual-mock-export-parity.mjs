import fs from 'node:fs';
import ts from 'typescript';

import {
  fromRelativePath,
  isExecutedAsScript,
  parseFilesArgument,
  printViolations,
  readText,
  toRelativePath,
} from '../../core/shared.mjs';
import { collectChangedTargets } from '../../runtime/changed-targets.helpers.mjs';
import {
  collectCandidateTestFiles,
  collectMockParityTargetFiles,
  filterNetNewMissingExports,
  findPreviousMock,
  readPreviousFile,
  resolveMockedModule,
} from './verify-manual-mock-export-parity.targets.helpers.mjs';

function createViolation(file, modulePath, missingExports) {
  return {
    rule: 'manual-mock-export-parity',
    file,
    message: [
      `Mock for ${modulePath} is missing exports: ${missingExports.join(', ')}.`,
      'Add explicit stubs or use an importOriginal partial mock.',
    ].join(' '),
  };
}

function createSourceFile(relativePath, sourceText) {
  return ts.createSourceFile(
    relativePath,
    sourceText,
    relativePath.endsWith('.tsx') ? ts.ScriptTarget.Latest : ts.ScriptTarget.ESNext,
    true
  );
}

function hasExportModifier(node) {
  return node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

function hasDefaultModifier(node) {
  return (
    node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword) ?? false
  );
}

function collectBindingNames(name, names) {
  if (ts.isIdentifier(name)) {
    names.add(name.text);
    return;
  }
  if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    for (const element of name.elements) {
      if (ts.isBindingElement(element)) {
        collectBindingNames(element.name, names);
      }
    }
  }
}

export function collectNamedExports(relativePath, sourceText = readText(relativePath)) {
  const sourceFile = createSourceFile(relativePath, sourceText);
  const exports = new Set();
  let unsupported = false;

  for (const statement of sourceFile.statements) {
    if (ts.isExportDeclaration(statement)) {
      if (!statement.exportClause || ts.isNamespaceExport(statement.exportClause)) {
        unsupported = true;
        continue;
      }
      for (const element of statement.exportClause.elements) {
        exports.add(element.name.text);
      }
      continue;
    }

    if (!hasExportModifier(statement) || hasDefaultModifier(statement)) {
      continue;
    }

    if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isEnumDeclaration(statement)) &&
      statement.name
    ) {
      exports.add(statement.name.text);
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        collectBindingNames(declaration.name, exports);
      }
    }
  }

  return unsupported ? null : [...exports].sort();
}

function isMockCallee(expression) {
  return (
    ts.isPropertyAccessExpression(expression) &&
    (expression.name.text === 'mock' || expression.name.text === 'doMock') &&
    ts.isIdentifier(expression.expression) &&
    (expression.expression.text === 'vi' || expression.expression.text === 'jest')
  );
}

function findReturnedObjectLiteral(body) {
  if (ts.isParenthesizedExpression(body)) {
    return findReturnedObjectLiteral(body.expression);
  }
  if (ts.isObjectLiteralExpression(body)) {
    return body;
  }
  if (!ts.isBlock(body)) {
    return null;
  }
  for (const statement of body.statements) {
    if (ts.isReturnStatement(statement) && statement.expression) {
      return ts.isObjectLiteralExpression(statement.expression) ? statement.expression : null;
    }
  }
  return null;
}

function collectMockObjectKeys(factory) {
  if (!ts.isArrowFunction(factory) && !ts.isFunctionExpression(factory)) {
    return null;
  }
  if (factory.parameters.length > 0) {
    return null;
  }

  const objectLiteral = findReturnedObjectLiteral(factory.body);
  if (!objectLiteral) {
    return null;
  }

  const keys = new Set();
  for (const property of objectLiteral.properties) {
    if (ts.isSpreadAssignment(property)) {
      return null;
    }
    const name = property.name;
    if (!name) {
      return null;
    }
    if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
      keys.add(name.text);
      continue;
    }
    return null;
  }

  return [...keys].sort();
}

function collectManualMocks(testFile, sourceText = readText(testFile)) {
  const sourceFile = createSourceFile(testFile, sourceText);
  const mocks = [];

  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      isMockCallee(node.expression) &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      mocks.push({
        specifier: node.arguments[0].text,
        keys: node.arguments[1] ? collectMockObjectKeys(node.arguments[1]) : null,
      });
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return mocks;
}

function collectMissingExports(mock, modulePath, moduleSource) {
  const exports = collectNamedExports(modulePath, moduleSource);
  if (!mock?.keys || !exports || exports.length === 0) {
    return [];
  }
  const mockKeySet = new Set(mock.keys);
  return exports.filter((exportName) => !mockKeySet.has(exportName));
}

function collectNetNewMissingExports({ currentMocks, mockIndex, mockedModule, testFile }) {
  const currentMissing = collectMissingExports(
    currentMocks[mockIndex],
    mockedModule,
    readText(mockedModule)
  );
  const previousTestSource = readPreviousFile(testFile);
  const previousModuleSource = readPreviousFile(mockedModule);
  if (previousTestSource == null || previousModuleSource == null) {
    return currentMissing;
  }

  const previousMocks = collectManualMocks(testFile, previousTestSource);
  const previousMock = findPreviousMock(currentMocks, previousMocks, mockIndex);
  const previousMissing = collectMissingExports(previousMock, mockedModule, previousModuleSource);
  return filterNetNewMissingExports(currentMissing, previousMissing);
}

export function runManualMockExportParityCheck({ targetFiles = [] } = {}) {
  const existingTargets = targetFiles.filter((file) => fs.existsSync(fromRelativePath(file)));
  const behavioralTargets = collectMockParityTargetFiles(existingTargets);
  const changedFileSet = new Set(behavioralTargets);
  const candidateTestFiles = collectCandidateTestFiles(behavioralTargets);
  const violations = [];

  for (const testFile of candidateTestFiles) {
    const currentMocks = collectManualMocks(testFile);
    for (const [mockIndex, mock] of currentMocks.entries()) {
      if (!mock.keys) {
        continue;
      }
      const mockedModule = resolveMockedModule(testFile, mock.specifier);
      if (!mockedModule || (!changedFileSet.has(testFile) && !changedFileSet.has(mockedModule))) {
        continue;
      }
      const missingExports = collectNetNewMissingExports({
        currentMocks,
        mockIndex,
        mockedModule,
        testFile,
      });
      if (missingExports.length > 0) {
        violations.push(createViolation(testFile, mockedModule, missingExports));
      }
    }
  }

  return {
    skipped: candidateTestFiles.length === 0,
    violations,
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const explicitFiles = parseFilesArgument(process.argv.slice(2));
  const targetFiles =
    explicitFiles.length > 0
      ? explicitFiles.map(toRelativePath)
      : collectChangedTargets({ scope: 'workspace' }).changedFiles;
  const result = runManualMockExportParityCheck({ targetFiles });

  if (result.violations.length > 0) {
    printViolations('Manual mock export parity violations:', result.violations);
    process.exit(1);
  }

  process.stdout.write(result.skipped ? 'Skipped\n' : 'OK\n');
}

/** Enforces sanitizer provenance at diagnostic persistence, export, and transport sinks. */

import ts from 'typescript';

import { collectCodeFiles } from '../../analysis/repository/shared-files.mjs';
import { repoRoot } from '../../analysis/repository/shared-paths.mjs';
import { isExecutedAsScript, printViolations } from '../../runtime/process/shared-cli.mjs';
import { isProductSourcePath } from '../../analysis/repository/src-production-targets.mjs';
import { forEachPolicySourceFile, getNodeLine, visitSourceNodes } from './helpers/policy-scan.mjs';
import {
  collectPolicyRegistryViolations,
  readPolicy,
  toRootRelativePath,
} from './security-policy-utils.mjs';

const POLICY_PATH = 'tooling/configs/qa/security-storage-ownership.data.json';
const DIAGNOSTICS_PERSISTENCE_OWNER =
  'apps/extension/src/composition/persistence/diagnostics/index.ts';
const CANONICAL_SANITIZER_MODULE_PATTERN =
  /(?:@sniptale\/platform\/observability\/diagnostics\/sanitizer|diagnostics\/sanitizer)$/u;
const SAFE_DIAGNOSTIC_IDENTIFIER_PATTERN =
  /^(?:.*(?:At|Count|Height|Id|Index|Length|Ms|Time|Width)|createdAt|duration|kind|level|recordingId|schemaVersion|stats|type)$/u;
const SAFE_DIAGNOSTIC_PROPERTY_PATTERN =
  /^(?:.*(?:At|Count|Height|Id|Index|Length|Ms|Time|Width)|chunksCount|createdAt|duration|exportedAt|isPaused|kind|level|recordingId|schemaVersion|stats|tabId|totalEvents|type)$/u;
const DIAGNOSTIC_ARCHIVE_ENTRY_PATTERN = /^(?:events|meta)\.json$|^README\.md$/u;
const DIAGNOSTIC_PAYLOAD_SIGNAL_PATTERN =
  /(?:diagnostic|rawHar|rawResponse|outerHTML|innerHTML|providerResponse|responseText)/iu;

function getCallName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return null;
}

function unwrapExpression(expression) {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isAwaitExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function getPropertyNameText(name) {
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return null;
}

function collectImportBindings(sourceFile) {
  const importedNames = new Map();
  const sanitizerBindings = new Set();
  const safeStringifyBindings = new Set();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    const sanitizerModule = CANONICAL_SANITIZER_MODULE_PATTERN.test(statement.moduleSpecifier.text);
    const namedBindings = statement.importClause?.namedBindings;
    if (!namedBindings || !ts.isNamedImports(namedBindings)) continue;
    for (const element of namedBindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;
      importedNames.set(element.name.text, importedName);
      if (sanitizerModule && /^(?:sanitize|stringifyDiagnostic)/u.test(importedName)) {
        sanitizerBindings.add(element.name.text);
      }
      if (importedName === 'safeStringify') safeStringifyBindings.add(element.name.text);
    }
  }

  return { importedNames, safeStringifyBindings, sanitizerBindings };
}

function expressionContainsKnownCall(expression, knownNames) {
  let found = false;
  const visit = (node) => {
    if (found) return;
    if (ts.isCallExpression(node) && knownNames.has(getCallName(node.expression))) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(expression);
  return found;
}

function collectFunctionReturnExpressions(node) {
  if (!node.body) return [];
  if (!ts.isBlock(node.body)) return [node.body];
  const expressions = [];
  const visit = (current) => {
    if (current !== node.body && ts.isFunctionLike(current)) return;
    if (ts.isReturnStatement(current) && current.expression) expressions.push(current.expression);
    ts.forEachChild(current, visit);
  };
  visit(node.body);
  return expressions;
}

function collectSanitizerWrappers(sourceFile, sanitizerBindings) {
  const candidates = [];
  visitSourceNodes(sourceFile, (node) => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      candidates.push({ name: node.name.text, node });
    } else if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      candidates.push({ name: node.name.text, node: node.initializer });
    }
  });

  const wrappers = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    const knownNames = new Set([...sanitizerBindings, ...wrappers]);
    for (const candidate of candidates) {
      if (wrappers.has(candidate.name)) continue;
      const returns = collectFunctionReturnExpressions(candidate.node);
      if (
        returns.length > 0 &&
        returns.every((expression) => expressionContainsKnownCall(expression, knownNames))
      ) {
        wrappers.add(candidate.name);
        changed = true;
      }
    }
  }
  return wrappers;
}

function isSafeLiteral(expression) {
  return (
    ts.isStringLiteralLike(expression) ||
    ts.isNumericLiteral(expression) ||
    expression.kind === ts.SyntaxKind.TrueKeyword ||
    expression.kind === ts.SyntaxKind.FalseKeyword ||
    expression.kind === ts.SyntaxKind.NullKeyword
  );
}

function isSanitizedExpression(expression, context) {
  const current = unwrapExpression(expression);
  if (isSafeLiteral(current)) return true;
  if (ts.isIdentifier(current)) {
    return (
      current.text === 'undefined' ||
      context.sanitizedIdentifiers.has(current.text) ||
      SAFE_DIAGNOSTIC_IDENTIFIER_PATTERN.test(current.text)
    );
  }
  if (ts.isPropertyAccessExpression(current)) {
    return SAFE_DIAGNOSTIC_PROPERTY_PATTERN.test(current.name.text);
  }
  if (ts.isTemplateExpression(current)) {
    return current.templateSpans.every((span) => isSanitizedExpression(span.expression, context));
  }
  if (ts.isConditionalExpression(current)) {
    return (
      isSanitizedExpression(current.whenTrue, context) &&
      isSanitizedExpression(current.whenFalse, context)
    );
  }
  if (ts.isCallExpression(current)) {
    const callName = getCallName(current.expression);
    if (context.sanitizerFunctions.has(callName)) return true;
    if (
      ts.isPropertyAccessExpression(current.expression) &&
      current.expression.name.text === 'stringify' &&
      current.expression.expression.getText() === 'JSON'
    ) {
      return current.arguments[0] ? isSanitizedExpression(current.arguments[0], context) : false;
    }
    if (
      ts.isPropertyAccessExpression(current.expression) &&
      current.expression.name.text === 'map' &&
      current.arguments[0]
    ) {
      const callback = unwrapExpression(current.arguments[0]);
      return (
        (ts.isIdentifier(callback) && context.sanitizerFunctions.has(callback.text)) ||
        expressionContainsKnownCall(callback, context.sanitizerFunctions)
      );
    }
    return false;
  }
  if (ts.isObjectLiteralExpression(current)) {
    return current.properties.every((property) => {
      if (ts.isSpreadAssignment(property)) {
        return isSanitizedExpression(property.expression, context);
      }
      if (ts.isShorthandPropertyAssignment(property)) {
        return isSanitizedExpression(property.name, context);
      }
      if (ts.isPropertyAssignment(property)) {
        const propertyName = getPropertyNameText(property.name);
        return (
          (propertyName != null && SAFE_DIAGNOSTIC_PROPERTY_PATTERN.test(propertyName)) ||
          isSanitizedExpression(property.initializer, context)
        );
      }
      return false;
    });
  }
  if (ts.isArrayLiteralExpression(current)) {
    return current.elements.every((element) => isSanitizedExpression(element, context));
  }
  return false;
}

function collectSanitizedIdentifiers(sourceFile, context) {
  const declarations = [];
  visitSourceNodes(sourceFile, (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      declarations.push(node);
    }
  });
  let changed = true;
  while (changed) {
    changed = false;
    for (const declaration of declarations) {
      if (
        !context.sanitizedIdentifiers.has(declaration.name.text) &&
        isSanitizedExpression(declaration.initializer, context)
      ) {
        context.sanitizedIdentifiers.add(declaration.name.text);
        changed = true;
      }
    }
  }
}

function isDiagnosticStorageSetCall(node, sourceFile) {
  return (
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === 'set' &&
    /(?:browserStorage|chrome\.storage)/u.test(node.expression.expression.getText()) &&
    DIAGNOSTIC_PAYLOAD_SIGNAL_PATTERN.test(node.arguments[0]?.getText(sourceFile) ?? '')
  );
}

function isDiagnosticArchiveFileCall(node) {
  if (!ts.isPropertyAccessExpression(node.expression) || node.expression.name.text !== 'file') {
    return false;
  }
  const entryName = node.arguments[0];
  return ts.isStringLiteral(entryName) && DIAGNOSTIC_ARCHIVE_ENTRY_PATTERN.test(entryName.text);
}

function findIdentifierInitializer(sourceFile, identifierName) {
  let initializer = null;
  visitSourceNodes(sourceFile, (node) => {
    if (
      initializer == null &&
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === identifierName
    ) {
      initializer = node.initializer ?? null;
    }
  });
  return initializer;
}

function isDiagnosticRuntimePayload(expression, sourceFile) {
  const current = unwrapExpression(expression);
  if (DIAGNOSTIC_PAYLOAD_SIGNAL_PATTERN.test(current.getText(sourceFile))) return true;
  if (!ts.isIdentifier(current)) return false;
  const initializer = findIdentifierInitializer(sourceFile, current.text);
  return initializer
    ? DIAGNOSTIC_PAYLOAD_SIGNAL_PATTERN.test(initializer.getText(sourceFile))
    : false;
}

function collectSinkArguments(node, sourceFile, relativePath) {
  const callName = getCallName(node.expression);
  if (
    (callName === 'sendRuntimeMessage' || callName === 'sendRuntimeMessageBestEffort') &&
    node.arguments[0] &&
    isDiagnosticRuntimePayload(node.arguments[0], sourceFile)
  ) {
    return node.arguments;
  }
  if (isDiagnosticStorageSetCall(node, sourceFile)) return node.arguments.slice(0, 1);
  if (isDiagnosticArchiveFileCall(node)) return node.arguments.slice(1, 2);
  if (
    relativePath.endsWith('/message-tracer/transport.ts') &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === 'send'
  ) {
    return node.arguments;
  }
  return [];
}

function createSinkViolation(relativePath, sourceFile, node) {
  return {
    rule: 'diagnostic-sink-sanitizer-missing',
    file: relativePath,
    line: getNodeLine(sourceFile, node),
    message:
      'diagnostic persistence/export/transport sink receives payload data without canonical sanitizer provenance',
  };
}

function collectPersistenceOwnerViolations(relativePath, sourceFile, importedNames) {
  if (relativePath !== DIAGNOSTICS_PERSISTENCE_OWNER) return [];
  const requiredCalls = new Map([
    ['sanitizeDiagnosticsEvents', /\bevents\b/u],
    ['sanitizeDiagnosticsMeta', /\bentry\.meta\b/u],
  ]);
  const found = new Set();
  visitSourceNodes(sourceFile, (node) => {
    if (!ts.isCallExpression(node)) return;
    const localName = getCallName(node.expression);
    const importedName = importedNames.get(localName);
    const argumentText = node.arguments[0]?.getText(sourceFile) ?? '';
    if (importedName && requiredCalls.get(importedName)?.test(argumentText)) {
      found.add(importedName);
    }
  });
  return [...requiredCalls.keys()].flatMap((requiredName) =>
    found.has(requiredName)
      ? []
      : [
          {
            rule: 'diagnostic-persistence-final-sanitizer-missing',
            file: relativePath,
            message: `diagnostics persistence owner must call ${requiredName} at the final durable boundary`,
          },
        ]
  );
}

export function collectDiagnosticSanitizationViolations(
  files,
  { policyPath = POLICY_PATH, rootDir = repoRoot } = {}
) {
  const policy = readPolicy(rootDir, policyPath);
  const violations = collectPolicyRegistryViolations(
    policy.diagnosticSanitizerOwners,
    policyPath,
    'diagnostic-sanitization',
    rootDir
  );

  forEachPolicySourceFile(
    files,
    {
      rootDir,
      shouldIncludeRelativePath: isProductSourcePath,
    },
    ({ relativePath, sourceFile }) => {
      const { importedNames, safeStringifyBindings, sanitizerBindings } =
        collectImportBindings(sourceFile);
      const sanitizerFunctions = new Set([
        ...sanitizerBindings,
        ...collectSanitizerWrappers(sourceFile, sanitizerBindings),
      ]);
      const context = { sanitizedIdentifiers: new Set(), sanitizerFunctions };
      collectSanitizedIdentifiers(sourceFile, context);
      violations.push(
        ...collectPersistenceOwnerViolations(relativePath, sourceFile, importedNames)
      );

      visitSourceNodes(sourceFile, (node) => {
        if (!ts.isCallExpression(node)) return;
        const sinkArguments = collectSinkArguments(node, sourceFile, relativePath);
        if (sinkArguments.length === 0) return;
        const tracerSend = relativePath.endsWith('/message-tracer/transport.ts');
        const safe = tracerSend
          ? sinkArguments.every(
              (argument) =>
                ts.isCallExpression(unwrapExpression(argument)) &&
                safeStringifyBindings.has(getCallName(unwrapExpression(argument).expression))
            )
          : sinkArguments.every((argument) => isSanitizedExpression(argument, context));
        if (!safe) violations.push(createSinkViolation(relativePath, sourceFile, node));
      });
    }
  );

  return violations;
}

export function runDiagnosticSanitizationCheck({
  files = [],
  policyPath = POLICY_PATH,
  rootDir = repoRoot,
} = {}) {
  const targetFiles = files.length > 0 ? files : collectCodeFiles();
  return {
    files: targetFiles.map((file) => toRootRelativePath(rootDir, file)),
    violations: collectDiagnosticSanitizationViolations(targetFiles, { policyPath, rootDir }),
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const result = runDiagnosticSanitizationCheck();
  if (result.violations.length > 0) {
    printViolations('Diagnostic sanitization violations found:', result.violations);
    process.exit(1);
  }
  process.stdout.write('Diagnostic sanitization passed\n');
}

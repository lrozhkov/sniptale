import ts from 'typescript';

import { SECURITY_IGNORE_PATTERNS } from '../../../policy/quality/quality.config.mjs';
import { matchesAny } from '../../../analysis/repository/shared-paths.mjs';
import { collectPolicyRegistryViolations, toRootRelativePath } from '../security-policy-utils.mjs';
import { getSourceSnapshot } from '../../../analysis/source/source-snapshot.mjs';

function isCodePolicyTarget(relativePath) {
  return /\.(?:ts|tsx|js|mjs|cjs)$/u.test(relativePath);
}

export function getNodeLine(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

export function getInspectionScope(node) {
  let current = node;
  while (current.parent) {
    if (
      ts.isFunctionLike(current.parent) ||
      ts.isSourceFile(current.parent) ||
      ts.isMethodDeclaration(current.parent)
    ) {
      return current.parent;
    }
    current = current.parent;
  }

  return node.getSourceFile();
}

export function getInspectionScopeText(sourceFile, node) {
  return getInspectionScope(node).getText(sourceFile);
}

export function createSourceFile(filePath) {
  return getSourceSnapshot({ filePath }).sourceFile;
}

export function visitSourceNodes(sourceFile, visitNode) {
  const visit = (node) => {
    visitNode(node);
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
}

export function isStorageSetCall(node, { includeSessionStorage = false } = {}) {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) {
    return false;
  }

  const expressionText = node.expression.getText();
  if (expressionText.endsWith('.putRecord') || expressionText === 'store.put') {
    return true;
  }
  const allowedTargets = includeSessionStorage
    ? [
        'browserStorage.local.set',
        'browserStorage.session.set',
        'browserStorage.sync.set',
        'chrome.storage.local.set',
        'chrome.storage.session.set',
        'chrome.storage.sync.set',
      ]
    : [
        'browserStorage.local.set',
        'browserStorage.sync.set',
        'chrome.storage.local.set',
        'chrome.storage.sync.set',
      ];

  return allowedTargets.includes(expressionText);
}

function getStoragePayloadNode(call) {
  return call.expression.getText().endsWith('.putRecord') ? call.arguments[1] : call.arguments[0];
}

function collectReferencedConstantNames(node, initializers, pattern, seen = new Set()) {
  const names = new Set();
  const visit = (current) => {
    if (!current || seen.has(current)) return;
    seen.add(current);
    if (ts.isIdentifier(current)) {
      if (pattern.test(current.text)) names.add(current.text);
      const initializer = initializers.get(current.text);
      if (initializer) visit(initializer);
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
  return [...names];
}

function shouldInspectPolicyFile(relativePath, allowlistedFiles) {
  return (
    isCodePolicyTarget(relativePath) &&
    !matchesAny(relativePath, SECURITY_IGNORE_PATTERNS) &&
    !allowlistedFiles.has(relativePath)
  );
}

function collectVariableInitializers(sourceFile) {
  const initializers = new Map();
  const ambiguousNames = new Set();
  visitSourceNodes(sourceFile, (node) => {
    if ((ts.isVariableDeclaration(node) || ts.isParameter(node)) && ts.isIdentifier(node.name)) {
      const name = node.name.text;
      if (ambiguousNames.has(name) || initializers.has(name) || !node.initializer) {
        initializers.delete(name);
        ambiguousNames.add(name);
      } else {
        initializers.set(name, node.initializer);
      }
    }
  });
  return initializers;
}

function collectFunctionBodies(sourceFile) {
  const functions = new Map();
  visitSourceNodes(sourceFile, (node) => {
    if (ts.isFunctionDeclaration(node) && node.name && node.body) {
      functions.set(node.name.text, node.body);
    }
  });
  return functions;
}

function resolvePayloadNode(node, initializers, seen = new Set()) {
  if (!node || !ts.isIdentifier(node) || seen.has(node.text)) return node;
  const initializer = initializers.get(node.text);
  if (!initializer) return node;
  seen.add(node.text);
  return resolvePayloadNode(initializer, initializers, seen);
}

function normalizeFieldWords(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
    .split(/[^A-Za-z0-9]+/u)
    .filter(Boolean)
    .map((word) => word.toLowerCase().replace(/s$/u, ''));
}

function containsCanonicalField(node, initializers, canonicalFields, seen = new Set()) {
  if (!node || seen.has(node)) return false;
  seen.add(node);

  if (ts.isIdentifier(node)) {
    const words = normalizeFieldWords(node.text);
    if (canonicalFields.some((field) => words.join('').includes(field))) return true;
    const initializer = initializers.get(node.text);
    return initializer
      ? containsCanonicalField(initializer, initializers, canonicalFields, seen)
      : false;
  }

  if (ts.isStringLiteralLike(node)) {
    const words = normalizeFieldWords(node.text);
    return canonicalFields.some((field) => words.join('').includes(field));
  }

  let found = false;
  ts.forEachChild(node, (child) => {
    if (!found && containsCanonicalField(child, initializers, canonicalFields, seen)) found = true;
  });
  return found;
}

function getPropertyKey(property, sourceFile) {
  if (ts.isSpreadAssignment(property)) return undefined;
  const name = property.name;
  if (!name) return undefined;
  if (ts.isComputedPropertyName(name)) return name.expression.getText(sourceFile);
  return ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)
    ? name.text
    : name.getText(sourceFile);
}

function collectSensitiveStorageKeys(
  payloadNode,
  sourceFile,
  initializers,
  functionBodies,
  canonicalFields,
  seen = new Set()
) {
  const resolved = resolvePayloadNode(payloadNode, initializers);
  if (!resolved || seen.has(resolved)) return [];
  if (!ts.isObjectLiteralExpression(resolved)) {
    const keys = new Set();
    const visit = (node) => {
      if (seen.has(node)) return;
      seen.add(node);
      if (ts.isIdentifier(node)) {
        if (/_KEY$/u.test(node.text)) {
          const words = normalizeFieldWords(node.text).join('');
          if (canonicalFields.some((field) => words.includes(field))) keys.add(node.text);
        }
        const referenced = initializers.get(node.text) ?? functionBodies.get(node.text);
        if (referenced) visit(referenced);
      }
      ts.forEachChild(node, visit);
    };
    visit(resolved);
    return [...keys];
  }
  seen.add(resolved);

  const keys = [];
  for (const property of resolved.properties) {
    if (ts.isSpreadAssignment(property)) {
      keys.push(
        ...collectSensitiveStorageKeys(
          property.expression,
          sourceFile,
          initializers,
          functionBodies,
          canonicalFields,
          seen
        )
      );
      continue;
    }
    if (containsCanonicalField(property, initializers, canonicalFields)) {
      const key = getPropertyKey(property, sourceFile);
      if (key) keys.push(key);
    }
  }
  return keys;
}

function collectExactStoragePolicyViolations(entries, policyPath, policyKind) {
  const violations = [];
  for (const entry of entries) {
    const valid =
      Array.isArray(entry?.storageWrites) &&
      entry.storageWrites.every(
        (write) =>
          typeof write?.sink === 'string' &&
          write.sink.length > 0 &&
          Array.isArray(write.keys) &&
          write.keys.every((key) => typeof key === 'string' && key.length > 0)
      );
    if (!valid) {
      violations.push({
        rule: `security-policy-${policyKind}-storage-writes`,
        file: policyPath,
        message:
          `Security policy entry "${entry?.file ?? '<unknown>'}" must declare exact ` +
          'storageWrites sink/key pairs.',
      });
    }
  }
  return violations;
}

function isExactOwnerWriteAllowed(ownerEntry, sink, sensitiveKeys) {
  if (!ownerEntry || sensitiveKeys.length === 0) return false;
  const write = ownerEntry.storageWrites?.find((candidate) => candidate.sink === sink);
  return Boolean(write && sensitiveKeys.every((key) => write.keys.includes(key)));
}

export function forEachPolicySourceFile(
  files,
  { allowlistedFiles = new Set(), rootDir, shouldIncludeRelativePath = () => true },
  visitFile
) {
  for (const filePath of files) {
    const relativePath = toRootRelativePath(rootDir, filePath);
    if (
      !shouldInspectPolicyFile(relativePath, allowlistedFiles) ||
      !shouldIncludeRelativePath(relativePath)
    ) {
      continue;
    }

    const sourceFile = createSourceFile(filePath);
    visitFile({
      filePath,
      relativePath,
      sourceFile,
    });
  }
}

export function collectPolicyBackedStorageFieldViolations(
  files,
  {
    fieldPattern,
    canonicalFields,
    exactOwnerStoragePolicy = false,
    includeSessionStorage = false,
    message,
    ownerEntries,
    policyKind,
    policyPath,
    rootDir,
    rule,
  }
) {
  const ownerByFile = new Map(ownerEntries.map((entry) => [entry.file, entry]));
  const violations = collectPolicyRegistryViolations(ownerEntries, policyPath, policyKind, rootDir);
  if (exactOwnerStoragePolicy) {
    violations.push(...collectExactStoragePolicyViolations(ownerEntries, policyPath, policyKind));
  }

  forEachPolicySourceFile(
    files,
    {
      rootDir,
    },
    ({ relativePath, sourceFile }) => {
      const initializers = collectVariableInitializers(sourceFile);
      const functionBodies = collectFunctionBodies(sourceFile);
      visitSourceNodes(sourceFile, (node) => {
        if (!isStorageSetCall(node, { includeSessionStorage })) return;
        const payloadNode = getStoragePayloadNode(node);
        const hasSensitiveField = canonicalFields
          ? containsCanonicalField(
              payloadNode,
              initializers,
              canonicalFields.map((field) => normalizeFieldWords(field).join(''))
            )
          : fieldPattern.test(
              resolvePayloadNode(payloadNode, initializers)?.getText(sourceFile) ?? ''
            );
        if (!hasSensitiveField) return;

        const sink = node.expression.getText(sourceFile);
        const expressionText = node.expression.getText(sourceFile);
        const sensitiveKeys = expressionText.endsWith('.putRecord')
          ? [node.arguments[0]?.getText(sourceFile)].filter(Boolean)
          : expressionText === 'store.put'
            ? collectReferencedConstantNames(getInspectionScope(node), initializers, /_STORE$/u)
            : canonicalFields
              ? collectSensitiveStorageKeys(
                  payloadNode,
                  sourceFile,
                  initializers,
                  functionBodies,
                  canonicalFields.map((field) => normalizeFieldWords(field).join(''))
                )
              : [];
        if (
          exactOwnerStoragePolicy &&
          isExactOwnerWriteAllowed(ownerByFile.get(relativePath), sink, sensitiveKeys)
        ) {
          return;
        }

        {
          violations.push({
            rule,
            file: relativePath,
            line: getNodeLine(sourceFile, node),
            message,
          });
        }
      });
    }
  );

  return violations;
}

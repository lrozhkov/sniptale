/** Enforces exact ownership for credentialed requests and secret-bearing headers. */

import ts from 'typescript';

import { collectCodeFiles } from '../../../../analysis/repository/shared-files.mjs';
import { repoRoot } from '../../../../analysis/repository/shared-paths.mjs';
import { isExecutedAsScript, printViolations } from '../../../../runtime/process/shared-cli.mjs';
import { getNodeLine, visitSourceNodes } from '../../helpers/policy-scan.mjs';
import {
  collectPolicyRegistryViolations,
  readPolicy,
  toRootRelativePath,
} from '../../security-policy-utils.mjs';
import { getSourceSnapshot } from '../../../../analysis/source/source-snapshot.mjs';

const POLICY_PATH = 'tooling/configs/qa/security-network-ownership.data.json';
const ANALYZER_PATH = 'tooling/qa/guards/security/network/credential-ownership/check.mjs';
const SECRET_HEADERS = new Set(['authorization', 'cookie', 'xapikey']);

function callName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return null;
}

function staticText(node, constants) {
  if (!node) return null;
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isIdentifier(node)) return constants.get(node.text) ?? null;
  return null;
}

function collectBindings(sourceFile) {
  const constants = new Map();
  const variables = new Map();
  const fetchBindings = new Set(['fetch']);
  const requestHelpers = new Set();
  visitSourceNodes(sourceFile, (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const named = node.importClause?.namedBindings;
      if (named && ts.isNamedImports(named)) {
        for (const element of named.elements) {
          const imported = element.propertyName?.text ?? element.name.text;
          if (
            imported === 'postJsonWithTimeout' &&
            /(?:^|\/)http$/u.test(node.moduleSpecifier.text)
          ) {
            requestHelpers.add(element.name.text);
          }
        }
      }
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      variables.set(node.name.text, node.initializer);
      if (ts.isStringLiteralLike(node.initializer))
        constants.set(node.name.text, node.initializer.text);
    }
  });
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, initializer] of variables) {
      if (
        ts.isIdentifier(initializer) &&
        fetchBindings.has(initializer.text) &&
        !fetchBindings.has(name)
      ) {
        fetchBindings.add(name);
        changed = true;
      }
    }
  }
  return { constants, fetchBindings, requestHelpers, variables };
}

function resolveExpression(expression, variables) {
  let current = expression;
  const seen = new Set();
  while (ts.isIdentifier(current) && variables.has(current.text) && !seen.has(current.text)) {
    seen.add(current.text);
    current = variables.get(current.text);
  }
  return current;
}

function propertyName(name, constants) {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) return name.text;
  return ts.isComputedPropertyName(name) ? staticText(name.expression, constants) : null;
}

function findObjectProperty(object, target, context, seen = new Set()) {
  const resolved = resolveExpression(object, context.variables);
  if (!ts.isObjectLiteralExpression(resolved) || seen.has(resolved)) return null;
  seen.add(resolved);
  for (const property of [...resolved.properties].reverse()) {
    if (ts.isSpreadAssignment(property)) {
      const spreadValue = findObjectProperty(property.expression, target, context, seen);
      if (spreadValue) return spreadValue;
      continue;
    }
    if (ts.isShorthandPropertyAssignment(property) && property.name.text === target) {
      return property.name;
    }
    if (
      ts.isPropertyAssignment(property) &&
      propertyName(property.name, context.constants) === target
    ) {
      return property.initializer;
    }
  }
  return null;
}

function normalizeHeader(value) {
  return value.toLowerCase().replaceAll('-', '');
}

function objectHasSecretHeader(object, context, seen = new Set()) {
  const resolved = resolveExpression(object, context.variables);
  if (!ts.isObjectLiteralExpression(resolved) || seen.has(resolved)) return false;
  seen.add(resolved);
  return resolved.properties.some((property) => {
    if (ts.isSpreadAssignment(property)) {
      return objectHasSecretHeader(property.expression, context, seen);
    }
    if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) {
      return false;
    }
    const name = propertyName(property.name, context.constants);
    return name != null && SECRET_HEADERS.has(normalizeHeader(name));
  });
}

function headersInstanceHasSecretHeader(identifier, sink, sourceFile, context) {
  const initializer = context.variables.get(identifier.text);
  if (
    !initializer ||
    !ts.isNewExpression(initializer) ||
    callName(initializer.expression) !== 'Headers'
  ) {
    return false;
  }
  if (initializer.arguments?.[0] && objectHasSecretHeader(initializer.arguments[0], context)) {
    return true;
  }
  let found = false;
  visitSourceNodes(sourceFile, (node) => {
    if (
      ts.isCallExpression(node) &&
      node.getStart(sourceFile) < sink.getStart(sourceFile) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === identifier.text &&
      ['set', 'append'].includes(node.expression.name.text)
    ) {
      const name = staticText(node.arguments[0], context.constants);
      if (name && SECRET_HEADERS.has(normalizeHeader(name))) found = true;
    }
  });
  return found;
}

function requestConfig(node, context) {
  if (ts.isNewExpression(node) && callName(node.expression) === 'Request') {
    return node.arguments?.[1] ?? null;
  }
  if (!ts.isCallExpression(node)) return null;
  const name = callName(node.expression);
  if (context.fetchBindings.has(name)) {
    const first = resolveExpression(node.arguments[0], context.variables);
    if (ts.isNewExpression(first) && callName(first.expression) === 'Request') {
      return first.arguments?.[1] ?? null;
    }
    return node.arguments[1] ?? null;
  }
  return context.requestHelpers.has(name) ? (node.arguments[0] ?? null) : null;
}

function classifyRequest(node, sourceFile, context) {
  const config = requestConfig(node, context);
  if (!config) return null;
  const headers = findObjectProperty(config, 'headers', context);
  const credentials = findObjectProperty(config, 'credentials', context);
  const resolvedHeaders = headers && resolveExpression(headers, context.variables);
  const secretHeader =
    Boolean(resolvedHeaders && objectHasSecretHeader(resolvedHeaders, context)) ||
    Boolean(
      headers &&
      ts.isIdentifier(headers) &&
      headersInstanceHasSecretHeader(headers, node, sourceFile, context)
    );
  const credentialValue =
    credentials && staticText(resolveExpression(credentials, context.variables), context.constants);
  return { secretHeader, credentialed: credentialValue === 'include' };
}

function policyViolations(policy, policyPath, rootDir) {
  return [
    ...collectPolicyRegistryViolations(
      policy.secretHeaderOwners ?? [],
      policyPath,
      'secret-header-owner',
      rootDir
    ),
    ...collectPolicyRegistryViolations(
      policy.credentialedFetchOwners ?? [],
      policyPath,
      'credentialed-fetch-owner',
      rootDir
    ),
  ];
}

export function collectFetchOwnershipViolations(
  files,
  { policyPath = POLICY_PATH, rootDir = repoRoot } = {}
) {
  const policy = readPolicy(rootDir, policyPath);
  const secretOwners = new Set((policy.secretHeaderOwners ?? []).map((entry) => entry.file));
  const credentialOwners = new Set(
    (policy.credentialedFetchOwners ?? []).map((entry) => entry.file)
  );
  const violations = policyViolations(policy, policyPath, rootDir);
  const scanned = new Set();
  const seenSecret = new Set();
  const seenCredential = new Set();

  for (const filePath of files) {
    const relativePath = toRootRelativePath(rootDir, filePath);
    if (!/\.[cm]?[jt]sx?$/u.test(relativePath) || /\.(?:test|spec)\./u.test(relativePath)) continue;
    scanned.add(relativePath);
    const sourceFile = getSourceSnapshot({ filePath }).sourceFile;
    const context = collectBindings(sourceFile);
    visitSourceNodes(sourceFile, (node) => {
      if (!ts.isCallExpression(node) && !ts.isNewExpression(node)) return;
      const result = classifyRequest(node, sourceFile, context);
      if (!result) return;
      if (result.secretHeader) {
        if (secretOwners.has(relativePath)) seenSecret.add(relativePath);
        else {
          violations.push({
            rule: 'fetch-secret-header-outside-owner',
            file: relativePath,
            line: getNodeLine(sourceFile, node),
            message:
              'assembles secret-bearing request headers outside the approved transport owner',
          });
        }
      }
      if (result.credentialed) {
        if (credentialOwners.has(relativePath)) seenCredential.add(relativePath);
        else {
          violations.push({
            rule: 'fetch-credentialed-request-outside-owner',
            file: relativePath,
            line: getNodeLine(sourceFile, node),
            message: 'assembles a credentialed request outside approved same-origin owners',
          });
        }
      }
    });
  }
  for (const entry of policy.secretHeaderOwners ?? []) {
    if (scanned.has(entry.file) && !seenSecret.has(entry.file)) {
      violations.push({
        rule: 'fetch-secret-header-owner-stale',
        file: policyPath,
        message: `Secret-header owner ${entry.file} contains no classified sink.`,
      });
    }
  }
  for (const entry of policy.credentialedFetchOwners ?? []) {
    if (scanned.has(entry.file) && !seenCredential.has(entry.file)) {
      violations.push({
        rule: 'fetch-credentialed-owner-stale',
        file: policyPath,
        message: `Credentialed-fetch owner ${entry.file} contains no classified sink.`,
      });
    }
  }
  return violations;
}

export function runFetchOwnershipCheck({
  files = [],
  policyPath = POLICY_PATH,
  rootDir = repoRoot,
} = {}) {
  const fullClosure =
    files.length === 0 ||
    files.some((file) => [policyPath, ANALYZER_PATH].includes(toRootRelativePath(rootDir, file)));
  const targetFiles = fullClosure ? collectCodeFiles() : files;
  return {
    files: targetFiles.map((file) => toRootRelativePath(rootDir, file)),
    violations: collectFetchOwnershipViolations(targetFiles, { policyPath, rootDir }),
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const result = runFetchOwnershipCheck();
  if (result.violations.length > 0) {
    printViolations('Fetch ownership violations found:', result.violations);
    process.exit(1);
  }
  process.stdout.write('Fetch ownership passed\n');
}

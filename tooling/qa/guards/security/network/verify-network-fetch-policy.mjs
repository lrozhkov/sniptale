import ts from 'typescript';

import { repoRoot } from '../../../analysis/repository/shared-paths.mjs';
import { getSourceSnapshot } from '../../../analysis/source/source-snapshot.mjs';
import { runGuardrailCheck, runIfExecutedAsScript } from '../../audit/execution/shared.mjs';
import { getNodeLine, visitSourceNodes } from '../helpers/policy-scan.mjs';
import {
  collectPolicyRegistryViolations,
  readPolicy,
  toRootRelativePath,
} from '../security-policy-utils.mjs';

const POLICY_PATH = 'tooling/configs/qa/security-network-ownership.data.json';
const ANALYZER_PATH = 'tooling/qa/guards/security/network/verify-network-fetch-policy.mjs';
const MESSAGE =
  'Anonymous public fetch must bind URL validation, session authority, anonymous credentials, ' +
  'redirect policy, and final-URL revalidation to this sink.';

function callName(expression) {
  return ts.isIdentifier(expression) ? expression.text : null;
}

function functionScope(node) {
  let current = node.parent;
  while (current && !ts.isFunctionLike(current)) current = current.parent;
  return current;
}

function namedImports(sourceFile) {
  const bindings = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    const named = statement.importClause?.namedBindings;
    if (!named || !ts.isNamedImports(named)) continue;
    for (const element of named.elements) {
      bindings.set(element.name.text, {
        imported: element.propertyName?.text ?? element.name.text,
        module: statement.moduleSpecifier.text,
      });
    }
  }
  return bindings;
}

function containsCall(node, names) {
  let found = false;
  visitSourceNodes(node, (current) => {
    if (ts.isCallExpression(current) && names.has(callName(current.expression))) found = true;
  });
  return found;
}

function urlValidators(sourceFile, imports) {
  const privateHostBindings = new Set(
    [...imports.entries()]
      .filter(([, binding]) => binding.imported === 'isPrivateNetworkHost')
      .map(([name]) => name)
  );
  const validators = new Set();
  visitSourceNodes(sourceFile, (node) => {
    if (!ts.isFunctionDeclaration(node) || !node.name || !node.body) return;
    let constructsUrl = false;
    let checksHttps = false;
    let throws = false;
    visitSourceNodes(node.body, (current) => {
      if (
        ts.isNewExpression(current) &&
        ts.isIdentifier(current.expression) &&
        current.expression.text === 'URL'
      ) {
        constructsUrl = true;
      }
      if (
        ts.isBinaryExpression(current) &&
        current.getText(sourceFile).includes('.protocol') &&
        [current.left, current.right].some(
          (part) => ts.isStringLiteralLike(part) && part.text === 'https:'
        )
      ) {
        checksHttps = true;
      }
      if (ts.isThrowStatement(current)) throws = true;
    });
    if (constructsUrl && checksHttps && throws && containsCall(node.body, privateHostBindings)) {
      validators.add(node.name.text);
    }
  });
  return validators;
}

function fetchBindings(sourceFile) {
  const bindings = new Set(['fetch']);
  let changed = true;
  while (changed) {
    changed = false;
    visitSourceNodes(sourceFile, (node) => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        ts.isIdentifier(node.initializer) &&
        bindings.has(node.initializer.text) &&
        !bindings.has(node.name.text)
      ) {
        bindings.add(node.name.text);
        changed = true;
      }
    });
  }
  return bindings;
}

function variableInitializers(scope) {
  const declarations = new Map();
  visitSourceNodes(scope, (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      declarations.set(node.name.text, node.initializer);
    }
  });
  return declarations;
}

function resolveExpression(expression, declarations) {
  let current = expression;
  const seen = new Set();
  while (ts.isIdentifier(current) && declarations.has(current.text) && !seen.has(current.text)) {
    seen.add(current.text);
    current = declarations.get(current.text);
  }
  return current;
}

function propertyValue(object, name) {
  if (!ts.isObjectLiteralExpression(object)) return null;
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) {
      continue;
    }
    const propertyName =
      property.name && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
        ? property.name.text
        : null;
    if (propertyName !== name) continue;
    return ts.isShorthandPropertyAssignment(property) ? property.name : property.initializer;
  }
  return null;
}

function declarationForCall(call) {
  let current = call.parent;
  while (current && !ts.isVariableDeclaration(current) && !ts.isFunctionLike(current)) {
    current = current.parent;
  }
  return current && ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)
    ? current.name.text
    : null;
}

function referencesIdentifier(node, name) {
  if (!node) return false;
  let found = false;
  visitSourceNodes(node, (child) => {
    if (ts.isIdentifier(child) && child.text === name) found = true;
  });
  return found;
}

function referencesAnyIdentifier(node, names) {
  return Boolean(node) && [...names].some((name) => referencesIdentifier(node, name));
}

function collectPolicyVariables(declarations, imports, validators) {
  const validatedVariables = new Set();
  const authorityVariables = new Set();
  for (const [name, initializer] of declarations) {
    if (!ts.isCallExpression(initializer)) continue;
    if (validators.has(callName(initializer.expression))) validatedVariables.add(name);
    const binding = imports.get(callName(initializer.expression));
    if (
      binding?.imported === 'beginWebSnapshotAssetFetch' &&
      /(?:^|\/)session$/u.test(binding.module)
    ) {
      authorityVariables.add(name);
    }
  }
  return { authorityVariables, validatedVariables };
}

function hasBoundRequestOptions(call, declarations, authorityVariables) {
  const options = call.arguments[1] ? resolveExpression(call.arguments[1], declarations) : null;
  const credentialsValue = options && propertyValue(options, 'credentials');
  const redirectValue = options && propertyValue(options, 'redirect');
  const signalValue = options && propertyValue(options, 'signal');
  const credentials = credentialsValue && resolveExpression(credentialsValue, declarations);
  const redirect = redirectValue && resolveExpression(redirectValue, declarations);
  const signal = signalValue && resolveExpression(signalValue, declarations);
  if (!credentials || !ts.isStringLiteralLike(credentials) || credentials.text !== 'omit') {
    return false;
  }
  return [...authorityVariables].some(
    (name) => referencesIdentifier(redirect, name) && referencesIdentifier(signal, name)
  );
}

function collectDerivedResponseVariables(call, declarations, sourceFile) {
  const responseName = declarationForCall(call);
  if (!responseName) return null;
  const derivedResponseVariables = new Set([responseName]);
  for (const [name, initializer] of declarations) {
    if (
      initializer.getStart(sourceFile) > call.getStart(sourceFile) &&
      referencesIdentifier(initializer, responseName)
    ) {
      derivedResponseVariables.add(name);
    }
  }
  return { derivedResponseVariables, responseName };
}

function hasBoundResponsePolicy(call, scope, declarations, sourceFile, validators) {
  const response = collectDerivedResponseVariables(call, declarations, sourceFile);
  if (!response) return false;
  const { derivedResponseVariables, responseName } = response;
  let finalUrlValidated = false;
  let redirectRejected = false;
  visitSourceNodes(scope, (node) => {
    if (node.getStart(sourceFile) <= call.getStart(sourceFile)) return;
    if (
      ts.isCallExpression(node) &&
      validators.has(callName(node.expression)) &&
      node.arguments[0] &&
      referencesAnyIdentifier(node.arguments[0], derivedResponseVariables)
    ) {
      finalUrlValidated = true;
    }
    if (ts.isIfStatement(node)) {
      const condition = node.expression.getText(sourceFile);
      let throws = false;
      visitSourceNodes(node.thenStatement, (child) => {
        if (ts.isThrowStatement(child)) throws = true;
      });
      if (
        throws &&
        referencesIdentifier(node.expression, responseName) &&
        /\.(?:status|type)\b/u.test(condition)
      ) {
        redirectRejected = true;
      }
    }
  });
  return finalUrlValidated && redirectRejected;
}

function hasBoundPolicy(call, sourceFile, imports, validators) {
  const scope = functionScope(call);
  if (!scope) return false;
  const declarations = variableInitializers(scope);
  const { authorityVariables, validatedVariables } = collectPolicyVariables(
    declarations,
    imports,
    validators
  );
  if (!referencesAnyIdentifier(call.arguments[0], validatedVariables)) return false;
  if (!hasBoundRequestOptions(call, declarations, authorityVariables)) return false;
  return hasBoundResponsePolicy(call, scope, declarations, sourceFile, validators);
}

export function collectNetworkFetchPolicyViolations(
  files,
  { policyPath = POLICY_PATH, rootDir = repoRoot } = {}
) {
  const entries = readPolicy(rootDir, policyPath).anonymousPublicFetchOwners ?? [];
  const violations = collectPolicyRegistryViolations(
    entries,
    policyPath,
    'anonymous-public-fetch',
    rootDir
  );
  const owners = new Set(entries.map((entry) => entry.file));
  const seenOwners = new Set();
  const scannedPaths = new Set(files.map((file) => toRootRelativePath(rootDir, file)));

  for (const filePath of files) {
    const relativePath = toRootRelativePath(rootDir, filePath);
    if (!owners.has(relativePath)) continue;
    const sourceFile = getSourceSnapshot({ filePath }).sourceFile;
    const imports = namedImports(sourceFile);
    const validators = urlValidators(sourceFile, imports);
    const bindings = fetchBindings(sourceFile);
    let sinkCount = 0;
    visitSourceNodes(sourceFile, (node) => {
      if (!ts.isCallExpression(node) || !bindings.has(callName(node.expression))) return;
      sinkCount += 1;
      if (!hasBoundPolicy(node, sourceFile, imports, validators)) {
        violations.push({
          rule: 'network-fetch-policy-missing',
          file: relativePath,
          line: getNodeLine(sourceFile, node),
          message: MESSAGE,
        });
      }
    });
    if (sinkCount > 0) seenOwners.add(relativePath);
  }

  for (const entry of entries) {
    if (scannedPaths.has(entry.file) && !seenOwners.has(entry.file)) {
      violations.push({
        rule: 'network-fetch-policy-stale-owner',
        file: policyPath,
        message: `Anonymous public fetch owner ${entry.file} contains no classified fetch sink.`,
      });
    }
  }
  return violations;
}

export function runNetworkFetchPolicyCheck({ files = [], scope = 'workspace' } = {}) {
  const fullClosure = files.some((file) => {
    const relativePath = toRootRelativePath(repoRoot, file);
    return relativePath === POLICY_PATH || relativePath === ANALYZER_PATH;
  });
  return runGuardrailCheck({
    collectViolations: collectNetworkFetchPolicyViolations,
    files,
    scope: fullClosure ? 'repo-wide' : scope,
  });
}

runIfExecutedAsScript(import.meta.url, {
  collectViolations: collectNetworkFetchPolicyViolations,
  label: 'Network fetch policy',
});

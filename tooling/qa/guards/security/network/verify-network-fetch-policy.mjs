import path from 'node:path';
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
  'pre-network redirect blocking, redirect policy, and final-URL revalidation to this sink.';
const HEAD_MESSAGE =
  'Guarded HEAD fetch must bind public HTTPS validation, anonymous HEAD/follow/no-referrer/no-store, ' +
  'an AbortSignal, the awaited canonical imported default guard, and final-URL revalidation.';

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

function hasPreNetworkRedirectGuard(call, scope, imports, sourceFile) {
  let guarded = false;
  visitSourceNodes(scope, (node) => {
    if (!ts.isCallExpression(node) || node.getStart(sourceFile) >= call.getStart(sourceFile))
      return;
    const binding = imports.get(callName(node.expression));
    if (binding?.imported !== 'ensureWebSnapshotRedirectNetworkGuard') return;
    if (!/(?:^|\/)redirect-network-guard$/u.test(binding.module)) return;
    if (!ts.isAwaitExpression(node.parent)) return;
    if (functionScope(node) === scope) guarded = true;
  });
  return guarded;
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
  if (!hasPreNetworkRedirectGuard(call, scope, imports, sourceFile)) return false;
  return hasBoundResponsePolicy(call, scope, declarations, sourceFile, validators);
}

const HEAD_OWNER = 'apps/extension/src/platform/network/https-redirects.ts';
const HEAD_GUARD = 'apps/extension/src/platform/network/https-redirect-guard';

function isProperty(node, object, property) {
  return (
    Boolean(node) &&
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === object &&
    node.name.text === property
  );
}

function isHeadValidator(node, imports) {
  if (!ts.isFunctionDeclaration(node) || !node.body || !node.name) return false;
  const declaration = node.body.statements[0];
  if (!declaration || !ts.isVariableStatement(declaration)) return false;
  const parsed = declaration.declarationList.declarations[0];
  if (
    !parsed ||
    !ts.isIdentifier(parsed.name) ||
    !parsed.initializer ||
    !ts.isNewExpression(parsed.initializer) ||
    callName(parsed.initializer.expression) !== 'URL'
  )
    return false;
  const input = node.parameters[0]?.name;
  const returned = node.body.statements.at(-1);
  if (
    !input ||
    !ts.isIdentifier(input) ||
    node.parameters.length !== 1 ||
    parsed.initializer.arguments?.length !== 1 ||
    !ts.isIdentifier(parsed.initializer.arguments[0]) ||
    parsed.initializer.arguments[0].text !== input.text ||
    !returned ||
    !ts.isReturnStatement(returned) ||
    !returned.expression ||
    !ts.isIdentifier(returned.expression) ||
    returned.expression.text !== parsed.name.text
  )
    return false;
  const rejection = node.body.statements[1];
  if (!rejection || !ts.isIfStatement(rejection) || !ts.isThrowStatement(rejection.thenStatement))
    return false;
  const terms = [];
  function collectTerms(expression) {
    if (
      ts.isBinaryExpression(expression) &&
      expression.operatorToken.kind === ts.SyntaxKind.BarBarToken
    ) {
      collectTerms(expression.left);
      collectTerms(expression.right);
    } else terms.push(expression);
  }
  collectTerms(rejection.expression);
  const name = parsed.name.text;
  return (
    ['username', 'password'].every((property) =>
      terms.some((term) => isProperty(term, name, property))
    ) &&
    terms.some(
      (term) =>
        ts.isBinaryExpression(term) &&
        term.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken &&
        isProperty(term.left, name, 'protocol') &&
        ts.isStringLiteral(term.right) &&
        term.right.text === 'https:'
    ) &&
    terms.some(
      (term) =>
        ts.isCallExpression(term) &&
        imports.get(callName(term.expression))?.imported === 'isPrivateNetworkHost' &&
        imports.get(callName(term.expression))?.module ===
          '@sniptale/platform/security/private-network-host' &&
        isProperty(term.arguments[0], name, 'hostname')
    )
  );
}

function hasHeadGuard(call, scope, imports, relativePath, sourceFile) {
  const guardParameter = scope.parameters.find((parameter) => {
    if (!parameter.initializer || !ts.isIdentifier(parameter.name)) return false;
    const binding = imports.get(callName(parameter.initializer));
    return (
      binding?.imported === 'ensurePublicHttpsHeadGuard' &&
      path.posix.normalize(path.posix.join(path.posix.dirname(relativePath), binding.module)) ===
        HEAD_GUARD
    );
  });
  if (!guardParameter || !scope.body || !ts.isBlock(scope.body)) return false;
  return scope.body.statements.some((statement) => {
    if (!ts.isExpressionStatement(statement) || !ts.isAwaitExpression(statement.expression))
      return false;
    const guard = statement.expression.expression;
    return (
      ts.isCallExpression(guard) &&
      callName(guard.expression) === guardParameter.name.text &&
      guard.arguments.length === 0 &&
      statement.end < call.getStart(sourceFile)
    );
  });
}

function hasBoundHeadPolicy(call, sourceFile, imports, relativePath) {
  if (relativePath !== HEAD_OWNER) return false;
  const scope = functionScope(call);
  if (!scope || !scope.body || !ts.isBlock(scope.body)) return false;
  const validators = new Set(
    sourceFile.statements
      .filter((node) => isHeadValidator(node, imports))
      .map((node) => node.name.text)
  );
  const declarations = variableInitializers(scope);
  const target = call.arguments[0];
  if (
    !target ||
    !ts.isPropertyAccessExpression(target) ||
    target.name.text !== 'href' ||
    !ts.isIdentifier(target.expression)
  )
    return false;
  const validation = declarations.get(target.expression.text);
  if (
    !validation ||
    !ts.isCallExpression(validation) ||
    !validators.has(callName(validation.expression)) ||
    validation.getStart(sourceFile) >= call.getStart(sourceFile)
  )
    return false;
  const options = call.arguments[1];
  const literals = {
    method: 'HEAD',
    credentials: 'omit',
    redirect: 'follow',
    referrerPolicy: 'no-referrer',
    cache: 'no-store',
  };
  if (
    !options ||
    !ts.isObjectLiteralExpression(options) ||
    options.properties.length !== 6 ||
    !Object.entries(literals).every(([name, value]) => {
      const option = propertyValue(options, name);
      return option && ts.isStringLiteral(option) && option.text === value;
    })
  )
    return false;
  const signal = propertyValue(options, 'signal');
  if (
    !signal ||
    !ts.isIdentifier(signal) ||
    !scope.parameters.some(
      (parameter) =>
        ts.isIdentifier(parameter.name) &&
        parameter.name.text === signal.text &&
        parameter.type &&
        ts.isTypeReferenceNode(parameter.type) &&
        callName(parameter.type.typeName) === 'AbortSignal'
    )
  )
    return false;
  if (!hasHeadGuard(call, scope, imports, relativePath, sourceFile)) return false;
  const responseName = declarationForCall(call);
  if (!responseName) return false;
  return scope.body.statements.some((statement) => {
    if (statement.getStart(sourceFile) <= call.getStart(sourceFile)) return false;
    const expression = ts.isVariableStatement(statement)
      ? statement.declarationList.declarations[0]?.initializer
      : ts.isExpressionStatement(statement)
        ? statement.expression
        : null;
    return (
      expression &&
      ts.isCallExpression(expression) &&
      validators.has(callName(expression.expression)) &&
      isProperty(expression.arguments[0], responseName, 'url')
    );
  });
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
  const owners = new Map(entries.map((entry) => [entry.file, entry]));
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
      const requestPolicy = owners.get(relativePath)?.requestPolicy;
      const valid =
        requestPolicy === 'guarded-head'
          ? hasBoundHeadPolicy(node, sourceFile, imports, relativePath)
          : requestPolicy === undefined && hasBoundPolicy(node, sourceFile, imports, validators);
      if (!valid) {
        violations.push({
          rule: 'network-fetch-policy-missing',
          file: relativePath,
          line: getNodeLine(sourceFile, node),
          message: requestPolicy === 'guarded-head' ? HEAD_MESSAGE : MESSAGE,
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

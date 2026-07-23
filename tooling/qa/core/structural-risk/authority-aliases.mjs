import { createLexicalBindingKey, getTransparentExpressionRoot, ts } from './ast.mjs';
import { collectReactRefBindings } from './react-ref-provenance.mjs';

function unwrapExpression(node) {
  let current = node;
  while (
    current &&
    (ts.isParenthesizedExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      current.kind === ts.SyntaxKind.SatisfiesExpression)
  ) {
    current = current.expression;
  }
  return current;
}

function propertySegment(node) {
  if (ts.isStringLiteral(node) || ts.isNumericLiteral(node)) {
    return node.text;
  }
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

function encodePathSegment(segment) {
  if (segment === '') return '%00';
  return segment.replaceAll('%', '%25').replaceAll('.', '%2E');
}

function decodePathSegment(segment) {
  return segment === '%00' ? '' : decodeURIComponent(segment);
}

function expressionBindingKey(node, sourceFile) {
  let current = unwrapExpression(node);
  const properties = [];
  while (
    current &&
    (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current))
  ) {
    if (ts.isPropertyAccessExpression(current)) properties.unshift(current.name.text);
    else if (current.argumentExpression) {
      const segment = propertySegment(current.argumentExpression);
      if (segment == null) return null;
      properties.unshift(segment);
    }
    current = unwrapExpression(current.expression);
  }
  if (!current || (!ts.isIdentifier(current) && current.kind !== ts.SyntaxKind.ThisKeyword)) {
    return null;
  }
  return createLexicalBindingKey(
    current,
    sourceFile,
    properties.map((part) => `.${encodePathSegment(part)}`).join('')
  );
}

function functionBindingIdentifier(node) {
  if (node.name && ts.isIdentifier(node.name)) return node.name;
  const parent = node.parent;
  return ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name) ? parent.name : null;
}

function isFunctionNode(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  );
}

function collectLocalFunctions(sourceFile) {
  const functions = new Map();
  function visit(node) {
    if (isFunctionNode(node)) {
      const binding = functionBindingIdentifier(node);
      if (binding) functions.set(createLexicalBindingKey(binding, sourceFile), node);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return functions;
}

function hasExportModifier(node) {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return modifiers?.some(
    (modifier) =>
      modifier.kind === ts.SyntaxKind.ExportKeyword ||
      modifier.kind === ts.SyntaxKind.DefaultKeyword
  );
}

function directlyExportedFunction(node) {
  if (hasExportModifier(node) || ts.isExportAssignment(getTransparentExpressionRoot(node).parent)) {
    return true;
  }
  let current = node.parent;
  while (current && !ts.isSourceFile(current)) {
    if (current !== node.parent && isFunctionNode(current)) return false;
    if (ts.isVariableStatement(current)) return hasExportModifier(current) ?? false;
    current = current.parent;
  }
  return false;
}

function directCallForReference(node) {
  const current = getTransparentExpressionRoot(node);
  const parent = current.parent;
  return ts.isCallExpression(parent) && parent.expression === current ? parent : null;
}

function collectCallsByFunction(sourceFile, localFunctions) {
  const calls = new Map(
    [...localFunctions.values()].map((node) => [
      node,
      { calls: [], complete: !directlyExportedFunction(node) },
    ])
  );
  const bindingIdentifiers = new Set(
    [...localFunctions.values()].map(functionBindingIdentifier).filter(Boolean)
  );
  function visit(node) {
    if (ts.isIdentifier(node) && !bindingIdentifiers.has(node)) {
      const target = localFunctions.get(createLexicalBindingKey(node, sourceFile));
      const call = target ? directCallForReference(node) : null;
      const callInfo = target ? calls.get(target) : null;
      if (callInfo && call) callInfo.calls.push(call);
      else if (callInfo) callInfo.complete = false;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return calls;
}

function collectBindingElements(name, path = []) {
  if (ts.isIdentifier(name)) return [{ binding: name, path }];
  if (!ts.isObjectBindingPattern(name)) return [];
  return name.elements.flatMap((element) => {
    if (element.dotDotDotToken) return [];
    const property = element.propertyName ?? element.name;
    const segment =
      ts.isIdentifier(property) || ts.isStringLiteral(property) ? property.text : null;
    return segment ? collectBindingElements(element.name, [...path, segment]) : [];
  });
}

function collectParameterAliases(sourceFile, callsByFunction) {
  const aliases = new Map();
  for (const [node, callInfo] of callsByFunction) {
    for (const [index, parameter] of node.parameters.entries()) {
      for (const { binding, path } of collectBindingElements(parameter.name)) {
        aliases.set(createLexicalBindingKey(binding, sourceFile), {
          calls: callInfo.calls,
          complete: callInfo.complete,
          index,
          path,
        });
      }
    }
  }
  return aliases;
}

function appendPath(key, path) {
  return `${key}${path.map((segment) => `.${encodePathSegment(segment)}`).join('')}`;
}

function objectPropertyValue(objectLiteral, segment) {
  for (const property of objectLiteral.properties) {
    if (ts.isShorthandPropertyAssignment(property) && property.name.text === segment) {
      return property.name;
    }
    if (!ts.isPropertyAssignment(property)) continue;
    const name = property.name;
    const propertyName =
      ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)
        ? name.text
        : null;
    if (propertyName === segment) return property.initializer;
  }
  return null;
}

function resolveArgumentKey(argument, path, sourceFile) {
  const current = unwrapExpression(argument);
  if (!current) return null;
  if (path.length > 0 && ts.isObjectLiteralExpression(current)) {
    const value = objectPropertyValue(current, path[0]);
    return value ? resolveArgumentKey(value, path.slice(1), sourceFile) : null;
  }
  const key = expressionBindingKey(current, sourceFile);
  return key ? appendPath(key, path) : null;
}

function collectConstAliases(sourceFile) {
  const aliases = new Map();
  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      ts.isVariableDeclarationList(node.parent) &&
      (node.parent.flags & ts.NodeFlags.Const) !== 0
    ) {
      const sourceKey = expressionBindingKey(node.initializer, sourceFile);
      if (sourceKey) {
        for (const { binding, path } of collectBindingElements(node.name)) {
          aliases.set(createLexicalBindingKey(binding, sourceFile), appendPath(sourceKey, path));
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return aliases;
}

function splitBindingKey(key, candidates) {
  return [...candidates]
    .filter((candidate) => key === candidate || key.startsWith(`${candidate}.`))
    .sort((left, right) => right.length - left.length)[0];
}

function canonicalAuthorityKey(key, reactRefBindings) {
  const at = key.indexOf('@');
  if (at === -1) return key;
  const propertyStart = key.indexOf('.', at);
  if (propertyStart === -1) return key;
  const root = key.slice(0, propertyStart);
  const rawProperties = key
    .slice(propertyStart + 1)
    .split('.')
    .filter(Boolean);
  if (reactRefBindings.has(root) && rawProperties[0] === 'current') return root;
  const properties = rawProperties.filter((property) => property !== 'current');
  return properties.length === 0 ? root : `${root}.${properties[0]}`;
}

function collectParameterCallAuthorities(key, parameterBase, descriptor, context, visitedAliases) {
  const suffix = key.slice(parameterBase.length).split('.').filter(Boolean);
  const resolved = new Set();
  let unresolved = !descriptor.complete;
  for (const call of descriptor.calls) {
    const argument = call.arguments[descriptor.index];
    const target = argument
      ? resolveArgumentKey(argument, [...descriptor.path, ...suffix], context.sourceFile)
      : null;
    if (!target) {
      unresolved = true;
      continue;
    }
    for (const authority of resolveAuthorityKey(target, context, visitedAliases)) {
      resolved.add(authority);
    }
  }
  if (unresolved || resolved.size === 0) {
    resolved.add(canonicalAuthorityKey(key, context.reactRefBindings));
  }
  return resolved;
}

function resolveConstAuthority(key, constBase, context, visitedAliases) {
  const aliasId = `const:${constBase}`;
  if (visitedAliases.has(aliasId)) {
    return new Set([canonicalAuthorityKey(key, context.reactRefBindings)]);
  }
  const target = `${context.constAliases.get(constBase)}${key.slice(constBase.length)}`;
  return resolveAuthorityKey(target, context, new Set(visitedAliases).add(aliasId));
}

function resolveParameterAuthority(key, parameterBase, context, visitedAliases) {
  const aliasId = `parameter:${parameterBase}`;
  if (visitedAliases.has(aliasId)) {
    return new Set([canonicalAuthorityKey(key, context.reactRefBindings)]);
  }
  const descriptor = context.parameterAliases.get(parameterBase);
  if (!descriptor || descriptor.calls.length === 0) {
    return new Set([canonicalAuthorityKey(key, context.reactRefBindings)]);
  }
  return collectParameterCallAuthorities(
    key,
    parameterBase,
    descriptor,
    context,
    new Set(visitedAliases).add(aliasId)
  );
}

function resolveAuthorityKey(key, context, visitedAliases = new Set()) {
  const constBase = splitBindingKey(key, context.constAliases.keys());
  if (constBase) return resolveConstAuthority(key, constBase, context, visitedAliases);
  const parameterBase = splitBindingKey(key, context.parameterAliases.keys());
  return parameterBase
    ? resolveParameterAuthority(key, parameterBase, context, visitedAliases)
    : new Set([canonicalAuthorityKey(key, context.reactRefBindings)]);
}

export function resolveFileStateAuthorityKeys(sourceFile, keys) {
  const localFunctions = collectLocalFunctions(sourceFile);
  const callsByFunction = collectCallsByFunction(sourceFile, localFunctions);
  const context = {
    sourceFile,
    constAliases: collectConstAliases(sourceFile),
    parameterAliases: collectParameterAliases(sourceFile, callsByFunction),
    reactRefBindings: collectReactRefBindings(sourceFile),
  };
  const resolved = new Set();
  for (const key of keys) {
    for (const authority of resolveAuthorityKey(key, context)) resolved.add(authority);
  }
  return [...resolved].sort();
}

export function authorityNameFromKey(key) {
  const at = key.indexOf('@');
  if (at === -1) return key;
  const propertyStart = key.indexOf('.', at);
  const root = key.slice(0, at);
  if (propertyStart === -1) return root;
  const properties = key
    .slice(propertyStart + 1)
    .split('.')
    .map(decodePathSegment);
  return `${root}.${properties.join('.')}`;
}

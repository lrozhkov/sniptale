import { ts, unwrapExpression } from './ast.mjs';

const COMPOSITE_SESSION_ANCHOR_PATTERN = /(?:Persistence|Sync|Transaction|Workflow)Session$/u;
const COMPOSITE_SESSION_MEMBER_PATTERN = /(?:^(?:set|update|dispatch|commit)[A-Z]|Ref$)/u;
const AMBIGUOUS_COMPOSITE_SESSION = '<ambiguous-composite-session>';

function objectPropertyDescriptor(property) {
  if (ts.isShorthandPropertyAssignment(property)) {
    return { name: property.name.text, value: property.name };
  }
  if (!ts.isPropertyAssignment(property)) return null;
  const name = property.name;
  const propertyName =
    ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)
      ? name.text
      : null;
  return propertyName ? { name: propertyName, value: property.initializer } : null;
}

function recordAlias(aliases, memberKey, anchorKey) {
  const anchors = aliases.get(memberKey) ?? new Set();
  anchors.add(anchorKey);
  aliases.set(memberKey, anchors);
}

function recordAmbiguousMembers(properties, aliases, getExpressionBindingKey) {
  for (const property of properties) {
    if (!COMPOSITE_SESSION_MEMBER_PATTERN.test(property.name)) continue;
    const memberKey = getExpressionBindingKey(property.value);
    if (memberKey) recordAlias(aliases, memberKey, AMBIGUOUS_COMPOSITE_SESSION);
  }
}

function collectArgumentAliases(argument, aliases, getExpressionBindingKey) {
  const current = unwrapExpression(argument);
  if (!current || !ts.isObjectLiteralExpression(current)) return;
  const properties = current.properties.map(objectPropertyDescriptor).filter(Boolean);
  if (properties.length !== current.properties.length) {
    recordAmbiguousMembers(properties, aliases, getExpressionBindingKey);
    return;
  }
  const anchors = properties.filter(({ name }) => COMPOSITE_SESSION_ANCHOR_PATTERN.test(name));
  if (anchors.length !== 1) {
    if (anchors.length > 1) recordAmbiguousMembers(properties, aliases, getExpressionBindingKey);
    return;
  }
  const anchorKey = getExpressionBindingKey(anchors[0].value);
  if (!anchorKey) {
    recordAmbiguousMembers(properties, aliases, getExpressionBindingKey);
    return;
  }
  for (const property of properties) {
    if (!COMPOSITE_SESSION_MEMBER_PATTERN.test(property.name)) continue;
    const memberKey = getExpressionBindingKey(property.value);
    if (memberKey && memberKey !== anchorKey) recordAlias(aliases, memberKey, anchorKey);
  }
}

function collectCandidateAliases(sourceFile, localFunctions, getExpressionBindingKey) {
  const aliases = new Map();
  function visit(node) {
    const isLocalCall =
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      localFunctions.has(getExpressionBindingKey(node.expression));
    if (isLocalCall) {
      for (const argument of node.arguments) {
        collectArgumentAliases(argument, aliases, getExpressionBindingKey);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return aliases;
}

export function collectCompositeSessionAliases(
  sourceFile,
  localFunctions,
  getExpressionBindingKey
) {
  const aliases = collectCandidateAliases(sourceFile, localFunctions, getExpressionBindingKey);
  return new Map(
    [...aliases].flatMap(([memberKey, anchors]) =>
      anchors.size === 1 && !anchors.has(AMBIGUOUS_COMPOSITE_SESSION)
        ? [[memberKey, [...anchors][0]]]
        : []
    )
  );
}

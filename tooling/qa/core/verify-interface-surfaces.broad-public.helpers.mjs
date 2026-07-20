import fs from 'node:fs';
import ts from 'typescript';

import { toRelativePath } from './shared.mjs';

const BROAD_RETURN_KEY_THRESHOLD = 10;
const BROAD_SPREAD_THRESHOLD = 2;
const BROAD_INTERSECTION_THRESHOLD = 3;

function createViolation(rule, file, message, line) {
  return { rule, file, line, message };
}

function getNodeLine(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function isExported(node) {
  return Boolean(node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

function unwrapExpression(expression) {
  let current = expression;
  while (ts.isParenthesizedExpression(current)) {
    current = current.expression;
  }
  return current;
}

function getReturnedObjectLiteral(functionNode) {
  if (!functionNode.body || !ts.isBlock(functionNode.body)) {
    return null;
  }

  for (const statement of functionNode.body.statements) {
    if (!ts.isReturnStatement(statement) || !statement.expression) {
      continue;
    }

    const expression = unwrapExpression(statement.expression);
    if (ts.isObjectLiteralExpression(expression)) {
      return expression;
    }
  }

  return null;
}

function isControllerOrHookName(name) {
  return /^use[A-Z]/u.test(name) || /Controller/u.test(name);
}

function getExportedFunctionName(node) {
  if (ts.isFunctionDeclaration(node) && isExported(node) && node.name) {
    return node.name.text;
  }

  if (
    ts.isVariableStatement(node) &&
    isExported(node) &&
    node.declarationList.declarations.length === 1
  ) {
    const declaration = node.declarationList.declarations[0];
    if (
      ts.isIdentifier(declaration.name) &&
      declaration.initializer &&
      (ts.isArrowFunction(declaration.initializer) ||
        ts.isFunctionExpression(declaration.initializer))
    ) {
      return declaration.name.text;
    }
  }

  return null;
}

function getExportedFunctionNode(node) {
  if (ts.isFunctionDeclaration(node)) {
    return node;
  }

  if (ts.isVariableStatement(node)) {
    return node.declarationList.declarations[0]?.initializer ?? null;
  }

  return null;
}

function collectBroadObjectReturnSurface(sourceFile, node) {
  const functionName = getExportedFunctionName(node);
  if (!functionName || !isControllerOrHookName(functionName)) {
    return null;
  }

  const functionNode = getExportedFunctionNode(node);
  const objectLiteral = functionNode ? getReturnedObjectLiteral(functionNode) : null;
  if (!objectLiteral) {
    return null;
  }

  const spreadCount = objectLiteral.properties.filter(ts.isSpreadAssignment).length;
  const keyCount = objectLiteral.properties.length;
  if (spreadCount < BROAD_SPREAD_THRESHOLD && keyCount < BROAD_RETURN_KEY_THRESHOLD) {
    return null;
  }

  return { functionName, keyCount, objectLiteral, spreadCount };
}

function createBroadObjectReturnViolation(relativePath, sourceFile, surface) {
  return createViolation(
    'broad-public-surface-return',
    relativePath,
    [
      `Exported "${surface.functionName}" returns a broad object surface`,
      `(${surface.spreadCount} spreads, ${surface.keyCount} keys). Split by public role contract.`,
    ].join(' '),
    getNodeLine(sourceFile, surface.objectLiteral)
  );
}

function collectBroadObjectReturnShape(relativePath, sourceFile, node) {
  const surface = collectBroadObjectReturnSurface(sourceFile, node);
  if (!surface) return null;

  return {
    key: `return:${surface.functionName}`,
    keyCount: surface.keyCount,
    spreadCount: surface.spreadCount,
    violation: createBroadObjectReturnViolation(relativePath, sourceFile, surface),
  };
}

function collectBroadTypeSurfaceViolation(relativePath, sourceFile, node) {
  if (
    !ts.isTypeAliasDeclaration(node) ||
    !isExported(node) ||
    !ts.isIntersectionTypeNode(node.type)
  ) {
    return null;
  }

  const typeName = node.name.text;
  if (
    !/(?:State|Controller|ControllerState)$/u.test(typeName) ||
    node.type.types.length < BROAD_INTERSECTION_THRESHOLD
  ) {
    return null;
  }

  return createViolation(
    'broad-public-surface-type',
    relativePath,
    [
      `Exported "${typeName}" composes ${node.type.types.length} role types into one`,
      'public surface. Expose role-specific interfaces.',
    ].join(' '),
    getNodeLine(sourceFile, node)
  );
}

function collectBroadTypeSurfaceShape(relativePath, sourceFile, node) {
  const violation = collectBroadTypeSurfaceViolation(relativePath, sourceFile, node);
  if (!violation || !ts.isTypeAliasDeclaration(node) || !ts.isIntersectionTypeNode(node.type)) {
    return null;
  }

  return {
    key: `type:${node.name.text}`,
    memberCount: node.type.types.length,
    violation,
  };
}

function collectBroadPublicSurfaceShapes(relativePath, text) {
  const sourceFile = ts.createSourceFile(relativePath, text, ts.ScriptTarget.Latest, true);
  return sourceFile.statements.flatMap((statement) =>
    [
      collectBroadObjectReturnShape(relativePath, sourceFile, statement),
      collectBroadTypeSurfaceShape(relativePath, sourceFile, statement),
    ].filter(Boolean)
  );
}

function didBroadShapeGrow(current, previous) {
  if (!previous) {
    return true;
  }
  if ('memberCount' in current) {
    return !('memberCount' in previous) || current.memberCount > previous.memberCount;
  }
  return (
    'memberCount' in previous ||
    current.keyCount > previous.keyCount ||
    current.spreadCount > previous.spreadCount
  );
}

function isTestLikeSurfacePath(relativePath) {
  return (
    /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(relativePath) ||
    /\.test-support\.[cm]?[jt]sx?$/u.test(relativePath) ||
    /(?:^|\/)(?:test|tests|test-support|fixtures?|harness)(?:\/|$)/u.test(relativePath)
  );
}

export function collectBroadPublicSurfaceViolations(files, { getPreviousSource = null } = {}) {
  const violations = [];

  for (const filePath of files) {
    const relativePath = toRelativePath(filePath);
    if (isTestLikeSurfacePath(relativePath)) {
      continue;
    }
    const text = fs.readFileSync(filePath, 'utf8');
    const currentShapes = collectBroadPublicSurfaceShapes(relativePath, text);
    const previousText = getPreviousSource?.(relativePath) ?? null;
    const previousShapes = new Map(
      previousText
        ? collectBroadPublicSurfaceShapes(relativePath, previousText).map((shape) => [
            shape.key,
            shape,
          ])
        : []
    );

    for (const shape of currentShapes) {
      if (didBroadShapeGrow(shape, previousShapes.get(shape.key))) {
        violations.push(shape.violation);
      }
    }
  }

  return violations;
}

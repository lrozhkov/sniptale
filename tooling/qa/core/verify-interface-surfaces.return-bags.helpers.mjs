import ts from 'typescript';

import { createHeadFileTextResolver } from './git-head-sources.mjs';
import { toRelativePath } from './shared.mjs';
import { collectSurfaceMaps, didSurfaceGrow } from './surface-growth.helpers.mjs';
import {
  createTypeScriptSourceFile,
  getFunctionLikeName,
  getNodeLine,
} from './typescript-ast-helpers.mjs';

const RETURN_BAG_NAME_PATTERN =
  /^(?:use|build|create)[A-Z][A-Za-z0-9]*(?:State|ViewState|Controller|Bindings|Runtime|Props)$/u;
const RETURN_BAG_IGNORE_PATTERNS = [
  /\.test-support\.[cm]?[jt]sx?$/u,
  /\.test-helpers\.[cm]?[jt]sx?$/u,
  /\/test-support\.[cm]?[jt]sx?$/u,
  /\/test-helpers\.[cm]?[jt]sx?$/u,
  /\/test-support\//u,
  /\/test-harness\//u,
  /\/fixtures\//u,
];

function createViolation(rule, file, message, line) {
  return { rule, file, line, message };
}

function hasExportModifier(node) {
  return Boolean(node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

function isExportedFunction(node) {
  if (ts.isFunctionDeclaration(node)) {
    return hasExportModifier(node);
  }

  if (
    (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
    ts.isVariableDeclaration(node.parent)
  ) {
    const statement = node.parent.parent?.parent;
    return ts.isVariableStatement(statement) && hasExportModifier(statement);
  }

  return false;
}

function collectReturnedObjectSurfaceMetrics(sourceFile, node) {
  let maxMembers = 0;
  let firstLine = getNodeLine(sourceFile, node);

  const visitReturn = (current) => {
    if (
      ts.isReturnStatement(current) &&
      current.expression &&
      ts.isObjectLiteralExpression(current.expression)
    ) {
      maxMembers = Math.max(maxMembers, current.expression.properties.length);
      firstLine = getNodeLine(sourceFile, current.expression);
    }

    if (
      ts.isArrowFunction(current) &&
      ts.isObjectLiteralExpression(current.body) &&
      current === node
    ) {
      maxMembers = Math.max(maxMembers, current.body.properties.length);
      firstLine = getNodeLine(sourceFile, current.body);
    }

    ts.forEachChild(current, visitReturn);
  };

  if (node.body) {
    visitReturn(node.body);
  }

  return { maxMembers, firstLine };
}

function collectReturnedObjectSurfaces(sourceFile) {
  const surfaces = new Map();

  const visit = (node) => {
    const functionName = getFunctionLikeName(node);
    if (functionName && isExportedFunction(node) && RETURN_BAG_NAME_PATTERN.test(functionName)) {
      const { maxMembers, firstLine } = collectReturnedObjectSurfaceMetrics(sourceFile, node);
      if (maxMembers > 0) {
        surfaces.set(functionName, {
          name: functionName,
          members: maxMembers,
          line: firstLine,
        });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return surfaces;
}

function shouldInspectReturnedObjectSurfaceFile(relativePath) {
  if (!/\.(?:ts|tsx)$/u.test(relativePath) || relativePath.endsWith('.d.ts')) {
    return false;
  }

  return !RETURN_BAG_IGNORE_PATTERNS.some((pattern) => pattern.test(relativePath));
}

function createReturnedObjectSurfaceMessage(surface, previousSurface, memberLimit) {
  if (!previousSurface) {
    return [
      `Introduces broad returned object surface "${surface.name}" with ${surface.members}`,
      `properties (advisory limit ${memberLimit}). Narrow the controller/state bag before it`,
      'becomes the canonical surface.',
    ].join(' ');
  }

  return [
    `Grows returned object surface "${surface.name}" from ${previousSurface.members}`,
    `to ${surface.members} properties (advisory limit ${memberLimit}). Consider splitting`,
    'the controller/state bag before the surface grows further.',
  ].join(' ');
}

export function collectReturnedObjectSurfaceAdvisories(
  files,
  { getPreviousSource = null, memberLimit = 20 } = {}
) {
  const advisories = [];
  const resolvePreviousSource =
    getPreviousSource ??
    createHeadFileTextResolver(files.map((filePath) => toRelativePath(filePath)));

  for (const filePath of files) {
    const relativePath = toRelativePath(filePath);
    if (!shouldInspectReturnedObjectSurfaceFile(relativePath)) {
      continue;
    }

    const { currentSurfaces, previousSurfaces } = collectSurfaceMaps({
      filePath,
      relativePath,
      currentSourceFile: createTypeScriptSourceFile(filePath),
      collectSurfaces: collectReturnedObjectSurfaces,
      resolvePreviousSource,
      createPreviousSourceFile: createTypeScriptSourceFile,
    });

    for (const surface of currentSurfaces.values()) {
      if (surface.members < memberLimit) {
        continue;
      }

      const previousSurface = previousSurfaces.get(surface.name);
      if (!didSurfaceGrow(surface, previousSurface)) {
        continue;
      }

      const message = createReturnedObjectSurfaceMessage(surface, previousSurface, memberLimit);

      advisories.push(
        createViolation('returned-object-surface-breadth', relativePath, message, surface.line)
      );
    }
  }

  return advisories;
}

export function collectReturnedObjectSurfaceViolations(
  files,
  { getPreviousSource = null, memberLimit = 20 } = {}
) {
  return collectReturnedObjectSurfaceAdvisories(files, {
    getPreviousSource,
    memberLimit,
  }).map((advisory) => ({
    ...advisory,
    message: advisory.message.replaceAll('(advisory limit ', '(limit '),
  }));
}

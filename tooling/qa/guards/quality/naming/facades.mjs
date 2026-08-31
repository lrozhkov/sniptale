import path from 'node:path';
import ts from 'typescript';

import { getSourceSnapshot } from '../../../analysis/source/source-snapshot.mjs';

function getFacadeStem(absolutePath) {
  return path.parse(absolutePath).name;
}

function isAmbiguousSameNameFacadeModule(statement, absolutePath) {
  const moduleSpecifier = statement.moduleSpecifier?.text;
  if (!moduleSpecifier || !moduleSpecifier.startsWith('./')) {
    return false;
  }

  return moduleSpecifier === `./${getFacadeStem(absolutePath)}`;
}

function isAllowedFacadeStatement(statement, absolutePath) {
  if (ts.isImportDeclaration(statement)) {
    return (
      statement.importClause != null && !isAmbiguousSameNameFacadeModule(statement, absolutePath)
    );
  }

  if (ts.isExportDeclaration(statement)) {
    return !isAmbiguousSameNameFacadeModule(statement, absolutePath);
  }

  return false;
}

export function hasAmbiguousSameNameFacadeSource(absolutePath) {
  const sourceFile = getSourceSnapshot({ filePath: absolutePath }).sourceFile;
  return sourceFile.statements.some((statement) =>
    isAmbiguousSameNameFacadeModule(statement, absolutePath)
  );
}

export function isThinFacadeSource(absolutePath) {
  const sourceFile = getSourceSnapshot({ filePath: absolutePath }).sourceFile;

  return (
    sourceFile.statements.some((statement) => ts.isExportDeclaration(statement)) &&
    sourceFile.statements.every((statement) => isAllowedFacadeStatement(statement, absolutePath))
  );
}

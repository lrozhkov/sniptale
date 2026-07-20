import path from 'node:path';

import { Node, SyntaxKind } from 'ts-morph';
import ts from 'typescript';

function normalizePath(value) {
  return value.replaceAll(path.sep, '/');
}

function getRelativeSourcePath(sourceFile, rootDir) {
  return normalizePath(path.relative(rootDir, sourceFile.getFilePath()));
}

function addUsedExport(usedExportsByFile, filePath, exportName) {
  if (!usedExportsByFile.has(filePath)) {
    usedExportsByFile.set(filePath, new Set());
  }

  usedExportsByFile.get(filePath).add(exportName);
}

export function markImportUsage(
  sourceFile,
  rootDir,
  exportedDeclarationsByFile,
  usedExportsByFile
) {
  for (const importDeclaration of sourceFile.getImportDeclarations()) {
    const targetSourceFile = importDeclaration.getModuleSpecifierSourceFile();
    if (!targetSourceFile) {
      continue;
    }

    const targetPath = getRelativeSourcePath(targetSourceFile, rootDir);
    if (!exportedDeclarationsByFile.has(targetPath)) {
      continue;
    }

    const namespaceImport = importDeclaration.getNamespaceImport();
    if (namespaceImport) {
      addUsedExport(usedExportsByFile, targetPath, '*');
      continue;
    }

    if (importDeclaration.getDefaultImport()) {
      addUsedExport(usedExportsByFile, targetPath, 'default');
    }

    for (const namedImport of importDeclaration.getNamedImports()) {
      addUsedExport(usedExportsByFile, targetPath, namedImport.getName());
    }
  }
}

export function markReExportUsage(
  sourceFile,
  rootDir,
  exportedDeclarationsByFile,
  usedExportsByFile
) {
  for (const exportDeclaration of sourceFile.getExportDeclarations()) {
    const targetSourceFile = exportDeclaration.getModuleSpecifierSourceFile();
    if (!targetSourceFile) {
      continue;
    }

    const targetPath = getRelativeSourcePath(targetSourceFile, rootDir);
    if (!exportedDeclarationsByFile.has(targetPath)) {
      continue;
    }

    if (exportDeclaration.isNamespaceExport() || exportDeclaration.hasNamedExports() === false) {
      addUsedExport(usedExportsByFile, targetPath, '*');
      continue;
    }

    for (const namedExport of exportDeclaration.getNamedExports()) {
      addUsedExport(usedExportsByFile, targetPath, namedExport.getNameNode().getText());
    }
  }
}

function resolveDynamicImportTargetPath({ compilerOptions, rootDir, sourceFile, moduleSpecifier }) {
  const resolvedModule = ts.resolveModuleName(
    moduleSpecifier,
    sourceFile.getFilePath(),
    compilerOptions,
    ts.sys
  ).resolvedModule;

  if (!resolvedModule) {
    return null;
  }

  return normalizePath(path.relative(rootDir, resolvedModule.resolvedFileName));
}

export function markDynamicImportUsage(
  project,
  sourceFile,
  rootDir,
  exportedDeclarationsByFile,
  usedExportsByFile
) {
  for (const callExpression of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (callExpression.getExpression().getKind() !== SyntaxKind.ImportKeyword) {
      continue;
    }

    const [moduleSpecifierNode] = callExpression.getArguments();
    if (
      !moduleSpecifierNode ||
      (!Node.isStringLiteral(moduleSpecifierNode) &&
        !Node.isNoSubstitutionTemplateLiteral(moduleSpecifierNode))
    ) {
      continue;
    }

    const targetPath = resolveDynamicImportTargetPath({
      compilerOptions: project.getCompilerOptions(),
      rootDir,
      sourceFile,
      moduleSpecifier: moduleSpecifierNode.getLiteralText(),
    });
    if (!targetPath || !exportedDeclarationsByFile.has(targetPath)) {
      continue;
    }

    addUsedExport(usedExportsByFile, targetPath, '*');
  }
}

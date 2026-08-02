import { hasModifier, isTypeOnlyImport } from './deleted-build-ast.mjs';
import { listHeadCodeFilesContainingText } from './git-head-sources.mjs';
import { isBuildTestFile } from './build-test-file-classifier.mjs';
import { isCodeFile } from './shared.mjs';
import { createSourceFile, ts } from './structural-risk/ast.mjs';

function collectSideEffectFreeFunctionExports(file, source) {
  const sourceFile = createSourceFile(file, source);
  const exports = [];
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && isTypeOnlyImport(statement)) continue;
    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) continue;
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name &&
      statement.body &&
      hasModifier(statement, ts.SyntaxKind.ExportKeyword) &&
      !hasModifier(statement, ts.SyntaxKind.DefaultKeyword)
    ) {
      exports.push(statement.name.text);
      continue;
    }
    return [];
  }
  return [...new Set(exports)].sort();
}

export function createDeletedDeadExportAnalyzer({
  analyzeAggregate,
  deletedFiles,
  readHeadSource,
  root,
  searchHeadText = (text) => listHeadCodeFilesContainingText(text, { root }),
}) {
  const results = new Map();
  return function isDeletedDeadExport(file) {
    if (results.has(file)) return results.get(file);
    const source = readHeadSource(file);
    const exportedNames = source === null ? [] : collectSideEffectFreeFunctionExports(file, source);
    const isDead =
      exportedNames.length > 0 &&
      exportedNames.every((exportedName) => {
        const search = searchHeadText(exportedName);
        return (
          search.complete &&
          search.files
            .filter(
              (candidate) =>
                candidate !== file && isCodeFile(candidate) && !isBuildTestFile(candidate)
            )
            .every(
              (candidate) => deletedFiles.has(candidate) && analyzeAggregate(candidate).eligible
            )
        );
      });
    results.set(file, isDead);
    return isDead;
  };
}

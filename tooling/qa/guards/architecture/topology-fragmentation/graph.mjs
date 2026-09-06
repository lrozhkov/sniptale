import { collectModuleImportGraph } from '../../../analysis/dependency-graph/module-import-graph.mjs';
import { isBuildTestFile } from '../../../proof/build/build-test-file-classifier.mjs';
import { createSourceFile, ts } from '../../../analysis/structural-risk/ast.mjs';

function hasExportModifier(node) {
  if (!ts.canHaveModifiers(node)) return false;
  return ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
}

function collectFunctions(sourceFile) {
  const functions = [];
  function visit(node) {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node)
    ) {
      functions.push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return functions;
}

function isTrivialDelegation(node) {
  const body = node.body;
  if (!body) return true;
  if (!ts.isBlock(body)) return ts.isCallExpression(body) || ts.isAwaitExpression(body);
  if (body.statements.length !== 1) return false;
  const statement = body.statements[0];
  if (ts.isReturnStatement(statement)) {
    const expression = statement.expression;
    return Boolean(
      expression && (ts.isCallExpression(expression) || ts.isAwaitExpression(expression))
    );
  }
  return ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression);
}

export function collectTopologySyntaxSignals(file, source) {
  const sourceFile = createSourceFile(file, source);
  const significant = sourceFile.statements.filter(
    (statement) => !ts.isImportDeclaration(statement)
  );
  const forwardingOnly =
    significant.length > 0 &&
    significant.every(
      (statement) => ts.isExportDeclaration(statement) && statement.moduleSpecifier != null
    );
  const functions = collectFunctions(sourceFile);
  const declarationsOnly = significant.every(
    (statement) =>
      ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isVariableStatement(statement) ||
      ts.isExportDeclaration(statement) ||
      hasExportModifier(statement)
  );
  const passThrough =
    !forwardingOnly &&
    functions.length > 0 &&
    declarationsOnly &&
    functions.every(isTrivialDelegation);
  const delegationOnlyTest =
    isBuildTestFile(file) &&
    /(?:toHaveBeenCalled|toHaveBeenCalledWith|toHaveReturned|mock\.calls)/u.test(source) &&
    !/(?:rollback|cleanup|failure|throws|rejects|ordering|invariant)/iu.test(source);
  return { forwardingOnly, passThrough, delegationOnlyTest };
}

export function collectTopologyModuleGraph({ files, root, readFile }) {
  const graph = collectModuleImportGraph({ files, root, readFile });
  const modules = graph.files.map((file) => {
    const source = readFile(file);
    return {
      file,
      ...collectTopologySyntaxSignals(file, source),
    };
  });
  return {
    ...graph,
    modules: modules.sort((left, right) => left.file.localeCompare(right.file)),
  };
}

import { collectFunctionMetrics, collectTopLevelEffectClusters } from './function-metrics.mjs';
import {
  classifyArchitecturalLayer,
  classifyImportedOwner,
  classifyOwnerGroup,
} from './owner-classifier.mjs';
import { createNormalizedSourceHash, getNodeLine, sha256, ts } from './ast.mjs';
import { TEST_FILE_PATTERN } from './config.mjs';

function collectImports(sourceFile, relativePath) {
  const edges = [];
  function add(specifier, line, kind) {
    const owner = classifyImportedOwner(relativePath, specifier);
    edges.push({ specifier, owner, line, kind });
  }
  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      add(
        node.moduleSpecifier.text,
        getNodeLine(sourceFile, node),
        ts.isImportDeclaration(node) ? 'import' : 're-export'
      );
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      add(node.arguments[0].text, getNodeLine(sourceFile, node), 'dynamic-import');
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return [...new Map(edges.map((edge) => [`${edge.kind}:${edge.specifier}`, edge])).values()];
}

function countExports(sourceFile) {
  let count = 0;
  for (const statement of sourceFile.statements) {
    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
    if (modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) count += 1;
    if (ts.isExportDeclaration(statement)) {
      count +=
        statement.exportClause && ts.isNamedExports(statement.exportClause)
          ? statement.exportClause.elements.length
          : 1;
    }
  }
  return count;
}

function collectExportSignatures(sourceFile) {
  return sourceFile.statements.flatMap((statement) => {
    if (ts.isExportDeclaration(statement)) {
      if (!statement.exportClause || !ts.isNamedExports(statement.exportClause))
        return ['export:*'];
      return statement.exportClause.elements.map((element) => `export:${element.name.text}`);
    }
    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
    if (!modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) return [];
    const name = statement.name?.getText(sourceFile) ?? statement.kind;
    return [`export:${name}`];
  });
}

function isEffectfulCluster(metric) {
  const hasUi = metric.effectFamilies.includes('dom-ui');
  if (metric.architecturalLayer === 'adapter') {
    return metric.effectCount > 2 || metric.stateAuthorities > 1 || hasUi;
  }
  if (metric.architecturalLayer === 'orchestration') {
    return metric.effectCount > 3 || metric.stateAuthorities > 2 || metric.cohesion < 0.5 || hasUi;
  }
  if (metric.architecturalLayer === 'ui') {
    return (
      metric.effectCount > 1 ||
      (metric.stateAuthorities > 0 && metric.effectFamilies.some((family) => family !== 'dom-ui'))
    );
  }
  return metric.effectCount >= 2 || (metric.stateAuthorities > 0 && metric.effectCount > 0);
}

export function collectFileMetrics(sourceFile, relativePath, source) {
  const functions = collectFunctionMetrics(sourceFile, relativePath);
  const topLevelClusters = collectTopLevelEffectClusters(sourceFile, relativePath);
  const imports = collectImports(sourceFile, relativePath);
  const ownGroup = classifyOwnerGroup(relativePath);
  const externalEdges = imports.filter((edge) => edge.owner !== ownGroup);
  const ownerGroups = [...new Set(externalEdges.map((edge) => edge.owner))].sort();
  const effectFamilies = [
    ...new Set(
      functions
        .flatMap((metric) => metric.effectFamilies)
        .concat(topLevelClusters.flatMap((metric) => metric.effectFamilies))
    ),
  ].sort();
  const stateAuthorityNames = [
    ...functions.flatMap((metric) =>
      metric.stateAuthorityNames.map((name) => `${metric.symbol}:${name}`)
    ),
    ...topLevelClusters.flatMap((metric) =>
      metric.stateAuthorityNames.map((name) => `<top-level>:${name}`)
    ),
  ];
  const stateAuthorities = new Set(stateAuthorityNames).size;
  const clusters = [...functions, ...topLevelClusters].filter(isEffectfulCluster);
  const classifiedCalls = functions.filter((metric) => metric.ownerGroups.length > 0);
  const classifiedCallCount = classifiedCalls.reduce(
    (sum, metric) => sum + metric.classifiedCallCount,
    0
  );
  const cohesion =
    TEST_FILE_PATTERN.test(relativePath) || classifiedCalls.length === 0
      ? 1
      : classifiedCalls.reduce((sum, metric) => sum + metric.cohesion, 0) / classifiedCalls.length;

  return {
    file: relativePath,
    line: 1,
    symbol: '<file>',
    lines: source.split(/\r?\n/u).length,
    ownerGroup: ownGroup,
    ownerGroups,
    ownerGroupCount: ownerGroups.length,
    externalEdges: externalEdges.length,
    exports: countExports(sourceFile),
    effectFamilies,
    effectCount: effectFamilies.length,
    stateAuthorities,
    effectfulClusters: clusters.length,
    classifiedCallCount,
    cohesion,
    architecturalLayer: classifyArchitecturalLayer(relativePath),
    astHash: createNormalizedSourceHash(sourceFile),
    signatureHash: sha256(
      JSON.stringify({
        imports: imports.map(({ kind, specifier }) => `${kind}:${specifier}`).sort(),
        exports: collectExportSignatures(sourceFile).sort(),
      })
    ),
    functions,
  };
}

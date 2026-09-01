import path from 'node:path';

import ts from 'typescript';

import { extractRepositoryTargets, normalizeRepositoryTarget, makeOrigin } from './commands.mjs';
import { hasExecutableEntryPoint } from '../executables/check.mjs';

const PROCESS_CALLS = new Set([
  'execFile',
  'execFileSync',
  'fork',
  'runCommand',
  'runRepoNodeEntry',
  'spawn',
  'spawnSync',
]);

export function createExecutableOriginSourceFile(authority, source) {
  const file = ts.createSourceFile(authority, source, ts.ScriptTarget.Latest, true);
  if (file.parseDiagnostics.length > 0) {
    throw new SyntaxError(`Cannot collect executable origins from ${authority}`);
  }
  return file;
}

function hasAlternateDirectGuard(authority, source, sourceFile) {
  const parsedSourceFile = sourceFile ?? createExecutableOriginSourceFile(authority, source);
  const aliases = new Map();
  for (const statement of parsedSourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
      const text = declaration.initializer.getText(parsedSourceFile);
      aliases.set(declaration.name.text, {
        importMeta: text.includes('import.meta.url'),
        processArgv: text.includes('process.argv'),
      });
    }
  }
  return parsedSourceFile.statements.some((statement) => {
    if (!ts.isIfStatement(statement)) return false;
    const text = statement.expression.getText(parsedSourceFile);
    const referencedNames = new Set();
    function collectIdentifiers(node) {
      if (ts.isIdentifier(node)) referencedNames.add(node.text);
      ts.forEachChild(node, collectIdentifiers);
    }
    collectIdentifiers(statement.expression);
    const referenced = [...aliases].filter(([name]) => referencedNames.has(name));
    return (
      !text.includes('import.meta.url') &&
      !text.includes('process.argv') &&
      (text.includes('import.meta.url') || referenced.some(([, value]) => value.importMeta)) &&
      (text.includes('process.argv') || referenced.some(([, value]) => value.processArgv))
    );
  });
}

export function collectDeclaredEntryOrigins({
  authority,
  executableMode = false,
  source,
  sourceFile,
}) {
  if (authority.endsWith('.py')) {
    const pythonMain = /if\s+__name__\s*==\s*["']__main__["']\s*:/u.test(source);
    const processFixture = authority.endsWith('.test.py') && /if\s+sys\.argv\[1:\]/u.test(source);
    return pythonMain || processFixture
      ? [
          makeOrigin({
            authority,
            id: processFixture
              ? `test-fixture-entry:${authority}#process-only`
              : `python-entry:${authority}#python-main-entry`,
            kind: processFixture ? 'test-process-fixture-entry' : 'python-main-entry',
            target: authority,
          }),
        ]
      : [];
  }
  if (authority.endsWith('.sh')) {
    return executableMode && /^#!.*\b(?:ba|z|k)?sh\b/mu.test(source)
      ? [
          makeOrigin({
            authority,
            id: `shell-entry:${authority}#shebang-executable`,
            kind: 'registered-shell-entry',
            target: authority,
          }),
        ]
      : [];
  }
  if (!/\.(?:[cm]?[jt]s)$/u.test(authority)) return [];
  if (hasAlternateDirectGuard(authority, source, sourceFile)) {
    return [
      makeOrigin({
        authority,
        id: `ast-entry:${authority}#resolved-argv-file-url-equivalence`,
        kind: 'canonical-production-AST-alternate-entry',
        target: authority,
      }),
    ];
  }
  if (hasExecutableEntryPoint(source, authority, { sourceFile })) {
    return [
      makeOrigin({
        authority,
        id: `ast-entry:${authority}#canonical-js-entry`,
        kind: 'canonical-production-AST-direct-entry',
        target: authority,
      }),
    ];
  }
  if (/process\.on\(\s*["']message["']/u.test(source)) {
    return [
      makeOrigin({
        authority,
        id: `worker-entry:${authority}#qa-lane-ipc`,
        kind: 'qa-lane-ipc-worker-entry',
        target: authority,
      }),
    ];
  }
  return [];
}

function literalText(node) {
  return ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)
    ? node.text
    : null;
}

function repositoryTargetFromLiteral(authority, value) {
  const trustedImagePrefix = '/opt/sniptale-trusted/';
  if (value.startsWith(`${trustedImagePrefix}tooling/`)) {
    return normalizeRepositoryTarget(value.slice(trustedImagePrefix.length));
  }
  if (value.startsWith('tooling/') && !value.includes('/node_modules/')) {
    return normalizeRepositoryTarget(value);
  }
  if (!value.startsWith('.')) return null;
  return normalizeRepositoryTarget(path.posix.join(path.posix.dirname(authority), value));
}

function newUrlTarget(authority, node) {
  if (
    !ts.isNewExpression(node) ||
    !ts.isIdentifier(node.expression) ||
    node.expression.text !== 'URL' ||
    node.arguments?.length !== 2
  ) {
    return null;
  }
  const value = literalText(node.arguments[0]);
  return value ? repositoryTargetFromLiteral(authority, value) : null;
}

function collectConstTargets(authority, sourceFile) {
  const targets = new Map();
  const ambiguous = new Set();
  function visit(node) {
    if (ts.isVariableDeclarationList(node)) {
      for (const declaration of node.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
        const resolved = resolveNode(authority, declaration.initializer, targets);
        if (!resolved) {
          if (
            !targets.has(declaration.name.text) &&
            containsRepositoryTargetSyntax(authority, declaration.initializer)
          ) {
            ambiguous.add(declaration.name.text);
          }
          continue;
        }
        const existing = targets.get(declaration.name.text);
        if (existing && existing !== resolved) {
          targets.delete(declaration.name.text);
          ambiguous.add(declaration.name.text);
        } else if (!ambiguous.has(declaration.name.text)) {
          targets.set(declaration.name.text, resolved);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return { ambiguous, targets };
}

function transparentTargetCallName(node) {
  if (!ts.isCallExpression(node)) return null;
  if (ts.isIdentifier(node.expression)) return node.expression.text;
  if (ts.isPropertyAccessExpression(node.expression)) return node.expression.name.text;
  return null;
}

function collectResolvedNodeTargets(authority, node, constants) {
  if (ts.isIdentifier(node)) {
    const target = constants.get(node.text);
    return target ? [target] : [];
  }
  const urlTarget = newUrlTarget(authority, node);
  if (urlTarget) return [urlTarget];
  const literal = literalText(node);
  if (literal) {
    const target = repositoryTargetFromLiteral(authority, literal);
    return target ? [target] : [];
  }
  if (ts.isConditionalExpression(node)) {
    return [node.whenTrue, node.whenFalse].flatMap((branch) =>
      collectResolvedNodeTargets(authority, branch, constants)
    );
  }
  if (ts.isPropertyAccessExpression(node)) {
    return collectResolvedNodeTargets(authority, node.expression, constants);
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.flatMap((element) =>
      collectResolvedNodeTargets(authority, element, constants)
    );
  }
  if (ts.isObjectLiteralExpression(node)) {
    return node.properties.flatMap((property) => {
      if (ts.isPropertyAssignment(property)) {
        return collectResolvedNodeTargets(authority, property.initializer, constants);
      }
      if (ts.isShorthandPropertyAssignment(property)) {
        return collectResolvedNodeTargets(authority, property.name, constants);
      }
      return [];
    });
  }
  if (ts.isTemplateExpression(node)) {
    return node.templateSpans.flatMap(({ expression }) =>
      collectResolvedNodeTargets(authority, expression, constants)
    );
  }
  const transparentCall = transparentTargetCallName(node);
  if (
    transparentCall &&
    ['fileURLToPath', 'join', 'pathToFileURL', 'resolve', 'stringify'].includes(transparentCall)
  ) {
    return node.arguments.flatMap((argument) =>
      collectResolvedNodeTargets(authority, argument, constants)
    );
  }
  return [];
}

function resolveNode(authority, node, constants) {
  const targets = new Set(collectResolvedNodeTargets(authority, node, constants));
  return targets.size === 1 ? [...targets][0] : null;
}

function containsRepositoryTargetSyntax(authority, node) {
  let found = false;
  function visit(candidate) {
    if (found) return;
    const literal = literalText(candidate);
    if (
      (literal && repositoryTargetFromLiteral(authority, literal)) ||
      (ts.isTemplateExpression(candidate) &&
        [candidate.head, ...candidate.templateSpans.map(({ literal: part }) => part)].some((part) =>
          part.text.includes('tooling/')
        )) ||
      newUrlTarget(authority, candidate)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(candidate, visit);
  }
  visit(node);
  return found;
}

function hasUnresolvedRepositoryTargetSyntax(context, node) {
  if (ts.isIdentifier(node)) return context.ambiguousConstants.has(node.text);
  if (newUrlTarget(context.authority, node)) return false;
  const literal = literalText(node);
  if (literal) return false;
  if (ts.isTemplateExpression(node)) {
    const repositoryBearingPart = [
      node.head,
      ...node.templateSpans.map(({ literal: part }) => part),
    ].some((part) => part.text.includes('tooling/'));
    return (
      repositoryBearingPart ||
      node.templateSpans.some(({ expression }) =>
        hasUnresolvedRepositoryTargetSyntax(context, expression)
      )
    );
  }
  if (ts.isConditionalExpression(node)) {
    return [node.whenTrue, node.whenFalse].some((branch) =>
      hasUnresolvedRepositoryTargetSyntax(context, branch)
    );
  }
  if (ts.isPropertyAccessExpression(node)) {
    return hasUnresolvedRepositoryTargetSyntax(context, node.expression);
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.some((element) => hasUnresolvedRepositoryTargetSyntax(context, element));
  }
  if (ts.isObjectLiteralExpression(node)) {
    return node.properties.some((property) => {
      if (ts.isPropertyAssignment(property)) {
        return hasUnresolvedRepositoryTargetSyntax(context, property.initializer);
      }
      if (ts.isShorthandPropertyAssignment(property)) {
        return hasUnresolvedRepositoryTargetSyntax(context, property.name);
      }
      return false;
    });
  }
  const transparentCall = transparentTargetCallName(node);
  if (
    transparentCall &&
    ['fileURLToPath', 'join', 'pathToFileURL', 'resolve', 'stringify'].includes(transparentCall)
  ) {
    return node.arguments.some((argument) =>
      hasUnresolvedRepositoryTargetSyntax(context, argument)
    );
  }
  return containsRepositoryTargetSyntax(context.authority, node);
}

function callName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return null;
}

function processTargetCandidates(name, argumentsList, sourceFile) {
  if (name === 'fork' || name === 'runRepoNodeEntry') return [argumentsList[0]];
  const command = argumentsList[0]?.getText(sourceFile) ?? '';
  const interpreter = /^(?:["'](?:node|tsx|bash|sh|python3?)["']|process\.execPath)$/u.test(
    command
  );
  if (interpreter && ts.isArrayLiteralExpression(argumentsList[1])) {
    const firstArgument = argumentsList[1].elements[0];
    const firstText = literalText(firstArgument) ?? '';
    if (firstText === '--input-type=module' || firstText === '--eval' || firstText === '-e') {
      return [argumentsList[1]];
    }
    return [argumentsList[1].elements[0]];
  }
  return [argumentsList[0]];
}

function looksLikeRepositoryExpression(context, node) {
  return (
    (ts.isIdentifier(node) && context.ambiguousConstants.has(node.text)) ||
    containsRepositoryTargetSyntax(context.authority, node)
  );
}

function invocationKind(context) {
  return context.testProcess ? 'test-process-target' : 'internal-process-target';
}

function addInvocationOrigin(context, { label, target }) {
  context.origins.push(
    makeOrigin({
      authority: context.authority,
      id:
        `${context.testProcess ? 'test-process' : 'internal'}:${context.authority}#${label}.` +
        `occurrence.${context.ordinal}.target.${target}`,
      kind: invocationKind(context),
      target,
    })
  );
}

function resolveFirstCandidate(context, candidates) {
  if (candidates.some((candidate) => hasUnresolvedRepositoryTargetSyntax(context, candidate))) {
    return null;
  }
  return candidates
    .map((candidate) => resolveNode(context.authority, candidate, context.constants))
    .find(Boolean);
}

function recordUnresolvedInvocation(context, node) {
  context.unresolved.push({
    authority: context.authority,
    expression: node.getText(context.sourceFile),
    ordinal: context.ordinal,
  });
}

function collectProcessCall(context, node, name, isExecutableDynamicImport) {
  if (!PROCESS_CALLS.has(name) && !isExecutableDynamicImport) return;
  context.ordinal += 1;
  const candidates = PROCESS_CALLS.has(name)
    ? processTargetCandidates(name, node.arguments, context.sourceFile)
    : [node.arguments[0]];
  const target = resolveFirstCandidate(context, candidates);
  if (target) {
    addInvocationOrigin(context, {
      label: isExecutableDynamicImport ? 'dynamic-import' : name,
      target,
    });
  } else if (candidates.some((candidate) => looksLikeRepositoryExpression(context, candidate))) {
    recordUnresolvedInvocation(context, node);
  }
}

function collectContainerInvocation(context, node, name) {
  if (name !== 'appendCandidatePhaseInvocation') return;
  context.ordinal += 1;
  const target = resolveFirstCandidate(context, node.arguments);
  if (target) {
    context.origins.push(
      makeOrigin({
        authority: context.authority,
        id:
          `internal:${context.authority}#container-execution.` +
          `occurrence.${context.ordinal}.target.${target}`,
        kind: 'internal-process-target',
        target,
      })
    );
  } else if (
    node.arguments.some((candidate) => looksLikeRepositoryExpression(context, candidate))
  ) {
    recordUnresolvedInvocation(context, node);
  }
}

function findWorkerUrlCandidate(context, nodes) {
  let result = null;
  function visit(candidate) {
    if (
      ts.isPropertyAssignment(candidate) &&
      candidate.name.getText(context.sourceFile) === 'workerUrl'
    ) {
      result = candidate.initializer;
      return;
    }
    ts.forEachChild(candidate, visit);
  }
  nodes.forEach(visit);
  return result;
}

function collectLaneWorkerInvocation(context, node, name) {
  if (name !== 'runQaLaneWorker') return;
  const candidate = findWorkerUrlCandidate(context, node.arguments);
  if (!candidate) return;
  context.ordinal += 1;
  const target = resolveFirstCandidate(context, [candidate]);
  if (target) {
    addInvocationOrigin(context, { label: 'worker-url', target });
  } else if (looksLikeRepositoryExpression(context, candidate)) {
    recordUnresolvedInvocation(context, node);
  }
}

function collectCallInvocation(context, node) {
  const name = callName(node.expression);
  const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
  const isExecutableDynamicImport =
    isDynamicImport &&
    context.authority === 'tooling/web-snapshot-smoke/runtime/polygon-runner.mjs';
  if (isDynamicImport && !isExecutableDynamicImport) return;
  collectProcessCall(context, node, name, isExecutableDynamicImport);
  collectContainerInvocation(context, node, name);
  collectLaneWorkerInvocation(context, node, name);
}

function collectWorkerConstruction(context, node) {
  if (
    !ts.isNewExpression(node) ||
    !ts.isIdentifier(node.expression) ||
    node.expression.text !== 'Worker'
  ) {
    return;
  }
  context.ordinal += 1;
  const candidates = node.arguments ?? [];
  const target = resolveFirstCandidate(context, candidates);
  if (target) {
    addInvocationOrigin(context, { label: 'Worker', target });
  } else if (candidates.some((candidate) => looksLikeRepositoryExpression(context, candidate))) {
    recordUnresolvedInvocation(context, node);
  }
}

function visitSourceInvocations(context, node) {
  if (ts.isCallExpression(node)) collectCallInvocation(context, node);
  collectWorkerConstruction(context, node);
  ts.forEachChild(node, (child) => visitSourceInvocations(context, child));
}

function collectLocalCommandRegistry(context) {
  if (context.authority !== 'tooling/ci/local.mjs') return;
  for (const statement of context.sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        !ts.isIdentifier(declaration.name) ||
        declaration.name.text !== 'commands' ||
        !declaration.initializer
      ) {
        continue;
      }
      for (const target of extractRepositoryTargets(
        declaration.initializer.getText(context.sourceFile)
      )) {
        context.origins.push(
          makeOrigin({
            authority: context.authority,
            id: `internal:${context.authority}#command-registry.target.${target}`,
            kind: 'internal-process-target',
            target,
          })
        );
      }
    }
  }
}

function collectLocalBoundedLanes(context, source) {
  if (
    context.authority !== 'tooling/ci/local.mjs' ||
    !/\['proof',\s*'release'\]\.includes\(lane\)/u.test(source) ||
    !source.includes('`tooling/ci/${lane}-wrapper.mjs`')
  ) {
    return;
  }
  for (const lane of ['proof', 'release']) {
    const target = `tooling/ci/${lane}-wrapper.mjs`;
    context.origins.push(
      makeOrigin({
        authority: context.authority,
        id: `internal:${context.authority}#bounded-lane.${lane}.target.${target}`,
        kind: 'internal-process-target',
        target,
      })
    );
  }
}

export function collectSourceInvocationOrigins({
  authority,
  source,
  sourceFile: suppliedSourceFile,
  testProcess = false,
}) {
  const sourceFile = suppliedSourceFile ?? createExecutableOriginSourceFile(authority, source);
  const constantProjection = collectConstTargets(authority, sourceFile);
  const context = {
    ambiguousConstants: constantProjection.ambiguous,
    authority,
    constants: constantProjection.targets,
    ordinal: 0,
    origins: [],
    sourceFile,
    testProcess,
    unresolved: [],
  };
  visitSourceInvocations(context, sourceFile);
  collectLocalCommandRegistry(context);
  collectLocalBoundedLanes(context, source);
  return {
    origins: context.origins.sort((a, b) => a.id.localeCompare(b.id)),
    unresolved: context.unresolved,
  };
}

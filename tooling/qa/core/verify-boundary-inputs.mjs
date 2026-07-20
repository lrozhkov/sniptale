/**
 * Boundary input guardrail.
 * Ensures listener-style external inputs are treated as unknown and locally parsed or narrowed.
 */

import fs from 'node:fs';
import ts from 'typescript';

import {
  collectBoundaryUsage,
  collectFunctionBindings,
  createViolation,
  getBoundaryFactoryName,
  getBoundaryFactoryNode,
  getBoundaryParam,
  getFunctionName,
  getListenerCallbackNode,
  getNodeLine,
  getPropertyAccessChain,
  getReturnedBoundaryCallbackNode,
} from './verify-boundary-inputs.helpers.mjs';
import {
  collectCodeFiles,
  isExecutedAsScript,
  printViolations,
  toRelativePath,
} from './shared.mjs';

const BOUNDARY_FACTORY_PATTERN = /(?:Runtime|Message).*(?:Handler|Listener)$/u;

function isBoundaryListenerChain(chain) {
  if (!chain || chain.at(-1) !== 'addListener') {
    return false;
  }

  return (
    matchesExactChain(chain, ['chrome', 'runtime', 'onMessage', 'addListener']) ||
    matchesExactChain(chain, ['chrome', 'runtime', 'onConnect', 'addListener'])
  );
}

function matchesExactChain(chain, expected) {
  return chain.length === expected.length && chain.every((part, index) => part === expected[index]);
}

function collectParamTypeViolations(file, sourceFile, firstParam, paramName, paramType) {
  if (paramType && paramType !== 'unknown') {
    return [
      createViolation(
        'boundary-input-non-unknown',
        file,
        `Boundary listener input "${paramName}" must be typed as unknown before local validation.`,
        getNodeLine(sourceFile, firstParam)
      ),
    ];
  }

  return [];
}

function collectBoundaryUsageViolations(file, sourceFile, callbackNode, paramName) {
  const violations = [];
  const usage = collectBoundaryUsage(callbackNode, paramName);

  if (usage.hasTypeAssertion) {
    violations.push(
      createViolation(
        'boundary-input-type-assertion',
        file,
        `Boundary listener input "${paramName}" must not be cast directly; parse or narrow it first.`,
        getNodeLine(sourceFile, callbackNode)
      )
    );
  }

  if (usage.hasDirectPropertyAccess && !usage.hasValidatorCall) {
    const callbackName = getFunctionName(callbackNode);
    const nameSuffix = callbackName ? ` "${callbackName}"` : '';
    violations.push(
      createViolation(
        'boundary-input-unvalidated',
        file,
        [
          `Boundary listener${nameSuffix} reads external input "${paramName}"`,
          'without a local parse/narrow/validate helper.',
        ].join(' '),
        getNodeLine(sourceFile, callbackNode)
      )
    );
  }

  return violations;
}

function analyzeBoundaryCallback(file, sourceFile, callbackNode) {
  const boundaryParam = getBoundaryParam(callbackNode, sourceFile);
  if (!boundaryParam) {
    return [];
  }

  const { firstParam, paramName, paramType } = boundaryParam;
  return [
    ...collectParamTypeViolations(file, sourceFile, firstParam, paramName, paramType),
    ...collectBoundaryUsageViolations(file, sourceFile, callbackNode, paramName),
  ];
}

function collectFactoryBoundaryViolations(relativePath, sourceFile, node, bindings) {
  const boundaryFactoryName = getBoundaryFactoryName(node);
  if (!boundaryFactoryName || !BOUNDARY_FACTORY_PATTERN.test(boundaryFactoryName)) {
    return [];
  }

  const functionNode = getBoundaryFactoryNode(node, bindings, boundaryFactoryName);
  const returnedCallbackNode = functionNode ? getReturnedBoundaryCallbackNode(functionNode) : null;
  const boundaryParam = returnedCallbackNode
    ? getBoundaryParam(returnedCallbackNode, sourceFile)
    : null;
  if (
    !returnedCallbackNode ||
    (boundaryParam?.paramType && boundaryParam.paramType !== 'unknown')
  ) {
    return [];
  }

  return analyzeBoundaryCallback(relativePath, sourceFile, returnedCallbackNode);
}

function collectListenerBoundaryViolations(relativePath, sourceFile, node, bindings) {
  if (!ts.isCallExpression(node)) {
    return [];
  }

  const chain = getPropertyAccessChain(node.expression);
  if (!isBoundaryListenerChain(chain) || node.arguments.length === 0) {
    return [];
  }

  const callbackNode = getListenerCallbackNode(node.arguments[0], bindings);
  return callbackNode ? analyzeBoundaryCallback(relativePath, sourceFile, callbackNode) : [];
}

export function collectBoundaryInputViolations(files) {
  const violations = [];

  for (const filePath of files) {
    const relativePath = toRelativePath(filePath);
    const text = fs.readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true);
    const bindings = collectFunctionBindings(sourceFile);

    const visit = (node) => {
      violations.push(
        ...collectFactoryBoundaryViolations(relativePath, sourceFile, node, bindings)
      );
      violations.push(
        ...collectListenerBoundaryViolations(relativePath, sourceFile, node, bindings)
      );

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  return violations;
}

export function runBoundaryInputCheck({ files = [] } = {}) {
  const targetFiles = files.length > 0 ? files : collectCodeFiles();
  return {
    files: targetFiles.map(toRelativePath),
    violations: collectBoundaryInputViolations(targetFiles),
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const result = runBoundaryInputCheck();

  if (result.violations.length > 0) {
    printViolations('Boundary input guardrail violations found:', result.violations);
    process.exit(1);
  }

  process.stdout.write('Boundary input guardrail passed\n');
}

import ts from 'typescript';

import {
  collectFunctionLikeFindings,
  createAdvisoryTypeScriptContext,
} from './advisory-typescript-helpers.mjs';
const ORCHESTRATION_EXEMPTION_PATTERN =
  /(orchestr|workflow|pipeline|wiring|bootstrap|initialize|initializer|applier)/iu;

export function collectFlowPressureFindings(file, createFinding) {
  const context = createAdvisoryTypeScriptContext(file);
  if (!context) {
    return [];
  }

  const { relativePath, sourceFile } = context;

  return [...collectHiddenOrchestrationFindings(relativePath, sourceFile, createFinding)];
}

function collectHiddenOrchestrationFindings(relativePath, sourceFile, createFinding) {
  return collectFunctionLikeFindings(sourceFile, ({ functionName, line, node }) => {
    if (
      ORCHESTRATION_EXEMPTION_PATTERN.test(relativePath) ||
      ORCHESTRATION_EXEMPTION_PATTERN.test(functionName)
    ) {
      return [];
    }

    const categories = collectCallCategories(node.body, sourceFile);
    if (categories.values.size >= 3 && categories.callCount >= 4) {
      return [
        createFinding({
          family: 'Hidden orchestration in helpers/controllers',
          file: relativePath,
          line,
          reason: [
            `Function "${functionName}" mixes ${categories.values.size}`,
            'concern categories across one execution path.',
          ].join(' '),
          hint: 'Extract an explicit orchestration owner or narrow the helper/controller responsibility.',
          severity: 'attention',
        }),
      ];
    }

    return [];
  });
}

function collectCallCategories(node, sourceFile) {
  const values = new Set();
  let callCount = 0;

  const visit = (child) => {
    if (ts.isCallExpression(child)) {
      callCount += 1;
      categorizeCallExpression(values, child.expression.getText(sourceFile));
    }

    ts.forEachChild(child, visit);
  };

  visit(node);
  return { values, callCount };
}

function categorizeCallExpression(categories, callee) {
  if (/(?:sendRuntimeMessage|sendMessage|postMessage)/u.test(callee)) {
    categories.add('messaging');
  }
  if (isStorageLikeCall(callee)) {
    categories.add('storage');
  }
  if (/\bset[A-Z][A-Za-z0-9]*\b/u.test(callee)) {
    categories.add('ui-state');
  }
  if (/^(?:chrome|browser|navigator)\./u.test(callee) || /\bwindow\.history\b/u.test(callee)) {
    categories.add('browser');
  }
  if (isLifecycleLikeCall(callee)) {
    categories.add('lifecycle');
  }
  if (/^(?:setTimeout|setInterval|requestAnimationFrame|queueMicrotask)$/u.test(callee)) {
    categories.add('timers');
  }
}

function isStorageLikeCall(callee) {
  return (
    (/(?:save|write|persist|update|put|delete|get|load|read|list).*/u.test(callee) &&
      /(?:Storage|Store|Db|Database|Library|Preference|Setting|Session)\b/u.test(callee)) ||
    /\b(?:browserStorage|localStorage|indexedDB)\b/u.test(callee)
  );
}

function isLifecycleLikeCall(callee) {
  return (
    /(?:navigate|restore|beginTransaction|commitTransaction|cancelTransaction)\b/u.test(callee) ||
    /(?:open|close|hide|show|resume|suspend|activate|deactivate|hydrate)\b/u.test(callee)
  );
}

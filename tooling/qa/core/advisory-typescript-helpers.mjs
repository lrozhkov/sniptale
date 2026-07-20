import fs from 'node:fs';
import ts from 'typescript';

import { fromRelativePath, toRelativePath } from './shared.mjs';
import {
  createTypeScriptSourceFile,
  getFunctionLikeName,
  getNodeLine,
} from './typescript-ast-helpers.mjs';

const TEST_FILE_PATTERN = /\.(?:test|spec)\.(?:ts|tsx|js|mjs|cjs)$/u;
const TEST_SUPPORT_FILE_PATTERN =
  /\.(?:test-support|test-helpers|fixtures|test\.fixtures|test\.helpers)\.(?:ts|tsx|js|mjs|cjs)$/u;

export function createAdvisoryTypeScriptContext(
  file,
  { excludeTestSupport = false, includeText = false } = {}
) {
  const relativePath = toRelativePath(file);
  if (!/\.(?:ts|tsx)$/u.test(relativePath) || TEST_FILE_PATTERN.test(relativePath)) {
    return null;
  }

  if (excludeTestSupport && TEST_SUPPORT_FILE_PATTERN.test(relativePath)) {
    return null;
  }

  const text = fs.readFileSync(fromRelativePath(relativePath), 'utf8');

  return {
    relativePath,
    sourceFile: createTypeScriptSourceFile(relativePath, text),
    ...(includeText ? { text } : {}),
  };
}

export function collectFunctionLikeFindings(sourceFile, collectFindings) {
  const findings = [];

  const visit = (node) => {
    if (!isFunctionLikeWithBody(node)) {
      ts.forEachChild(node, visit);
      return;
    }

    findings.push(
      ...collectFindings({
        bodyText: node.body.getText(sourceFile),
        functionName: getFunctionLikeName(node) ?? '<anonymous>',
        line: getNodeLine(sourceFile, node),
        node,
        sourceFile,
      })
    );
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return findings;
}

function isFunctionLikeWithBody(node) {
  return (
    (ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node)) &&
    !!node.body
  );
}

/**
 * Runtime listener ownership guardrail.
 * Blocks direct chrome.runtime.onMessage listener registration outside
 * explicit boundary-owner files and sanctioned runtime seams.
 */

import fs from 'node:fs';
import ts from 'typescript';

import {
  collectCodeFiles,
  isExecutedAsScript,
  parseFilesArgument,
  printViolations,
  toRelativePath,
} from './shared.mjs';
import { getPropertyAccessChain, getNodeLine } from './typescript-ast-helpers.mjs';

function createViolation(rule, file, message, line) {
  return { rule, file, line, message };
}

function isRuntimeListenerChain(chain) {
  return (
    chain?.length === 4 &&
    chain[0] === 'chrome' &&
    chain[1] === 'runtime' &&
    chain[2] === 'onMessage' &&
    ['addListener', 'removeListener'].includes(chain[3])
  );
}

export function collectRuntimeListenerSeamViolations(files) {
  const violations = [];

  for (const filePath of files) {
    const relativePath = toRelativePath(filePath);
    const text = fs.readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true);
    let foundViolation = false;

    const visit = (node) => {
      if (foundViolation) {
        return;
      }

      if (ts.isCallExpression(node)) {
        const chain = getPropertyAccessChain(node.expression);
        if (isRuntimeListenerChain(chain)) {
          foundViolation = true;
          violations.push(
            createViolation(
              'runtime-listener-seam',
              relativePath,
              [
                'Register chrome.runtime.onMessage listeners only in explicit',
                'boundary-owner files or sanctioned runtime seams.',
              ].join(' '),
              getNodeLine(sourceFile, node)
            )
          );
          return;
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  return violations;
}

export function runRuntimeListenerSeamCheck({ files = [] } = {}) {
  const targetFiles = files.length > 0 ? files : collectCodeFiles();
  return {
    files: targetFiles.map(toRelativePath),
    violations: collectRuntimeListenerSeamViolations(targetFiles),
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const explicitFiles = parseFilesArgument(process.argv.slice(2));
  const result = runRuntimeListenerSeamCheck({ files: explicitFiles });

  if (result.violations.length > 0) {
    printViolations('Runtime listener ownership violations found:', result.violations);
    process.exit(1);
  }

  process.stdout.write('Runtime listener ownership guardrail passed\n');
}

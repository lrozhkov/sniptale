import ts from 'typescript';

import {
  LEGACY_PARSER_CALLER_BASELINE,
  RAW_STORAGE_MUTATION_BASELINE,
  RAW_STORAGE_MUTATION_OWNER_PATHS,
} from './architecture-guardrails.data.mjs';
import { getNodeLine, scanRepoScopedTypeScriptFiles } from './repo-scoped-typescript-scan.mjs';
import {
  collectExactBaselineViolations,
  createViolation,
} from './architecture-guardrails.helpers.mjs';

const PARSER_OWNER_FILE_PATTERN =
  /^apps\/extension\/src\/content\/parser\/(?:pipelines|dom-tree-parser|export-manager)\/.+\.[cm]?[jt]sx?$/u;
const STORAGE_MUTATION_FILE_PATTERN = /^(?:src|apps\/extension\/src)\/.+\.[cm]?[jt]sx?$/u;
const STORAGE_OWNER_PATTERNS = [
  /^apps\/extension\/src\/composition\/persistence\//u,
  /^apps\/extension\/src\/background\/storage\//u,
  /^apps\/extension\/src\/background\/runtime-routing\/runtime-messaging\/privileged-authority\//u,
];
const LEGACY_PARSER_CALL_NAMES = new Set([
  'parseDomTree',
  'parseGenericDomTree',
  'parseLegacyDomTree',
  'runLegacyTreeWalkerParser',
]);
const OUTPUT_HEURISTIC_NAMES = new Set([
  'aiPick',
  'applyBack',
  'exportJson',
  'markdown',
  'markdownExport',
]);
const STORAGE_WRITE_NAMES = new Set(['set', 'remove', 'clear']);

function formatExactScopeDrift(rule, { added, removed }) {
  return [
    `${rule} exact occurrence scope changed;`,
    `added=[${added.join(', ')}]; removed=[${removed.join(', ')}].`,
    'Update the baseline only after owner review.',
  ].join(' ');
}

function isParserLegacyCall(node) {
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    LEGACY_PARSER_CALL_NAMES.has(node.expression.text)
  );
}

function isOutputSpecificParserBranch(node) {
  return (
    ts.isIfStatement(node) &&
    [...OUTPUT_HEURISTIC_NAMES].some((name) => node.expression.getText().includes(name))
  );
}

export function collectParserOwnershipViolations(
  files,
  { baseline = LEGACY_PARSER_CALLER_BASELINE } = {}
) {
  const violations = [];
  scanRepoScopedTypeScriptFiles(files, {
    targetFilePatterns: [PARSER_OWNER_FILE_PATTERN],
    visitFile: ({ normalizedPath, sourceFile }) => {
      const visit = (node) => {
        if (isParserLegacyCall(node)) {
          violations.push(
            createViolation(
              'legacy-parser-caller',
              normalizedPath,
              'New parser ownership should go through page-profile/parser-pipeline owners, not legacy parser calls.',
              getNodeLine(sourceFile, node)
            )
          );
        }
        if (isOutputSpecificParserBranch(node)) {
          violations.push(
            createViolation(
              'output-specific-parser-heuristic',
              normalizedPath,
              'Parser owners must not branch extraction heuristics by output format.',
              getNodeLine(sourceFile, node)
            )
          );
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    },
  });
  return collectExactBaselineViolations(violations, baseline, formatExactScopeDrift);
}

function isStorageOwnerFile(relativePath) {
  if (STORAGE_OWNER_PATTERNS.some((pattern) => pattern.test(relativePath))) {
    return true;
  }

  return RAW_STORAGE_MUTATION_OWNER_PATHS.some(({ path }) =>
    path.endsWith('/') ? relativePath.startsWith(path) : relativePath === path
  );
}

function isRawStorageWriteCall(node) {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) {
    return false;
  }
  if (!STORAGE_WRITE_NAMES.has(node.expression.name.text)) {
    return false;
  }
  const target = node.expression.expression.getText();
  return (
    target.includes('chrome.storage') ||
    target.includes('browserStorage.local') ||
    target.includes('browserStorage.sync') ||
    target.includes('browserStorage.session')
  );
}

export function collectRawStorageMutationViolations(
  files,
  { baseline = RAW_STORAGE_MUTATION_BASELINE } = {}
) {
  const violations = [];
  scanRepoScopedTypeScriptFiles(files, {
    targetFilePatterns: [STORAGE_MUTATION_FILE_PATTERN],
    visitFile: ({ normalizedPath, sourceFile }) => {
      if (isStorageOwnerFile(normalizedPath)) {
        return;
      }
      const visit = (node) => {
        if (isRawStorageWriteCall(node)) {
          violations.push(
            createViolation(
              'raw-browser-storage-write',
              normalizedPath,
              'Raw browser storage writes belong in storage owner modules with explicit mutation contracts.',
              getNodeLine(sourceFile, node)
            )
          );
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    },
  });
  return collectExactBaselineViolations(violations, baseline, formatExactScopeDrift);
}

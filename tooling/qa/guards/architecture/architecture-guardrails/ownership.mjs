import ts from 'typescript';
import path from 'node:path';

import { RAW_STORAGE_MUTATION_BASELINE, RAW_STORAGE_MUTATION_OWNER_PATHS } from './data.mjs';
import {
  getNodeLine,
  scanRepoScopedTypeScriptFiles,
} from '../../../analysis/source/repo-scoped-typescript-scan.mjs';
import { collectExactBaselineViolations, createViolation } from './helpers.mjs';

const STORAGE_MUTATION_FILE_PATTERN =
  /^(?:apps\/extension\/src|packages\/[^/]+\/src)\/.+\.[cm]?[jt]sx?$/u;
const BROWSER_STORAGE_OWNER_MODULE =
  'apps/extension/src/composition/persistence/infrastructure/browser-storage';
const STORAGE_OWNER_PATTERNS = [
  /^apps\/extension\/src\/composition\/persistence\//u,
  /^apps\/extension\/src\/background\/storage\//u,
  /^apps\/extension\/src\/background\/runtime-routing\/runtime-messaging\/privileged-authority\//u,
];
const STORAGE_WRITE_NAMES = new Set(['set', 'remove', 'clear']);

function formatExactScopeDrift(rule, { added, removed }) {
  return [
    `${rule} exact occurrence scope changed;`,
    `added=[${added.join(', ')}]; removed=[${removed.join(', ')}].`,
    'Update the baseline only after owner review.',
  ].join(' ');
}

function isStorageOwnerFile(relativePath) {
  if (STORAGE_OWNER_PATTERNS.some((pattern) => pattern.test(relativePath))) {
    return true;
  }

  return RAW_STORAGE_MUTATION_OWNER_PATHS.some(({ path }) =>
    path.endsWith('/') ? relativePath.startsWith(path) : relativePath === path
  );
}

function resolveStorageModuleSpecifier(file, specifier) {
  if (!specifier.startsWith('.')) return specifier;
  return path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
}

function isBrowserStorageOwnerSpecifier(file, specifier) {
  const resolved = resolveStorageModuleSpecifier(file, specifier).replace(/\/(?:index)$/u, '');
  return resolved === BROWSER_STORAGE_OWNER_MODULE;
}

function collectBrowserStorageBindings(file, sourceFile) {
  const named = new Set();
  const namespaces = new Set();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !isBrowserStorageOwnerSpecifier(file, statement.moduleSpecifier.text)
    ) {
      continue;
    }
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        if ((element.propertyName ?? element.name).text === 'browserStorage') {
          named.add(element.name.text);
        }
      }
    } else if (bindings && ts.isNamespaceImport(bindings)) {
      namespaces.add(bindings.name.text);
    }
  }
  return { named, namespaces };
}

function collectPropertyChain(node) {
  const names = [];
  let current = node;
  while (ts.isPropertyAccessExpression(current)) {
    names.unshift(current.name.text);
    current = current.expression;
  }
  if (ts.isIdentifier(current)) names.unshift(current.text);
  return names;
}

function isRawStorageWriteCall(node, bindings) {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) {
    return false;
  }
  if (!STORAGE_WRITE_NAMES.has(node.expression.name.text)) {
    return false;
  }
  const chain = collectPropertyChain(node.expression);
  if (chain.length < 3 || !['local', 'session', 'sync'].includes(chain.at(-2))) return false;
  return (
    bindings.named.has(chain[0]) ||
    (bindings.namespaces.has(chain[0]) && chain[1] === 'browserStorage')
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
      const bindings = collectBrowserStorageBindings(normalizedPath, sourceFile);
      const visit = (node) => {
        if (isRawStorageWriteCall(node, bindings)) {
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

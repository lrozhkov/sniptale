import fs from 'node:fs';
import ts from 'typescript';

import { collectCodeFiles, fromRelativePath, readText } from './shared.mjs';
import { collectDeletedWorkspaceFiles, fileExists } from './guardrail-seam-audit-helpers.mjs';
import { resolveImportCandidates, resolveRelativeImport } from './path-import-helpers.mjs';
import { isProductSourcePath } from './src-production-targets.mjs';

const PRODUCT_SOURCE_ROOT = '(?:src|apps/extension/src)';
const ROOT_OWNER_FILE_PATTERN = new RegExp(
  `^${PRODUCT_SOURCE_ROOT}/[^/]+/[^/]+\\.(?:ts|tsx|js|mjs|cjs)$`,
  'u'
);
const SAME_OWNER_DEEP_FILE_PATTERN = new RegExp(
  `^${PRODUCT_SOURCE_ROOT}/([^/]+)/.+/([^/]+)\\.(?:ts|tsx|js|mjs|cjs)$`,
  'u'
);
const ROOT_FILE_PATTERN = new RegExp(
  `^${PRODUCT_SOURCE_ROOT}/([^/]+)/([^/]+)\\.(?:ts|tsx|js|mjs|cjs)$`,
  'u'
);
const TEST_FILE_PATTERN = /\.(?:test|spec)\.(?:ts|tsx)$/u;
const SUPPORT_FILE_PATTERN =
  /\.(?:test-helpers|test-support|fixtures|test\.fixtures|test\.helpers)\.(?:ts|tsx)$/u;
const REGISTRY_EXACT_FILES = new Set([
  'tooling/configs/qa/validation-manifest.json',
  'tooling/configs/qa/manifest-permissions.data.json',
  'tooling/qa/core/runtime-topology.data.json',
]);
const REGISTRY_NAME_MARKERS = ['.data.', '.rules.', '.registry.'];

function isRegistryFile(file) {
  return (
    file.startsWith('tooling/qa/core/') &&
    (REGISTRY_EXACT_FILES.has(file) ||
      REGISTRY_NAME_MARKERS.some((marker) => file.includes(marker)))
  );
}

function fileImportsTarget(importer, targetFile) {
  const candidates = resolveImportCandidates(targetFile);
  const sourceFile = ts.createSourceFile(
    importer,
    readText(importer),
    ts.ScriptTarget.Latest,
    true
  );

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) {
      const specifier = statement.moduleSpecifier?.getText(sourceFile).slice(1, -1);
      if (
        specifier?.startsWith('.') &&
        candidates.has(resolveRelativeImport(importer, specifier))
      ) {
        return true;
      }
    }
  }

  return false;
}

export function collectFalsePublicSeamHints(codeFiles) {
  const rootFiles = codeFiles.filter(
    (file) =>
      ROOT_OWNER_FILE_PATTERN.test(file) &&
      !TEST_FILE_PATTERN.test(file) &&
      !SUPPORT_FILE_PATTERN.test(file)
  );
  if (rootFiles.length === 0) {
    return [];
  }

  const deeperByOwnerAndName = new Set(
    codeFiles
      .filter((file) => !TEST_FILE_PATTERN.test(file) && !SUPPORT_FILE_PATTERN.test(file))
      .map((file) => file.match(SAME_OWNER_DEEP_FILE_PATTERN))
      .filter(Boolean)
      .map((match) => `${match[1]}:${match[2]}`)
  );
  const allCodeFiles = collectCodeFiles();
  const hints = [];

  for (const rootFile of rootFiles) {
    const match = rootFile.match(ROOT_FILE_PATTERN);
    if (!match || !deeperByOwnerAndName.has(`${match[1]}:${match[2]}`)) {
      continue;
    }

    const importers = allCodeFiles.filter(
      (file) =>
        file !== rootFile && !TEST_FILE_PATTERN.test(file) && fileImportsTarget(file, rootFile)
    );

    if (importers.length === 0) {
      hints.push(
        `root facade candidate has no importer graph: ${rootFile} looks deletable, not public`
      );
    }
  }

  return hints;
}

function walkRegistryFiles(relativeDir, files) {
  const absoluteDirectory = fromRelativePath(relativeDir);
  if (!fs.existsSync(absoluteDirectory) || !fs.statSync(absoluteDirectory).isDirectory()) {
    return;
  }

  for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true })) {
    const childRelativePath = `${relativeDir}/${entry.name}`;
    if (entry.isDirectory()) {
      walkRegistryFiles(childRelativePath, files);
      continue;
    }

    if (isRegistryFile(childRelativePath)) {
      files.push(childRelativePath);
    }
  }
}

function collectRegistryFiles() {
  const files = [];
  walkRegistryFiles('tooling/qa/core', files);
  return files.sort();
}

export function collectPathAuditHints(targetFiles) {
  const registryFiles = collectRegistryFiles();
  const auditTargets = [...new Set([...targetFiles, ...collectDeletedWorkspaceFiles()])];
  const hints = [];

  for (const targetFile of auditTargets) {
    if (!isProductSourcePath(targetFile)) {
      continue;
    }

    const dependentRegistry = registryFiles.find(
      (registryFile) => !fileExists(targetFile) && readText(registryFile).includes(targetFile)
    );
    if (dependentRegistry) {
      hints.push(
        `path-sensitive registry may need sync: ${dependentRegistry} references ${targetFile}`
      );
    }
  }

  return [...new Set(hints)];
}

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { readHeadFileText, readHeadFileTexts } from './git-head-sources.mjs';
import { collectModuleImportGraph } from './module-import-graph.mjs';
import { isCodeFile } from './shared.mjs';
import { classifyOwnerGroup } from './structural-risk/owner-classifier.mjs';

const TEST_FILE_PATTERN = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function indexEdges(edges, key, value) {
  const index = new Map();
  for (const edge of edges) {
    const values = index.get(edge[key]) ?? [];
    values.push(edge[value]);
    index.set(edge[key], values);
  }
  return index;
}

function runHeadPathQuery(root, args) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0 && result.status !== 1) return [];
  return result.stdout
    .split(/\r?\n/u)
    .map((line) => line.replace(/^HEAD:/u, ''))
    .filter(Boolean);
}

function collectManifestTargets(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(collectManifestTargets);
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(collectManifestTargets);
  }
  return [];
}

function resolveExportKeyForTarget(packageRoot, exportKey, target, file) {
  const normalizedTarget = path.posix.normalize(path.posix.join(packageRoot, target));
  if (!normalizedTarget.includes('*')) return normalizedTarget === file ? exportKey : null;
  const [prefix, suffix] = normalizedTarget.split('*');
  if (!file.startsWith(prefix) || !file.endsWith(suffix)) return null;
  const wildcard = file.slice(prefix.length, file.length - suffix.length);
  return exportKey.includes('*') ? exportKey.replace('*', wildcard) : null;
}

function readHeadJson(file) {
  const source = readHeadFileText(file);
  if (source === null) return null;
  try {
    return JSON.parse(source);
  } catch {
    return null;
  }
}

function collectManifestExportEntries(exportsField) {
  if (exportsField == null) return [];
  const hasSubpathKeys =
    typeof exportsField === 'object' &&
    !Array.isArray(exportsField) &&
    Object.keys(exportsField).some((key) => key.startsWith('.'));
  return hasSubpathKeys ? Object.entries(exportsField) : [['.', exportsField]];
}

function toPackageSpecifier(packageName, exportKey) {
  return exportKey === '.'
    ? `@sniptale/${packageName}`
    : `@sniptale/${packageName}${exportKey.slice(1)}`;
}

function collectPackageExportTokens(file) {
  const packageMatch = file.match(/^packages\/([^/]+)\//u);
  if (!packageMatch) return [];
  const packageName = packageMatch[1];
  const packageRoot = `packages/${packageName}`;
  const manifest = readHeadJson(`${packageRoot}/package.json`);
  return [
    ...new Set(
      collectManifestExportEntries(manifest?.exports).flatMap(([exportKey, declaration]) =>
        collectManifestTargets(declaration)
          .map((target) => resolveExportKeyForTarget(packageRoot, exportKey, target, file))
          .filter((resolvedKey) => resolvedKey !== null)
          .map((resolvedKey) => toPackageSpecifier(packageName, resolvedKey))
      )
    ),
  ];
}

function collectHeadSearchTokens(file) {
  const extension = path.posix.extname(file);
  const stem = path.posix.basename(file, extension);
  const tokens = [`/${stem}`, ...collectPackageExportTokens(file)];
  if (stem !== 'index') return [...new Set(tokens)];
  tokens.push(`/${path.posix.basename(path.posix.dirname(file))}`);
  return [...new Set(tokens)];
}

function collectHeadCandidateImporters(file, root) {
  const candidates = new Set();
  for (const token of collectHeadSearchTokens(file)) {
    for (const candidate of runHeadPathQuery(root, [
      'grep',
      '-l',
      '-F',
      '-e',
      token,
      'HEAD',
      '--',
      '*.ts',
      '*.tsx',
      '*.js',
      '*.jsx',
      '*.mjs',
      '*.cjs',
    ])) {
      candidates.add(candidate);
    }
  }
  if (path.posix.basename(file, path.posix.extname(file)) === 'index') {
    for (const candidate of runHeadPathQuery(root, [
      'ls-tree',
      '-r',
      '--name-only',
      'HEAD',
      '--',
      path.posix.dirname(file),
    ])) {
      candidates.add(candidate);
    }
  }
  return [...candidates]
    .filter(
      (candidate) =>
        candidate !== file && isCodeFile(candidate) && !TEST_FILE_PATTERN.test(candidate)
    )
    .sort();
}

function collectHeadImporters(file, root) {
  const candidates = collectHeadCandidateImporters(file, root);
  const sourceByFile = readHeadFileTexts([file, ...candidates]);
  if (sourceByFile.get(file) === null) return [];
  const availableFiles = [...sourceByFile]
    .filter(([, source]) => source !== null)
    .map(([candidate]) => candidate);
  const graph = collectModuleImportGraph({
    files: availableFiles,
    root,
    readFile(candidate) {
      return sourceByFile.get(candidate) ?? readHeadFileText(candidate) ?? '';
    },
  });
  return uniqueSorted(
    graph.codeEdges.filter((edge) => edge.target === file).map((edge) => edge.importer)
  );
}

function collectCurrentGraph(productionCodeFiles, root) {
  if (productionCodeFiles.length === 0) return null;
  if (productionCodeFiles.some((file) => !fs.existsSync(path.join(root, file)))) return null;
  return collectModuleImportGraph({
    files: productionCodeFiles,
    root,
    readFile(file) {
      return fs.readFileSync(path.join(root, file), 'utf8');
    },
  });
}

function collectPreviousConsumerFrontier(file, currentFiles, targetFiles, root) {
  const frontier = new Set();
  const visited = new Set([file]);
  const queue = [file];
  let hasUncoveredTerminal = false;

  while (queue.length > 0) {
    const target = queue.shift();
    const importers = collectHeadImporters(target, root);
    if (importers.length === 0) {
      hasUncoveredTerminal = true;
      continue;
    }
    for (const importer of importers) {
      if (currentFiles.has(importer)) {
        frontier.add(importer);
      } else if (targetFiles.has(importer) && !visited.has(importer)) {
        visited.add(importer);
        queue.push(importer);
      } else {
        hasUncoveredTerminal = true;
      }
    }
  }

  return hasUncoveredTerminal ? [] : [...frontier].sort();
}

function expandCurrentSuccessors(frontier, currentEdges, currentFiles) {
  const successors = new Set(frontier);
  const queue = [...frontier];
  while (queue.length > 0) {
    const importer = queue.shift();
    for (const target of currentEdges.get(importer) ?? []) {
      if (!currentFiles.has(target) || successors.has(target)) continue;
      successors.add(target);
      queue.push(target);
    }
  }
  return [...successors].sort();
}

export function collectDeletedTargetSuccessors({
  productionCodeFiles = [],
  productionTargetFiles = [],
  root = process.cwd(),
} = {}) {
  const currentFiles = new Set(productionCodeFiles);
  const targetFiles = new Set(productionTargetFiles);
  const deletedFiles = productionTargetFiles.filter((file) => !currentFiles.has(file));
  const currentGraph = collectCurrentGraph(productionCodeFiles, root);
  if (!currentGraph) return new Map();

  const currentEdges = indexEdges(currentGraph.codeEdges, 'importer', 'target');
  const successorsByFile = new Map();

  for (const file of deletedFiles) {
    const frontier = collectPreviousConsumerFrontier(file, currentFiles, targetFiles, root);
    if (frontier.length === 0) continue;
    const successors = expandCurrentSuccessors(frontier, currentEdges, currentFiles);
    if (new Set(successors.map(classifyOwnerGroup)).size !== 1) continue;
    successorsByFile.set(file, successors);
  }

  return successorsByFile;
}

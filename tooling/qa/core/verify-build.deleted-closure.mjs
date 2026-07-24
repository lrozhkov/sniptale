import fs from 'node:fs';
import path from 'node:path';

import { resolveDeterministicFocusedCoverageOwnerTests } from './focused-coverage-owner-tests.mjs';
import { isBuildTestFile } from './build-test-file-classifier.mjs';
import {
  listHeadCodeFilesContainingText,
  listHeadFilesUnderPath,
  readHeadFileText,
} from './git-head-sources.mjs';
import { collectModuleImportGraph } from './module-import-graph.mjs';
import { isCodeFile } from './shared.mjs';
import { classifyOwnerGroup } from './structural-risk/owner-classifier.mjs';
import {
  collectDeletedAggregateProviders,
  createDeletedAggregateAnalyzer,
} from './verify-build.deleted-aggregate.mjs';
import { createDeletedDeadExportAnalyzer } from './verify-build.deleted-dead-export.mjs';

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

function readHeadJson(file, readHeadSource) {
  const source = readHeadSource(file);
  if (source === null) return { complete: false, value: null };
  try {
    return { complete: true, value: JSON.parse(source) };
  } catch {
    return { complete: false, value: null };
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

function collectPackageExportTokens(file, readHeadSource) {
  const packageMatch = file.match(/^packages\/([^/]+)\//u);
  if (!packageMatch) return { complete: true, tokens: [] };
  const packageName = packageMatch[1];
  const packageRoot = `packages/${packageName}`;
  const manifest = readHeadJson(`${packageRoot}/package.json`, readHeadSource);
  if (!manifest.complete) return { complete: false, tokens: [] };
  return {
    complete: true,
    tokens: [
      ...new Set(
        collectManifestExportEntries(manifest.value?.exports).flatMap(([exportKey, declaration]) =>
          collectManifestTargets(declaration)
            .map((target) => resolveExportKeyForTarget(packageRoot, exportKey, target, file))
            .filter((resolvedKey) => resolvedKey !== null)
            .map((resolvedKey) => toPackageSpecifier(packageName, resolvedKey))
        )
      ),
    ],
  };
}

function collectHeadSearchTokens(file, readHeadSource) {
  const extension = path.posix.extname(file);
  const stem = path.posix.basename(file, extension);
  const packageTokens = collectPackageExportTokens(file, readHeadSource);
  if (!packageTokens.complete) return { complete: false, tokens: [] };
  const tokens = [`/${stem}`, ...packageTokens.tokens];
  if (stem !== 'index') return { complete: true, tokens: [...new Set(tokens)] };
  tokens.push(`/${path.posix.basename(path.posix.dirname(file))}`);
  return { complete: true, tokens: [...new Set(tokens)] };
}

function collectHeadCandidateImporters(file, root, readHeadSource) {
  const candidates = new Set();
  const search = collectHeadSearchTokens(file, readHeadSource);
  if (!search.complete) return { candidates: [], complete: false };
  for (const token of search.tokens) {
    const query = listHeadCodeFilesContainingText(token, { root });
    if (!query.complete) return { candidates: [], complete: false };
    for (const candidate of query.files) {
      candidates.add(candidate);
    }
  }
  if (path.posix.basename(file, path.posix.extname(file)) === 'index') {
    const query = listHeadFilesUnderPath(path.posix.dirname(file), { root });
    if (!query.complete) return { candidates: [], complete: false };
    for (const candidate of query.files) {
      candidates.add(candidate);
    }
  }
  return {
    candidates: [...candidates]
      .filter(
        (candidate) => candidate !== file && isCodeFile(candidate) && !isBuildTestFile(candidate)
      )
      .sort(),
    complete: true,
  };
}

function collectHeadImporters(file, root, readHeadSource) {
  const candidateResult = collectHeadCandidateImporters(file, root, readHeadSource);
  if (!candidateResult.complete) return { complete: false, importers: [] };
  const { candidates } = candidateResult;
  const sourceByFile = new Map(
    [file, ...candidates].map((candidate) => [candidate, readHeadSource(candidate)])
  );
  if ([...sourceByFile.values()].some((source) => source === null)) {
    return { complete: false, importers: [] };
  }
  try {
    const graph = collectModuleImportGraph({
      files: [...sourceByFile.keys()],
      root,
      readFile(candidate) {
        const source = sourceByFile.has(candidate)
          ? sourceByFile.get(candidate)
          : readHeadSource(candidate);
        if (source === null || source === undefined) {
          throw new Error(`HEAD source is unavailable: ${candidate}`);
        }
        return source;
      },
    });
    return {
      complete: true,
      importers: uniqueSorted(
        graph.codeEdges.filter((edge) => edge.target === file).map((edge) => edge.importer)
      ),
    };
  } catch {
    return { complete: false, importers: [] };
  }
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

function collectPreviousConsumerFrontier(
  file,
  currentFiles,
  targetFiles,
  resolveHeadImporters,
  analyzeAggregate
) {
  const frontier = new Set();
  const visited = new Set([file]);
  const queue = [file];

  while (queue.length > 0) {
    const target = queue.shift();
    const result = resolveHeadImporters(target);
    if (!result.complete) return { complete: false, frontier: [] };
    const { importers } = result;
    if (importers.length === 0) {
      if (target !== file && !analyzeAggregate(target).eligible) {
        return { complete: false, frontier: [] };
      }
      continue;
    }
    for (const importer of importers) {
      if (currentFiles.has(importer)) {
        frontier.add(importer);
        continue;
      }
      if (!targetFiles.has(importer)) {
        return { complete: false, frontier: [] };
      }
      if (visited.has(importer)) continue;
      visited.add(importer);
      queue.push(importer);
    }
  }

  return { complete: true, frontier: [...frontier].sort() };
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

function hasCurrentProviderRedirect(frontier, providers, productionCodeFiles, root) {
  if (frontier.length === 0) return true;
  const providerSet = new Set(providers);
  const graphFiles = uniqueSorted([...productionCodeFiles, ...providers]);
  const graph = collectCurrentGraph(graphFiles, root);
  if (!graph) return false;
  const edges = indexEdges(graph.codeEdges, 'importer', 'target');

  return frontier.every((consumer) => {
    const visited = new Set([consumer]);
    const queue = [consumer];
    while (queue.length > 0) {
      const importer = queue.shift();
      for (const target of edges.get(importer) ?? []) {
        if (providerSet.has(target)) return true;
        if (visited.has(target)) continue;
        visited.add(target);
        queue.push(target);
      }
    }
    return false;
  });
}

function createHeadSourceResolver() {
  const sourcesByFile = new Map();
  return function readHeadSource(file) {
    if (!sourcesByFile.has(file)) {
      sourcesByFile.set(file, readHeadFileText(file));
    }
    return sourcesByFile.get(file);
  };
}

function createHeadImporterResolver({ headImporterResolver, readHeadSource, root }) {
  const importersByFile = new Map();
  const collectImporters =
    headImporterResolver ?? ((file) => collectHeadImporters(file, root, readHeadSource));
  return function resolveHeadImporters(file) {
    if (!importersByFile.has(file)) {
      const result = collectImporters(file);
      importersByFile.set(
        file,
        Array.isArray(result) ? { complete: true, importers: result } : result
      );
    }
    return importersByFile.get(file);
  };
}

function resolveChangedConsumerProof(frontier, currentEdges, currentFiles) {
  if (frontier.length === 0) return null;
  const successors = expandCurrentSuccessors(frontier, currentEdges, currentFiles);
  return new Set(successors.map(classifyOwnerGroup)).size === 1 ? successors : null;
}

function resolveAggregateProviderProof({
  analyzeAggregate,
  file,
  frontier,
  isDeletedDeadExport,
  productionCodeFiles,
  providerOwnerTestResolver,
  readHeadSource,
  root,
  targetFiles,
}) {
  const providers = collectDeletedAggregateProviders({
    analyzeAggregate,
    file,
    isDeletedDeadExport,
    readHeadSource,
    root,
    targets: targetFiles,
  });
  return providers.length > 0 &&
    providers.every((provider) => providerOwnerTestResolver(provider).length > 0) &&
    hasCurrentProviderRedirect(frontier, providers, productionCodeFiles, root)
    ? { files: providers, proofKind: 'aggregate-providers' }
    : null;
}

export function collectDeletedTargetSuccessors({
  headImporterResolver,
  providerOwnerTestResolver = resolveDeterministicFocusedCoverageOwnerTests,
  productionCodeFiles = [],
  productionTargetFiles = [],
  root = process.cwd(),
} = {}) {
  const currentFiles = new Set(productionCodeFiles);
  const targetFiles = new Set(productionTargetFiles);
  const deletedFiles = productionTargetFiles.filter((file) => !currentFiles.has(file));
  const currentGraph = collectCurrentGraph(productionCodeFiles, root);
  const currentEdges = currentGraph
    ? indexEdges(currentGraph.codeEdges, 'importer', 'target')
    : new Map();
  const successorsByFile = new Map();
  const readHeadSource = createHeadSourceResolver();
  const resolveHeadImporters = createHeadImporterResolver({
    headImporterResolver,
    readHeadSource,
    root,
  });
  const analyzeAggregate = createDeletedAggregateAnalyzer(readHeadSource);
  const isDeletedDeadExport = createDeletedDeadExportAnalyzer({
    analyzeAggregate,
    deletedFiles: new Set(deletedFiles),
    readHeadSource,
    root,
  });

  for (const file of deletedFiles) {
    const frontier = collectPreviousConsumerFrontier(
      file,
      currentFiles,
      targetFiles,
      resolveHeadImporters,
      analyzeAggregate
    );
    if (!frontier.complete) continue;
    const changedConsumerProof = resolveChangedConsumerProof(
      frontier.frontier,
      currentEdges,
      currentFiles
    );
    if (changedConsumerProof) {
      successorsByFile.set(file, changedConsumerProof);
      continue;
    }
    const aggregateProviderProof = resolveAggregateProviderProof({
      analyzeAggregate,
      file,
      frontier: frontier.frontier,
      isDeletedDeadExport,
      productionCodeFiles,
      providerOwnerTestResolver,
      readHeadSource,
      root,
      targetFiles,
    });
    if (aggregateProviderProof) {
      successorsByFile.set(file, aggregateProviderProof);
      continue;
    }
    if (frontier.frontier.length === 0 && analyzeAggregate(file).eligible) {
      successorsByFile.set(file, { files: [], proofKind: 'dead-export' });
      continue;
    }
    if (isDeletedDeadExport(file)) {
      successorsByFile.set(file, { files: [], proofKind: 'dead-export' });
    }
  }

  return successorsByFile;
}

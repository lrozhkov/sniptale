import path from 'node:path';

import { getRuntimeTopology } from './runtime-topology.mjs';
import { collectTopologyModuleGraph } from './topology-fragmentation.graph.mjs';
import {
  classifyTopologyChangeReason,
  decideTopologyCluster,
  isTopologyProxyPath,
} from './topology-fragmentation.policy.mjs';

const APP_PUBLIC_ROOT_PATTERN =
  /^apps\/extension\/src\/(?:composition|contracts|features|foundation|platform|ui|workflows)(?:\/|$)/u;

function runtimeFor(file, runtimes) {
  return runtimes.find(({ root }) => file === root || file.startsWith(`${root}/`)) ?? null;
}

function clusterKey(file, runtimes) {
  const runtime = runtimeFor(file, runtimes);
  if (runtime) return boundedOwnerKey(file, runtime.root, 2);
  if (file.startsWith('apps/extension/src/')) {
    return boundedOwnerKey(file, 'apps/extension/src', 3);
  }
  const packageMatch = file.match(/^packages\/[^/]+\/src(?:\/|$)/u);
  if (packageMatch) return boundedOwnerKey(file, packageMatch[0].replace(/\/$/u, ''), 2);
  if (file.startsWith('tooling/')) return boundedOwnerKey(file, 'tooling', 3);
  if (file.startsWith('src/')) return boundedOwnerKey(file, 'src', 2);
  return path.posix.dirname(file);
}

function boundedOwnerKey(file, root, depth) {
  const directory = path.posix.dirname(file);
  const relativeDirectory = directory === root ? '' : directory.slice(root.length + 1);
  const segments = relativeDirectory ? relativeDirectory.split('/').slice(0, depth) : [];
  return segments.length > 0 ? `${root}/${segments.join('/')}` : root;
}

function exactPackageExportTargets(graph, readFile) {
  const targets = new Set();
  const packageNames = new Set(
    graph.files.flatMap((file) => file.match(/^packages\/([^/]+)\//u)?.slice(1, 2) ?? [])
  );
  function visit(value, packageRoot) {
    if (typeof value === 'string') {
      const target = path.posix.normalize(path.posix.join(packageRoot, value));
      if (graph.files.includes(target)) targets.add(target);
      return;
    }
    if (Array.isArray(value)) return value.forEach((item) => visit(item, packageRoot));
    if (value && typeof value === 'object') {
      Object.values(value).forEach((item) => visit(item, packageRoot));
    }
  }
  for (const packageName of packageNames) {
    const packagePath = `packages/${packageName}/package.json`;
    try {
      visit(JSON.parse(readFile(packagePath)).exports, path.posix.dirname(packagePath));
    } catch {
      // A missing or invalid package manifest cannot prove a public contract.
    }
  }
  return targets;
}

function collectPublicContractFiles(graph, runtimes, readFile) {
  const publicFiles = exactPackageExportTargets(graph, readFile);
  for (const runtime of runtimes) {
    runtime.entrypointFiles.forEach((file) => {
      if (graph.files.includes(file)) publicFiles.add(file);
    });
  }
  for (const edge of graph.codeEdges) {
    const importerRuntime = runtimeFor(edge.importer, runtimes);
    const targetRuntime = runtimeFor(edge.target, runtimes);
    if (importerRuntime && APP_PUBLIC_ROOT_PATTERN.test(edge.target)) publicFiles.add(edge.target);
    if (importerRuntime && targetRuntime && importerRuntime.id !== targetRuntime.id) {
      publicFiles.add(edge.target);
    }
  }
  return publicFiles;
}

function collectIncomingConsumers(graph) {
  const incoming = new Map(graph.files.map((file) => [file, new Set()]));
  graph.codeEdges.forEach((edge) => incoming.get(edge.target)?.add(edge.importer));
  return incoming;
}

function collectReExportCycleFiles(graph) {
  const adjacency = new Map();
  for (const edge of graph.codeEdges) {
    if (edge.edgeKind !== 're-export') continue;
    const targets = adjacency.get(edge.importer) ?? [];
    targets.push(edge.target);
    adjacency.set(edge.importer, targets);
  }
  adjacency.forEach((targets) => targets.sort());
  const active = new Set();
  const visited = new Set();
  const cycleFiles = new Set();
  function visit(file, stack) {
    if (active.has(file)) {
      const start = stack.indexOf(file);
      stack.slice(start).forEach((item) => cycleFiles.add(item));
      return;
    }
    if (visited.has(file)) return;
    visited.add(file);
    active.add(file);
    for (const target of adjacency.get(file) ?? []) visit(target, [...stack, file]);
    active.delete(file);
  }
  [...adjacency.keys()].sort().forEach((file) => visit(file, []));
  return cycleFiles;
}

function facadeDepth(files, graph, moduleByFile) {
  const fileSet = new Set(files);
  const adjacency = new Map();
  graph.codeEdges.forEach((edge) => {
    if (!fileSet.has(edge.importer) || !fileSet.has(edge.target)) return;
    if (!moduleByFile.get(edge.importer)?.forwardingOnly) return;
    const targets = adjacency.get(edge.importer) ?? [];
    targets.push(edge.target);
    adjacency.set(edge.importer, targets);
  });
  function depth(file, seen = new Set()) {
    if (seen.has(file)) return 0;
    const next = new Set(seen).add(file);
    return Math.max(0, ...(adjacency.get(file) ?? []).map((target) => 1 + depth(target, next)));
  }
  return Math.max(0, ...files.map((file) => depth(file)));
}

function collectClusterTopology(files, context) {
  const fileSet = new Set(files);
  const internalEdges = context.graph.codeEdges.filter(
    (edge) => fileSet.has(edge.importer) && fileSet.has(edge.target)
  );
  const touchingEdges = context.graph.codeEdges.filter(
    (edge) => fileSet.has(edge.importer) || fileSet.has(edge.target)
  );
  const externalConsumers = context.graph.codeEdges.filter(
    (edge) => fileSet.has(edge.target) && !fileSet.has(edge.importer)
  );
  const crossClusterConsumers = new Set(externalConsumers.map((edge) => edge.importer));
  const crossRuntimeConsumers = new Set(
    externalConsumers
      .filter((edge) => {
        const importerRuntime = runtimeFor(edge.importer, context.runtimes);
        const targetRuntime = runtimeFor(edge.target, context.runtimes);
        return importerRuntime && targetRuntime && importerRuntime.id !== targetRuntime.id;
      })
      .map((edge) => edge.importer)
  );
  return {
    crossRuntimeConsumers: crossRuntimeConsumers.size,
    internalEdges: internalEdges.length,
    crossClusterConsumers: crossClusterConsumers.size,
    navigationTransitions: new Set(touchingEdges.map((edge) => `${edge.importer}->${edge.target}`))
      .size,
    unresolvedEdges: context.graph.unresolvedEdges.filter((edge) => fileSet.has(edge.importer))
      .length,
    resourceEdges: context.graph.resourceEdges.filter((edge) => fileSet.has(edge.importer)).length,
    reExportCycle: files.some((file) => context.cycleFiles.has(file)),
  };
}

function collectClusterStructuralMetrics(metrics) {
  const effectFamilies = [...new Set(metrics.flatMap((metric) => metric.effectFamilies))].sort();
  const stateReceivers = [
    ...new Set(metrics.flatMap((metric) => metric.stateReceiverNames)),
  ].sort();
  const classifiedCalls = metrics.reduce((sum, metric) => sum + metric.classifiedCallCount, 0);
  const cohesion =
    classifiedCalls === 0
      ? 1
      : metrics.reduce((sum, metric) => sum + metric.cohesion * metric.classifiedCallCount, 0) /
        classifiedCalls;
  return {
    moduleExports: metrics.reduce((sum, metric) => sum + metric.exports, 0),
    stateMutationPoints: metrics.reduce((sum, metric) => sum + metric.stateAuthorities, 0),
    stateMutationFiles: metrics.filter((metric) => metric.stateAuthorities > 0).length,
    lexicalStateReceivers: stateReceivers,
    unresolvedStateAuthorities: metrics.reduce(
      (sum, metric) => sum + metric.unresolvedStateAuthorityCount,
      0
    ),
    effectFamilies,
    effectfulClusters: metrics.reduce((sum, metric) => sum + metric.effectfulClusters, 0),
    recoveryPressure: metrics.reduce(
      (sum, metric) => sum + metric.functions.reduce((inner, fn) => inner + fn.recoveryPressure, 0),
      0
    ),
    classifiedCallCount: classifiedCalls,
    cohesion,
    maximumStructuralScore: Math.max(0, ...metrics.map((metric) => metric.score)),
  };
}

function collectFragmentationSignals(files, metrics, context) {
  return {
    forwardingOnlyFiles: files.filter((file) => context.moduleByFile.get(file).forwardingOnly)
      .length,
    passThroughFiles: files.filter((file) => context.moduleByFile.get(file).passThrough).length,
    proxyFamilyFiles: files.filter(isTopologyProxyPath).length,
    singleConsumerSmallFiles: metrics.filter(
      (metric) =>
        metric.lines <= 60 &&
        context.incoming.get(metric.file)?.size === 1 &&
        !context.publicFiles.has(metric.file)
    ).length,
    delegationOnlyTests: files.filter((file) => context.moduleByFile.get(file).delegationOnlyTest)
      .length,
    facadeDepth: facadeDepth(files, context.graph, context.moduleByFile),
  };
}

function buildCluster(key, metrics, context) {
  const files = metrics.map((metric) => metric.file).sort();
  const details = metrics.map((metric) => ({
    file: metric.file,
    reason: classifyTopologyChangeReason(metric.file, metric, context.publicFiles),
  }));
  const cluster = {
    id: key,
    files,
    fileCount: files.length,
    fileDetails: details,
    fileMetrics: metrics,
    changeReasons: [...new Set(details.map(({ reason }) => reason))].sort(),
    provenPublicContractFiles: files.filter((file) => context.publicFiles.has(file)),
    ...collectClusterTopology(files, context),
    ...collectClusterStructuralMetrics(metrics),
    signals: collectFragmentationSignals(files, metrics, context),
  };
  return { ...cluster, ...decideTopologyCluster(cluster, context) };
}

export function collectTopologyFragmentationReport({ files, structuralReport, root, readFile }) {
  const graph = collectTopologyModuleGraph({ files, root, readFile });
  const metricsByFile = new Map(structuralReport.files.map((metric) => [metric.file, metric]));
  const eligibleMetrics = graph.files.map((file) => metricsByFile.get(file)).filter(Boolean);
  const runtimes = [...getRuntimeTopology(root)].sort(
    (left, right) => right.root.length - left.root.length
  );
  const moduleByFile = new Map(graph.modules.map((module) => [module.file, module]));
  const publicFiles = collectPublicContractFiles(graph, runtimes, readFile);
  const incoming = collectIncomingConsumers(graph);
  const cycleFiles = collectReExportCycleFiles(graph);
  const grouped = new Map();
  for (const metric of eligibleMetrics) {
    const key = clusterKey(metric.file, runtimes);
    const group = grouped.get(key) ?? [];
    group.push(metric);
    grouped.set(key, group);
  }
  const findingFiles = new Set(
    [...structuralReport.violations, ...structuralReport.advisories].map((finding) => finding.file)
  );
  const context = { graph, runtimes, moduleByFile, publicFiles, incoming, cycleFiles };
  const allClusters = [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, metrics]) =>
      buildCluster(
        key,
        metrics.sort((a, b) => a.file.localeCompare(b.file)),
        context
      )
    );
  const clusters = allClusters.filter(
    (cluster) =>
      cluster.decision === 'Split' ||
      cluster.reExportCycle ||
      Object.values(cluster.signals).some((value) => value > 0) ||
      cluster.files.some((file) => findingFiles.has(file))
  );
  const decisions = Object.fromEntries(
    ['Split', 'Consolidate', 'Keep'].map((decision) => [
      decision.toLowerCase(),
      clusters.filter((cluster) => cluster.decision === decision).length,
    ])
  );
  return {
    schemaVersion: 1,
    clusterStrategy: 'path-depth-v1',
    scannedFiles: graph.files.length,
    partitionedFiles: eligibleMetrics.length,
    unresolvedEdges: graph.unresolvedEdges.length,
    clusters,
    summary: {
      totalClusters: allClusters.length,
      candidateClusters: clusters.length,
      ...decisions,
    },
  };
}

export function formatTopologyFragmentationConsole(report, { limit = 12 } = {}) {
  const ordered = [...report.clusters].sort(
    (left, right) =>
      ({ Split: 0, Consolidate: 1, Keep: 2 })[left.decision] -
        { Split: 0, Consolidate: 1, Keep: 2 }[right.decision] ||
      right.maximumStructuralScore - left.maximumStructuralScore ||
      left.id.localeCompare(right.id)
  );
  const summary = [
    `clusters=${report.summary.totalClusters}`,
    `candidates=${report.summary.candidateClusters}`,
    `split=${report.summary.split}`,
    `consolidate=${report.summary.consolidate}`,
    `keep=${report.summary.keep}`,
    `unresolved=${report.unresolvedEdges}`,
  ].join(', ');
  const lines = ['Topology fragmentation (manual report-only)', summary];
  for (const cluster of ordered.slice(0, limit)) {
    lines.push(
      [
        `${cluster.decision}/${cluster.confidence} ${cluster.id}:`,
        `files=${cluster.fileCount},`,
        `transitions=${cluster.navigationTransitions},`,
        `reasons=${cluster.reasons.join('|')}`,
      ].join(' ')
    );
  }
  if (ordered.length > limit)
    lines.push(`... ${ordered.length - limit} more candidate clusters in artifact`);
  return `${lines.join('\n')}\n`;
}

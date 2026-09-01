import path from 'node:path';

import { isBuildTestFile } from '../../../proof/build/build-test-file-classifier.mjs';
import { readAppCoreOwnerPolicy } from '../app-core/app-core-owner-policy.mjs';
import { getRuntimeTopology } from '../runtime-topology/model.mjs';
import {
  classifyAutomaticForwardingKeep,
  classifyCanonicalTopologyOwner,
  collectExactPublicContractFiles,
  runtimeForPath,
} from './evidence.mjs';
import { collectTopologyModuleGraph } from './graph.mjs';
import {
  classifyTopologyChangeReason,
  decideForwardingEdgeCandidate,
  decideTopologyCluster,
  isTopologyProxyPath,
} from './policy.mjs';

function clusterKey(file, runtimes) {
  const runtime = runtimeForPath(file, runtimes);
  if (runtime) return boundedOwnerKey(file, runtime.root, 3);
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

function collectProductionIncomingConsumers(graph) {
  const incoming = new Map(graph.files.map((file) => [file, new Set()]));
  graph.codeEdges.forEach((edge) => {
    if (!isBuildTestFile(edge.importer)) incoming.get(edge.target)?.add(edge.importer);
  });
  return incoming;
}

function collectReExportCycleFiles(graph) {
  const adjacency = new Map();
  for (const edge of graph.codeEdges) {
    if (edge.edgeKind !== 're-export') continue;
    if (isBuildTestFile(edge.importer) || isBuildTestFile(edge.target)) continue;
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
  const productionFiles = files.filter((file) => !isBuildTestFile(file));
  const proofFiles = files.filter(isBuildTestFile);
  const productionFileSet = new Set(productionFiles);
  const proofFileSet = new Set(proofFiles);
  const productionEdges = context.graph.codeEdges.filter(
    (edge) => !isBuildTestFile(edge.importer) && !isBuildTestFile(edge.target)
  );
  const internalEdges = productionEdges.filter(
    (edge) => productionFileSet.has(edge.importer) && productionFileSet.has(edge.target)
  );
  const touchingEdges = productionEdges.filter(
    (edge) => productionFileSet.has(edge.importer) || productionFileSet.has(edge.target)
  );
  const externalConsumers = productionEdges.filter(
    (edge) => productionFileSet.has(edge.target) && !productionFileSet.has(edge.importer)
  );
  const proofEdges = context.graph.codeEdges.filter((edge) => proofFileSet.has(edge.importer));
  const productionToProofEdges = context.graph.codeEdges.filter(
    (edge) => productionFileSet.has(edge.importer) && isBuildTestFile(edge.target)
  );
  const crossClusterConsumers = new Set(externalConsumers.map((edge) => edge.importer));
  const crossRuntimeConsumers = new Set(
    externalConsumers
      .filter((edge) => {
        const importerRuntime = runtimeForPath(edge.importer, context.runtimes);
        const targetRuntime = runtimeForPath(edge.target, context.runtimes);
        return importerRuntime && targetRuntime && importerRuntime.id !== targetRuntime.id;
      })
      .map((edge) => edge.importer)
  );
  return {
    productionFileCount: productionFiles.length,
    proofFileCount: proofFiles.length,
    crossRuntimeConsumers: crossRuntimeConsumers.size,
    internalEdges: internalEdges.length,
    crossClusterConsumers: crossClusterConsumers.size,
    navigationTransitions: new Set(touchingEdges.map((edge) => `${edge.importer}->${edge.target}`))
      .size,
    proofTransitions: new Set(proofEdges.map((edge) => `${edge.importer}->${edge.target}`)).size,
    productionToProofEdges: productionToProofEdges.length,
    unresolvedEdges: context.graph.unresolvedEdges.filter((edge) =>
      productionFileSet.has(edge.importer)
    ).length,
    resourceEdges: context.graph.resourceEdges.filter((edge) =>
      productionFileSet.has(edge.importer)
    ).length,
    reExportCycle: productionFiles.some((file) => context.cycleFiles.has(file)),
  };
}

function collectClusterStructuralMetrics(metrics) {
  const effectFamilies = [...new Set(metrics.flatMap((metric) => metric.effectFamilies))].sort();
  const stateReceivers = [
    ...new Set(metrics.flatMap((metric) => metric.stateReceiverNames)),
  ].sort();
  const stateReceiverKeys = [
    ...new Set(
      metrics.flatMap((metric) => metric.stateReceiverKeys.map((key) => `${metric.file}:${key}`))
    ),
  ].sort();
  const classifiedCalls = metrics.reduce((sum, metric) => sum + metric.classifiedCallCount, 0);
  const cohesion =
    classifiedCalls === 0
      ? 1
      : metrics.reduce((sum, metric) => sum + metric.cohesion * metric.classifiedCallCount, 0) /
        classifiedCalls;
  return {
    moduleExports: metrics.reduce((sum, metric) => sum + metric.exports, 0),
    stateAuthorityPoints: metrics.reduce((sum, metric) => sum + metric.stateAuthorities, 0),
    stateMutationFiles: metrics.filter((metric) => metric.stateAuthorities > 0).length,
    lexicalStateReceivers: stateReceivers,
    lexicalStateReceiverKeys: stateReceiverKeys,
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
  const productionFiles = files.filter((file) => !isBuildTestFile(file));
  const productionMetrics = metrics.filter((metric) => !isBuildTestFile(metric.file));
  return {
    forwardingOnlyFiles: productionFiles.filter(
      (file) => context.moduleByFile.get(file).forwardingOnly
    ).length,
    passThroughFiles: productionFiles.filter((file) => context.moduleByFile.get(file).passThrough)
      .length,
    proxyFamilyFiles: productionFiles.filter(isTopologyProxyPath).length,
    singleConsumerSmallFiles: productionMetrics.filter(
      (metric) =>
        metric.lines <= 60 &&
        context.productionIncoming.get(metric.file)?.size === 1 &&
        !context.publicFiles.has(metric.file)
    ).length,
    delegationOnlyTests: files.filter((file) => context.moduleByFile.get(file).delegationOnlyTest)
      .length,
    facadeDepth: facadeDepth(productionFiles, context.graph, context.moduleByFile),
  };
}

function buildCluster(key, metrics, context) {
  const files = metrics.map((metric) => metric.file).sort();
  const productionMetrics = metrics.filter((metric) => !isBuildTestFile(metric.file));
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
    provenPublicContractFiles: productionMetrics
      .map((metric) => metric.file)
      .filter((file) => context.publicFiles.has(file)),
    ...collectClusterTopology(files, context),
    ...collectClusterStructuralMetrics(productionMetrics),
    signals: collectFragmentationSignals(files, metrics, context),
  };
  return { ...cluster, ...decideTopologyCluster(cluster, context) };
}

function resolveStableMergeTarget(consumer, context) {
  const visited = new Set();
  let current = consumer;
  while (context.moduleByFile.get(current)?.forwardingOnly) {
    if (visited.has(current) || context.cycleFiles.has(current)) {
      return { blockedAt: current, blockReason: 'forwarding-cycle', mergeTarget: null };
    }
    visited.add(current);
    if (context.graph.unresolvedEdges.some((edge) => edge.importer === current)) {
      return { blockedAt: current, blockReason: 'unresolved-intermediate-edge', mergeTarget: null };
    }
    const consumers = [...(context.productionIncoming.get(current) ?? [])];
    if (consumers.length !== 1) {
      return {
        blockedAt: current,
        blockReason:
          consumers.length === 0 ? 'forwarding-terminal' : 'multiple-production-consumers',
        mergeTarget: null,
      };
    }
    const next = consumers[0];
    const nextOwner = context.ownerFor(next);
    const currentOwner = context.ownerFor(current);
    if (!nextOwner || !currentOwner || nextOwner.id !== currentOwner.id) {
      return { blockedAt: current, blockReason: 'cross-owner-ladder', mergeTarget: null };
    }
    current = next;
  }
  return { blockedAt: null, blockReason: null, mergeTarget: current };
}

function buildForwardingEdgeClusters(context, metricsByFile) {
  return context.graph.modules
    .filter(({ file, forwardingOnly }) => forwardingOnly && !isBuildTestFile(file))
    .flatMap((module) => {
      const consumers = [...(context.productionIncoming.get(module.file) ?? [])];
      if (consumers.length !== 1) return [];
      const consumerFile = consumers[0];
      const targetFiles = [
        ...new Set(
          context.graph.codeEdges
            .filter((edge) => edge.importer === module.file && edge.edgeKind === 're-export')
            .map((edge) => edge.target)
        ),
      ].sort();
      const mergeTargetResolution = resolveStableMergeTarget(consumerFile, context);
      const { mergeTarget } = mergeTargetResolution;
      const files = [
        ...new Set([module.file, consumerFile, mergeTarget, ...targetFiles].filter(Boolean)),
      ].sort();
      const metrics = files.map((file) => metricsByFile.get(file)).filter(Boolean);
      if (metrics.length === 0) return [];
      const base = buildCluster(`forwarding:${module.file}`, metrics, context);
      const forwardingMetric = metricsByFile.get(module.file);
      const automaticKeep = classifyAutomaticForwardingKeep({
        appCorePolicy: context.appCorePolicy,
        consumer: consumerFile,
        forwarder: module.file,
        publicFiles: context.publicFiles,
        runtimes: context.runtimes,
      });
      const candidate = {
        ...base,
        clusterKind: 'forwarding-edge',
        partitionOverlap: true,
        forwardingFiles: [module.file],
        consumerFile,
        targetFiles,
        mergeTarget,
        mergeTargetBlockedAt: mergeTargetResolution.blockedAt,
        mergeTargetBlockReason: mergeTargetResolution.blockReason,
        forwarderOwner: context.ownerFor(module.file)?.id ?? null,
        consumerOwner: context.ownerFor(consumerFile)?.id ?? null,
        automaticKeep,
        forwarderUnresolvedEdges: context.graph.unresolvedEdges.filter(
          (edge) => edge.importer === module.file
        ).length,
        signals: {
          ...base.signals,
          forwardingOnlyFiles: 1,
          singleConsumerSmallFiles: Number((forwardingMetric?.lines ?? Infinity) <= 60),
        },
      };
      return [{ ...candidate, ...decideForwardingEdgeCandidate(candidate) }];
    });
}

export function collectTopologyFragmentationReport({ files, structuralReport, root, readFile }) {
  const graph = collectTopologyModuleGraph({ files, root, readFile });
  const metricsByFile = new Map(structuralReport.files.map((metric) => [metric.file, metric]));
  const eligibleMetrics = graph.files.map((file) => metricsByFile.get(file)).filter(Boolean);
  const runtimes = [...getRuntimeTopology(root)].sort(
    (left, right) => right.root.length - left.root.length
  );
  const moduleByFile = new Map(graph.modules.map((module) => [module.file, module]));
  const publicFiles = collectExactPublicContractFiles(graph, runtimes, readFile);
  const appCorePolicy = readAppCoreOwnerPolicy();
  const productionIncoming = collectProductionIncomingConsumers(graph);
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
  const context = {
    graph,
    runtimes,
    moduleByFile,
    publicFiles,
    appCorePolicy,
    productionIncoming,
    cycleFiles,
    ownerFor: (file) => classifyCanonicalTopologyOwner(file, { appCorePolicy, runtimes }),
  };
  const partitionClusters = [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, metrics]) =>
      buildCluster(
        key,
        metrics.sort((a, b) => a.file.localeCompare(b.file)),
        context
      )
    );
  const forwardingEdgeClusters = buildForwardingEdgeClusters(context, metricsByFile);
  const partitionCandidates = partitionClusters.filter(
    (cluster) =>
      cluster.decision === 'Split' ||
      cluster.reExportCycle ||
      Object.values(cluster.signals).some((value) => value > 0) ||
      cluster.files.some((file) => findingFiles.has(file))
  );
  const clusters = [...partitionCandidates, ...forwardingEdgeClusters];
  const decisions = Object.fromEntries(
    ['Split', 'Consolidate', 'Keep'].map((decision) => [
      decision.toLowerCase(),
      clusters.filter((cluster) => cluster.decision === decision).length,
    ])
  );
  return {
    schemaVersion: 2,
    clusterStrategy: 'path-depth-v3+forwarding-edge-v1',
    scannedFiles: graph.files.length,
    partitionedFiles: eligibleMetrics.length,
    unresolvedEdges: graph.unresolvedEdges.length,
    clusters,
    summary: {
      totalClusters: partitionClusters.length + forwardingEdgeClusters.length,
      partitionClusters: partitionClusters.length,
      forwardingEdgeCandidates: forwardingEdgeClusters.length,
      candidateClusters: clusters.length,
      ...decisions,
    },
  };
}

export function interleaveTopologyClusters(clusters) {
  const decisions = ['Split', 'Consolidate', 'Keep'];
  const groups = new Map(decisions.map((decision) => [decision, []]));
  for (const cluster of clusters) groups.get(cluster.decision)?.push(cluster);
  for (const group of groups.values()) {
    group.sort(
      (left, right) =>
        right.maximumStructuralScore - left.maximumStructuralScore ||
        left.id.localeCompare(right.id)
    );
  }
  const ordered = [];
  const maximumLength = Math.max(0, ...[...groups.values()].map((group) => group.length));
  for (let index = 0; index < maximumLength; index += 1) {
    for (const decision of decisions) {
      const cluster = groups.get(decision)[index];
      if (cluster) ordered.push(cluster);
    }
  }
  return ordered;
}

export function formatTopologyFragmentationConsole(report, { limit = 12 } = {}) {
  const ordered = interleaveTopologyClusters(report.clusters);
  const summary = [
    `clusters=${report.summary.totalClusters}`,
    `candidates=${report.summary.candidateClusters}`,
    `split=${report.summary.split}`,
    `consolidate=${report.summary.consolidate}`,
    `keep=${report.summary.keep}`,
    `forwarding-edges=${report.summary.forwardingEdgeCandidates ?? 0}`,
    `unresolved=${report.unresolvedEdges}`,
  ].join(', ');
  const lines = ['Topology fragmentation (manual report-only)', summary];
  for (const cluster of ordered.slice(0, limit)) {
    lines.push(
      [
        `${cluster.decision}/${cluster.confidence} ${cluster.id}:`,
        `production-files=${cluster.productionFileCount ?? cluster.fileCount},`,
        `proof-files=${cluster.proofFileCount ?? 0},`,
        `transitions=${cluster.navigationTransitions},`,
        `proof-transitions=${cluster.proofTransitions ?? 0},`,
        `reasons=${cluster.reasons.join('|')}`,
      ].join(' ')
    );
  }
  if (ordered.length > limit) {
    lines.push(
      `... ${ordered.length - limit} more candidate clusters not shown; ` +
        'complete forwarding-edge inventory is in artifact'
    );
  }
  return `${lines.join('\n')}\n`;
}

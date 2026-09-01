import path from 'node:path';

import { classifyFinalAppCoreOwnerPath } from '../app-core/app-core-owner-policy.mjs';

export function runtimeForPath(file, runtimes) {
  return runtimes.find(({ root }) => file === root || file.startsWith(`${root}/`)) ?? null;
}

function collectPackageTargets(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(collectPackageTargets);
  if (value && typeof value === 'object')
    return Object.values(value).flatMap(collectPackageTargets);
  return [];
}

export function collectExactPackageExportTargets(graph, readFile) {
  const targets = new Set();
  const packageNames = new Set(
    graph.files.flatMap((file) => file.match(/^packages\/([^/]+)\//u)?.slice(1, 2) ?? [])
  );
  for (const packageName of packageNames) {
    const packagePath = `packages/${packageName}/package.json`;
    try {
      const declaration = JSON.parse(readFile(packagePath)).exports;
      for (const target of collectPackageTargets(declaration)) {
        const resolved = path.posix.normalize(
          path.posix.join(path.posix.dirname(packagePath), target)
        );
        if (graph.files.includes(resolved)) targets.add(resolved);
      }
    } catch {
      // A missing or invalid manifest cannot prove a public contract.
    }
  }
  return targets;
}

export function collectExactPublicContractFiles(graph, runtimes, readFile) {
  const publicFiles = collectExactPackageExportTargets(graph, readFile);
  for (const runtime of runtimes) {
    for (const file of runtime.entrypointFiles) {
      if (graph.files.includes(file)) publicFiles.add(file);
    }
  }
  return publicFiles;
}

export function classifyCanonicalTopologyOwner(file, { appCorePolicy, runtimes }) {
  const runtime = runtimeForPath(file, runtimes);
  if (runtime) {
    return { id: `runtime:${runtime.id}`, kind: 'runtime', runtimeId: runtime.id };
  }

  if (file.startsWith('apps/extension/src/')) {
    try {
      const owner = classifyFinalAppCoreOwnerPath(file, appCorePolicy);
      return { id: `app-core:${owner}`, kind: 'app-core', runtimeId: null };
    } catch {
      return null;
    }
  }

  const packageName = file.match(/^packages\/([^/]+)\//u)?.[1];
  return packageName ? { id: `package:${packageName}`, kind: 'package', runtimeId: null } : null;
}

export function classifyAutomaticForwardingKeep({
  appCorePolicy,
  consumer,
  forwarder,
  publicFiles,
  runtimes,
}) {
  if (publicFiles.has(forwarder)) {
    return { reason: 'public-contract', evidence: forwarder };
  }
  const forwarderOwner = classifyCanonicalTopologyOwner(forwarder, { appCorePolicy, runtimes });
  const consumerOwner = classifyCanonicalTopologyOwner(consumer, { appCorePolicy, runtimes });
  if (!forwarderOwner || !consumerOwner) return null;
  if (
    forwarderOwner.kind === 'runtime' &&
    consumerOwner.kind === 'runtime' &&
    forwarderOwner.runtimeId !== consumerOwner.runtimeId
  ) {
    return {
      reason: 'runtime-boundary',
      evidence: `${forwarderOwner.runtimeId}->${consumerOwner.runtimeId}`,
    };
  }
  return forwarderOwner.id === consumerOwner.id
    ? null
    : {
        reason: 'cross-owner',
        evidence: `${forwarderOwner.id}->${consumerOwner.id}`,
      };
}

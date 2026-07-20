import { SECOND_LEVEL_SCC_REGISTRY } from './architecture-guardrails.data.mjs';
import {
  collectProductionImportEdges,
  createViolation,
} from './architecture-guardrails.helpers.mjs';
import { repoRoot, toRelativePath } from './shared.mjs';
import { collectStronglyConnectedComponents } from './architecture-guardrails.scc-graph.mjs';

// App-core has its own cycle guard; omit it here.
const SECOND_LEVEL_SCC_TOPOLOGY_IGNORE_PATTERNS = [
  /^apps\/extension\/src\/(?:composition|contracts|features|foundation|platform|ui|workflows)\//u,
];

const SECOND_LEVEL_SCC_OUTGOING_EDGE_IGNORE_PATTERNS = [
  /^apps\/extension\/src\/content\/runtime\/bootstrap\.ts$/u,
  /^apps\/extension\/src\/content\/runtime\/bridge\//u,
  /^apps\/extension\/src\/content\/runtime\/diagnostics\/runtime\//u,
  /^apps\/extension\/src\/content\/runtime\/entrypoint\//u,
  /^apps\/extension\/src\/content\/runtime\/message-bridge\//u,
  /^apps\/extension\/src\/content\/runtime\/tab-capture-fallback\//u,
];

function isSecondLevelSccTopologyFile(file) {
  const relativePath = toRelativePath(file);
  return !SECOND_LEVEL_SCC_TOPOLOGY_IGNORE_PATTERNS.some((pattern) => pattern.test(relativePath));
}

function isSecondLevelSccOutgoingEdgeFile(relativePath) {
  return !SECOND_LEVEL_SCC_OUTGOING_EDGE_IGNORE_PATTERNS.some((pattern) =>
    pattern.test(relativePath)
  );
}

function secondLevelOwner(relativePath) {
  const segments = relativePath.split('/');
  if (segments[0] === 'packages' && segments[1]) {
    return segments.slice(0, 2).join('/');
  }
  if (segments.slice(0, 3).join('/') === 'apps/extension/src' && segments[3] && segments[4]) {
    if (segments[3] === 'composition' && segments[4] === 'persistence' && segments[5]) {
      return segments.slice(0, 6).join('/');
    }
    return segments.slice(0, 5).join('/');
  }
  return null;
}

function toOwnerEdge(edge) {
  if (!isSecondLevelSccOutgoingEdgeFile(edge.from)) {
    return null;
  }

  const from = secondLevelOwner(edge.from);
  const to = secondLevelOwner(edge.to);
  return from && to && from !== to ? [from, to] : null;
}

function edgePairKey([from, to]) {
  return `${from}\0${to}`;
}

function ownerSetContainsAll(ownerSet, owners) {
  return ownerSet.size === owners.length && owners.every((owner) => ownerSet.has(owner));
}

function findRegistryEntry(component, registry) {
  return registry.find((entry) => ownerSetContainsAll(new Set(entry.owners), component));
}

function collectComponentEdges(component, edges) {
  const componentOwners = new Set(component);
  const ownerEdges = new Set(
    edges
      .map(toOwnerEdge)
      .filter((edge) => edge && componentOwners.has(edge[0]) && componentOwners.has(edge[1]))
      .map(edgePairKey)
  );
  return [...ownerEdges]
    .map((key) => key.split('\0'))
    .sort((left, right) => edgePairKey(left).localeCompare(edgePairKey(right)));
}

export function collectSecondLevelSccReport(
  files,
  { registry = SECOND_LEVEL_SCC_REGISTRY, root = repoRoot } = {}
) {
  const topologyFiles = files.filter(isSecondLevelSccTopologyFile);
  const topologyEdges = collectProductionImportEdges(topologyFiles, { root }).filter((edge) =>
    isSecondLevelSccTopologyFile(edge.to)
  );
  const ownerEdges = topologyEdges.map(toOwnerEdge).filter(Boolean);
  const components = collectStronglyConnectedComponents(ownerEdges).map((owners) => {
    const entry = findRegistryEntry(owners, registry);
    return {
      owners,
      edges: collectComponentEdges(owners, topologyEdges),
      registryId: entry?.id ?? null,
    };
  });
  const currentRegistryIds = new Set(
    components.map((component) => component.registryId).filter(Boolean)
  );
  return {
    components,
    removed: registry.filter((entry) => !currentRegistryIds.has(entry.id)).map((entry) => entry.id),
  };
}

export function collectSecondLevelSccTrendViolations(
  files,
  { registry = SECOND_LEVEL_SCC_REGISTRY, root = repoRoot } = {}
) {
  const report = collectSecondLevelSccReport(files, { registry, root });
  const violations = [];
  for (const component of report.components) {
    const registryEntry = findRegistryEntry(component.owners, registry);
    if (!registryEntry) {
      violations.push(
        createViolation(
          'second-level-scc',
          component.owners[0],
          [
            `Unregistered second-level owner SCC detected: ${component.owners.join(' -> ')}.`,
            'Add an explicit registry entry with owner and reason or remove the new cycle.',
          ].join(' ')
        )
      );
      continue;
    }

    violations.push(...collectSccEdgeDriftViolations(component, registryEntry));
  }
  for (const registryId of report.removed) {
    violations.push(
      createViolation(
        'second-level-scc-stale',
        'tooling/qa/core/architecture-guardrails.scc-registry.data.json',
        [
          `Registered second-level SCC disappeared: ${registryId}.`,
          'Remove the stale registry entry and its linked technical-debt record.',
        ].join(' ')
      )
    );
  }
  return violations;
}

function collectSccEdgeDriftViolations(component, registryEntry) {
  const allowedEdges = new Set(registryEntry.edges.map(edgePairKey));
  const currentEdges = new Set(component.edges.map(edgePairKey));
  const added = component.edges
    .filter((edge) => !allowedEdges.has(edgePairKey(edge)))
    .map((edge) =>
      createViolation(
        'second-level-scc-edge',
        edge[0],
        [
          `Unregistered edge inside SCC "${registryEntry.id}": ${edge[0]} -> ${edge[1]}.`,
          'Remove the backedge or update the exact reviewed registry.',
        ].join(' ')
      )
    );
  const removed = registryEntry.edges
    .filter((edge) => !currentEdges.has(edgePairKey(edge)))
    .map((edge) =>
      createViolation(
        'second-level-scc-stale-edge',
        edge[0],
        [
          `Registered SCC edge disappeared: ${edge[0]} -> ${edge[1]}.`,
          'Burn the registry down to the live exact edge set.',
        ].join(' ')
      )
    );
  return [...added, ...removed];
}

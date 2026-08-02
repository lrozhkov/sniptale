import path from 'node:path';

import { isBuildTestFile } from './build-test-file-classifier.mjs';
import { isOrchestrationReviewExempt } from './structural-risk/score.mjs';

const CONTRACT_PATTERN =
  /(?:^|\/)(?:contracts?|schemas?|types?)(?:\/|\.)|(?:^|\/)types?\.[cm]?[jt]sx?$/u;
const PROXY_PATTERN =
  /(?:^|\/)(?:getters?|setters?|readers?|refs?|sync|bindings?|facades?|proxies?)(?:\/|\.|$)/u;
const DATA_PATTERN =
  /(?:(?:^|\/)(?:generated|fixtures?|snapshots?|data)(?:\/|\.)|\.(?:data|constants|generated)\.[cm]?[jt]sx?$)/u;
const PRODUCTION_REASONS = new Set(['contract', 'effect-adapter', 'orchestration', 'ui', 'state']);

export function isTopologyProxyPath(file) {
  return PROXY_PATTERN.test(file);
}

export function classifyTopologyChangeReason(file, metric, publicFiles) {
  if (isBuildTestFile(file)) return 'test-proof';
  if (publicFiles.has(file) || CONTRACT_PATTERN.test(file)) return 'contract';
  if (metric.architecturalLayer === 'adapter') return 'effect-adapter';
  if (metric.functions.some((fn) => fn.profile === 'orchestration')) return 'orchestration';
  if (metric.architecturalLayer === 'ui') return 'ui';
  if (metric.stateAuthorities > 0) return 'state';
  if (metric.effectCount > 0) return 'effect-adapter';
  if (isTopologyProxyPath(file)) return 'facade-proxy';
  if (DATA_PATTERN.test(file)) return 'data';
  return 'default';
}

function activeFragmentationFamilies(signals) {
  const families = [];
  if (signals.forwardingOnlyFiles >= 2 || signals.passThroughFiles >= 2) {
    families.push({ family: 'forwarding', weight: 2 });
  }
  if (signals.proxyFamilyFiles >= 3) families.push({ family: 'proxy-family', weight: 2 });
  if (signals.singleConsumerSmallFiles >= 3) {
    families.push({ family: 'single-consumer-small', weight: 1 });
  }
  if (signals.facadeDepth >= 2) families.push({ family: 'facade-ladder', weight: 2 });
  return families;
}

function hasMixedUiEffects(cluster) {
  const effects = new Set(cluster.effectFamilies);
  return (
    effects.has('dom-ui') &&
    ['browser-privilege', 'persistence', 'messaging', 'network'].some((family) =>
      effects.has(family)
    )
  );
}

function hasCohesiveOrchestration(cluster) {
  const orchestrationFunctions = cluster.fileMetrics.flatMap((metric) =>
    metric.functions.filter((fn) => fn.profile === 'orchestration')
  );
  return (
    orchestrationFunctions.length > 0 &&
    orchestrationFunctions.every(
      (metric) => metric.score < 4 || isOrchestrationReviewExempt(metric)
    ) &&
    cluster.cohesion >= 0.7 &&
    cluster.lexicalStateReceiverKeys.length <= 1 &&
    !hasMixedUiEffects(cluster)
  );
}

function safeMergeTarget(cluster, publicFiles, moduleByFile, incoming) {
  if (cluster.lexicalStateReceiverKeys.length > 1) return null;
  const eligibleReasons = [
    ...new Set(cluster.changeReasons.filter((reason) => PRODUCTION_REASONS.has(reason))),
  ];
  const expectedReason =
    eligibleReasons.length === 1
      ? eligibleReasons[0]
      : eligibleReasons.length === 0
        ? 'default'
        : null;
  if (!expectedReason) return null;
  const candidates = cluster.fileDetails.filter(({ file, reason }) => {
    const module = moduleByFile.get(file);
    return (
      reason === expectedReason &&
      !isBuildTestFile(file) &&
      !/^index\.[cm]?[jt]sx?$/u.test(path.posix.basename(file)) &&
      !module.forwardingOnly &&
      !publicFiles.has(file)
    );
  });
  const ranked = candidates
    .map(({ file }) => ({ file, consumers: incoming.get(file)?.size ?? 0 }))
    .sort((left, right) => right.consumers - left.consumers || left.file.localeCompare(right.file));
  if (ranked.length === 0 || ranked[0].consumers === ranked[1]?.consumers) return null;
  return ranked[0].file;
}

export function decideTopologyCluster(cluster, context) {
  if (hasCohesiveOrchestration(cluster)) {
    return { decision: 'Keep', confidence: 'high', reasons: ['cohesive-orchestration-owner'] };
  }
  const splitReasons = collectSplitReasons(cluster);
  if (splitReasons.length > 0) {
    return {
      decision: 'Split',
      confidence: splitReasons.length > 1 ? 'high' : 'medium',
      reasons: splitReasons,
    };
  }
  if (cluster.productionToProofEdges > 0) {
    return {
      decision: 'Keep',
      confidence: 'low',
      reasons: ['production-to-proof-dependency'],
    };
  }
  if (hasUnresolvedTopology(cluster)) {
    return { decision: 'Keep', confidence: 'low', reasons: ['unresolved-topology-or-authority'] };
  }
  if (cluster.provenPublicContractFiles.length > 0) {
    return { decision: 'Keep', confidence: 'high', reasons: ['proven-public-contract'] };
  }
  if (hasContractOrAdapterBoundary(cluster)) {
    return { decision: 'Keep', confidence: 'medium', reasons: ['contract-or-adapter-boundary'] };
  }
  return createConsolidationDecision(cluster, context);
}

export function decideForwardingEdgeCandidate(candidate) {
  if (candidate.productionToProofEdges > 0) {
    return {
      decision: 'Keep',
      confidence: 'low',
      reasons: ['production-to-proof-dependency'],
    };
  }
  if (candidate.forwarderIsPublicOrContract) {
    return {
      decision: 'Keep',
      confidence: 'high',
      reasons: ['proven-public-or-contract-forwarder'],
    };
  }
  if (candidate.forwarderOwner !== candidate.consumerOwner) {
    return {
      decision: 'Keep',
      confidence: 'high',
      reasons: ['cross-owner-forwarding-edge'],
    };
  }
  if (candidate.forwarderUnresolvedEdges > 0 || candidate.targetFiles.length === 0) {
    return {
      decision: 'Keep',
      confidence: 'low',
      reasons: ['unresolved-forwarding-edge'],
    };
  }
  if (!candidate.mergeTarget) {
    return {
      decision: 'Keep',
      confidence: 'low',
      reasons: ['unresolved-forwarding-target'],
    };
  }
  return {
    decision: 'Consolidate',
    confidence: 'medium',
    reasons: ['forwarding', 'single-production-consumer'],
    mergeTarget: candidate.mergeTarget,
  };
}

function collectSplitReasons(cluster) {
  const mixedA = hasMixedUiEffects(cluster) && cluster.stateMutationFiles >= 2;
  const productionReasons = new Set(
    cluster.changeReasons.filter((reason) => PRODUCTION_REASONS.has(reason))
  );
  const mixedB =
    productionReasons.size >= 3 && cluster.effectFamilies.length >= 3 && cluster.cohesion < 0.5;
  return [mixedA && 'mixed-ui-effects-state', mixedB && 'mixed-change-reasons'].filter(Boolean);
}

function hasUnresolvedTopology(cluster) {
  return [
    cluster.unresolvedEdges,
    cluster.unresolvedStateAuthorities,
    Number(cluster.reExportCycle),
  ].some((value) => value > 0);
}

function hasContractOrAdapterBoundary(cluster) {
  return cluster.changeReasons.some((reason) => ['contract', 'effect-adapter'].includes(reason));
}

function createConsolidationDecision(cluster, context) {
  const families = activeFragmentationFamilies(cluster.signals);
  const weight = families.reduce((sum, item) => sum + item.weight, 0);
  const mergeTarget = safeMergeTarget(
    cluster,
    context.publicFiles,
    context.moduleByFile,
    context.productionIncoming
  );
  if (families.length < 2 || weight < 4 || !mergeTarget)
    return { decision: 'Keep', confidence: 'low', reasons: ['insufficient-corroborated-evidence'] };
  return {
    decision: 'Consolidate',
    confidence: families.length >= 3 ? 'medium' : 'low',
    reasons: families.map((item) => item.family),
    mergeTarget,
  };
}

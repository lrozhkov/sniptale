import { isBuildTestFile } from '../../../proof/build/build-test-file-classifier.mjs';
import {
  createHeadFileTextResolver,
  readRevisionFileText,
} from '../../../analysis/git/git-head-sources.mjs';
import { collectCodeFiles } from '../../../analysis/repository/shared-files.mjs';
import { readText, repoRoot, toRelativePath } from '../../../analysis/repository/shared-paths.mjs';
import { resolveFocusedFiles } from '../../../composition/checkpoint/focused-qa-helpers.mjs';
import {
  isExecutedAsScript,
  parseFilesArgument,
  printViolations,
} from '../../../runtime/process/shared-cli.mjs';
import { runGit } from '../../../runtime/scope/git-command.helpers.mjs';
import { readAppCoreOwnerPolicy } from '../app-core/app-core-owner-policy.mjs';
import { getRuntimeTopology } from '../runtime-topology/model.mjs';
import {
  classifyAutomaticForwardingKeep,
  classifyCanonicalTopologyOwner,
  collectExactPublicContractFiles,
} from '../topology-fragmentation/evidence.mjs';
import {
  collectTopologyModuleGraph,
  collectTopologySyntaxSignals,
} from '../topology-fragmentation/graph.mjs';
import { FORWARDING_MODULE_DRIFT_POLICY } from './policy.data.mjs';
import {
  FORWARDING_MODULE_DRIFT_POLICY_PATH,
  validateForwardingModuleDriftPolicy,
} from './policy.mjs';

const TOPOLOGY_CODE_PATTERN = /\.[cm]?[jt]sx?$/u;

function createViolation(rule, file, message, details = {}) {
  return { rule, file, message, ...details };
}

export function parseRevisionNameStatus(output) {
  const changedFiles = [];
  const lineage = new Map();
  let recordCount = 0;
  for (const line of output.split(/\r?\n/u).filter(Boolean)) {
    recordCount += 1;
    const parts = line.split('\t');
    const status = parts[0] ?? '';
    if (/^R\d+$/u.test(status) && parts.length === 3 && parts[1] && parts[2]) {
      changedFiles.push(parts[2]);
      lineage.set(parts[2], parts[1]);
      continue;
    }
    if (/^C\d+$/u.test(status) && parts.length === 3 && parts[1] && parts[2]) {
      changedFiles.push(parts[2]);
      continue;
    }
    if (/^[ADMT]$/u.test(status) && parts.length === 2 && parts[1]) {
      changedFiles.push(parts[1]);
      continue;
    }
    throw new Error(`Unsupported or malformed Git name-status record: ${line}`);
  }
  return { changedFiles: [...new Set(changedFiles)].sort(), lineage, recordCount };
}

function resolveCommittedRange({ env, gitRunner }) {
  const candidate = env.SNIPTALE_CANDIDATE_SHA || 'HEAD';
  const configuredBase = env.SNIPTALE_BASE_SHA || null;
  const base = !configuredBase || configuredBase === candidate ? `${candidate}^` : configuredBase;
  const output = gitRunner(['diff', '--name-status', '--find-renames', base, candidate]).stdout;
  const parsed = parseRevisionNameStatus(output);
  if (parsed.recordCount === 0) {
    throw new Error(`Candidate baseline range ${base}..${candidate} is empty.`);
  }
  return { ...parsed, baselineRevision: base, candidateRevision: candidate, mode: 'committed' };
}

function resolveWorkspaceLineage(gitRunner) {
  const unstaged = parseRevisionNameStatus(
    gitRunner(['diff', '--name-status', '--find-renames']).stdout
  );
  const staged = parseRevisionNameStatus(
    gitRunner(['diff', '--cached', '--name-status', '--find-renames']).stdout
  );
  return new Map([...unstaged.lineage, ...staged.lineage]);
}

export function resolveForwardingDriftScope({
  env = process.env,
  files = [],
  gitRunner = runGit,
  resolveWorkspaceFiles = resolveFocusedFiles,
  scope = 'workspace',
} = {}) {
  const explicitFiles = files.map(toRelativePath);
  if (explicitFiles.length > 0) {
    return {
      changedFiles: explicitFiles,
      baselineRevision: 'HEAD',
      lineage: resolveWorkspaceLineage(gitRunner),
      mode: 'workspace',
    };
  }
  const workspaceFiles = resolveWorkspaceFiles();
  if (workspaceFiles.length > 0 || scope !== 'repo-wide') {
    return {
      changedFiles: workspaceFiles,
      baselineRevision: 'HEAD',
      lineage: resolveWorkspaceLineage(gitRunner),
      mode: 'workspace',
    };
  }
  return resolveCommittedRange({ env, gitRunner });
}

export function createForwardingBaselineSource(
  resolvedScope,
  { headSourceResolver, revisionSourceResolver }
) {
  return (file) => {
    const sourcePath = resolvedScope.lineage.get(file) ?? file;
    if (resolvedScope.mode === 'workspace' && sourcePath === file) {
      return headSourceResolver(file);
    }
    return revisionSourceResolver(sourcePath, resolvedScope.baselineRevision);
  };
}

function collectLivePolicyViolations(entries, candidatesByForwarder) {
  return entries.flatMap((entry) => {
    const candidate = candidatesByForwarder.get(entry.forwarder);
    if (!candidate) {
      return [
        createViolation(
          'stale-forwarding-exemption',
          FORWARDING_MODULE_DRIFT_POLICY_PATH,
          `Exemption forwarder ${entry.forwarder} is not a live single-consumer forwarding module.`
        ),
      ];
    }
    if (candidate.consumerFile !== entry.consumer) {
      return [
        createViolation(
          'stale-forwarding-exemption',
          FORWARDING_MODULE_DRIFT_POLICY_PATH,
          `Exemption consumer ${entry.consumer} does not match ${candidate.consumerFile}.`
        ),
      ];
    }
    if (entry.reason === 'unresolved-topology' && candidate.forwarderUnresolvedEdges === 0) {
      return [
        createViolation(
          'stale-forwarding-exemption',
          FORWARDING_MODULE_DRIFT_POLICY_PATH,
          `Exemption ${entry.forwarder} has no live unresolved forwarding edge.`
        ),
      ];
    }
    return [];
  });
}

function manualExemptionFor(entries, candidate) {
  return entries.find(
    (entry) =>
      entry.forwarder === candidate.forwardingFiles[0] && entry.consumer === candidate.consumerFile
  );
}

function collectProductionIncoming(graph) {
  const incoming = new Map(graph.files.map((file) => [file, new Set()]));
  for (const edge of graph.codeEdges) {
    if (!isBuildTestFile(edge.importer)) incoming.get(edge.target)?.add(edge.importer);
  }
  return incoming;
}

function resolveStableMergeTarget(consumer, context) {
  const visited = new Set();
  let current = consumer;
  while (context.moduleByFile.get(current)?.forwardingOnly) {
    if (visited.has(current)) return null;
    visited.add(current);
    const consumers = [...(context.incoming.get(current) ?? [])];
    if (consumers.length !== 1) return null;
    const currentOwner = context.ownerFor(current);
    const nextOwner = context.ownerFor(consumers[0]);
    if (!currentOwner || !nextOwner || currentOwner.id !== nextOwner.id) return null;
    current = consumers[0];
  }
  return current;
}

function collectForwardingCandidates({ graph, readFile, root }) {
  const runtimes = [...getRuntimeTopology(root)].sort(
    (left, right) => right.root.length - left.root.length
  );
  const appCorePolicy = readAppCoreOwnerPolicy();
  const publicFiles = collectExactPublicContractFiles(graph, runtimes, readFile);
  const incoming = collectProductionIncoming(graph);
  const moduleByFile = new Map(graph.modules.map((module) => [module.file, module]));
  const ownerFor = (file) => classifyCanonicalTopologyOwner(file, { appCorePolicy, runtimes });
  const context = { incoming, moduleByFile, ownerFor };
  return graph.modules.flatMap((module) => {
    if (!module.forwardingOnly || isBuildTestFile(module.file)) return [];
    const consumers = [...(incoming.get(module.file) ?? [])];
    if (consumers.length !== 1) return [];
    const consumerFile = consumers[0];
    const targetFiles = graph.codeEdges
      .filter((edge) => edge.importer === module.file && edge.edgeKind === 're-export')
      .map((edge) => edge.target)
      .filter((file, index, values) => values.indexOf(file) === index)
      .sort();
    return [
      {
        automaticKeep: classifyAutomaticForwardingKeep({
          appCorePolicy,
          consumer: consumerFile,
          forwarder: module.file,
          publicFiles,
          runtimes,
        }),
        consumerFile,
        forwarderUnresolvedEdges: graph.unresolvedEdges.filter(
          (edge) => edge.importer === module.file
        ).length,
        forwardingFiles: [module.file],
        mergeTarget: resolveStableMergeTarget(consumerFile, context),
        targetFiles,
      },
    ];
  });
}

export function collectForwardingModuleDriftReport({
  allFiles,
  baselineSource,
  changedFiles,
  policy = FORWARDING_MODULE_DRIFT_POLICY,
  readFile,
  root = repoRoot,
  today,
}) {
  const topologyFiles = allFiles.filter((file) => TOPOLOGY_CODE_PATTERN.test(file));
  const topologyFileSet = new Set(topologyFiles);
  const productionChanges = changedFiles.filter(
    (file) => topologyFileSet.has(file) && !isBuildTestFile(file)
  );
  const newForwarders = productionChanges.filter((file) => {
    if (!collectTopologySyntaxSignals(file, readFile(file)).forwardingOnly) return false;
    const previousSource = baselineSource(file);
    return (
      previousSource == null || !collectTopologySyntaxSignals(file, previousSource).forwardingOnly
    );
  });
  const policyResult = validateForwardingModuleDriftPolicy(policy, { today });
  if (newForwarders.length === 0 && policyResult.entries.length === 0) {
    return {
      skipped: changedFiles.length === 0,
      files: productionChanges,
      violations: policyResult.violations,
      advisories: [],
    };
  }
  const sources = new Map(topologyFiles.map((file) => [file, readFile(file)]));
  const graph = collectTopologyModuleGraph({
    files: topologyFiles,
    root,
    readFile: (file) => sources.get(file) ?? readFile(file),
  });
  const forwardingCandidates = collectForwardingCandidates({
    graph,
    readFile: (file) => sources.get(file) ?? readFile(file),
    root,
  });
  const candidatesByForwarder = new Map(
    forwardingCandidates.map((candidate) => [candidate.forwardingFiles[0], candidate])
  );
  const violations = [
    ...policyResult.violations,
    ...collectLivePolicyViolations(policyResult.entries, candidatesByForwarder),
  ];
  const advisories = [];
  for (const file of newForwarders) {
    const candidate = candidatesByForwarder.get(file);
    if (!candidate) continue;
    const manualExemption = manualExemptionFor(policyResult.entries, candidate);
    const keep =
      candidate.automaticKeep ??
      (manualExemption
        ? { reason: manualExemption.reason, evidence: manualExemption.evidence }
        : null);
    if (keep) {
      advisories.push({
        rule: 'new-forwarding-module-kept',
        file,
        consumer: candidate.consumerFile,
        navigationTransitions: 1,
        targetFiles: candidate.targetFiles,
        message: `Kept ${file} -> ${candidate.consumerFile}: ${keep.reason} (${keep.evidence}).`,
      });
      continue;
    }
    violations.push(
      createViolation(
        'new-single-consumer-forwarding-module',
        file,
        `Consolidate ${file} into its direct consumer ${candidate.consumerFile}, or record an exact admitted Keep reason.`,
        {
          consumer: candidate.consumerFile,
          mergeTarget: candidate.mergeTarget,
          navigationTransitions: 1,
          targetFiles: candidate.targetFiles,
        }
      )
    );
  }
  return {
    skipped: changedFiles.length === 0,
    files: productionChanges,
    violations,
    advisories,
  };
}

export function runForwardingModuleDriftCheck({
  allFiles = collectCodeFiles(),
  env = process.env,
  files = [],
  gitRunner = runGit,
  policy = FORWARDING_MODULE_DRIFT_POLICY,
  readFile = readText,
  root = repoRoot,
  scope = 'workspace',
  today,
} = {}) {
  let resolvedScope;
  try {
    resolvedScope = resolveForwardingDriftScope({ env, files, gitRunner, scope });
  } catch (error) {
    return {
      skipped: false,
      files: [],
      advisories: [],
      violations: [
        createViolation(
          'forwarding-drift-baseline-unavailable',
          FORWARDING_MODULE_DRIFT_POLICY_PATH,
          error instanceof Error ? error.message : 'Candidate baseline is unavailable.'
        ),
      ],
    };
  }
  const baselineSource = createForwardingBaselineSource(resolvedScope, {
    headSourceResolver: createHeadFileTextResolver(resolvedScope.changedFiles, { root }),
    revisionSourceResolver: (file, revision) => readRevisionFileText(file, { revision, root }),
  });
  const result = collectForwardingModuleDriftReport({
    allFiles,
    baselineSource,
    changedFiles: resolvedScope.changedFiles,
    policy,
    readFile,
    root,
    today,
  });
  return scope === 'repo-wide' ? { ...result, populationKind: 'repository-state' } : result;
}

if (isExecutedAsScript(import.meta.url)) {
  const files = parseFilesArgument(process.argv.slice(2));
  const scope = process.argv.includes('--repo-wide') ? 'repo-wide' : 'workspace';
  const result = runForwardingModuleDriftCheck({ files, scope });
  if (result.violations.length > 0) {
    printViolations('Forwarding module drift violations found:', result.violations);
    process.exit(1);
  }
  process.stdout.write('Forwarding module drift check passed\n');
}

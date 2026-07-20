import { REPO_AUDIT_REPORT_DEFINITIONS, collectWrapperStepDefinitions } from './registry.mjs';
import { collectToolCoverage } from './verification-profile-coverage.mjs';
import {
  OWNER_SCOPED_LIFECYCLE_PROOF,
  OWNER_SCOPED_LIFECYCLE_TOOLS,
} from './verification-profile.owner-proof.data.mjs';

function collectWrapperTools(stepDefinitions) {
  const seen = new Set();
  const tools = [];
  for (const step of stepDefinitions) {
    if (!step.tool || seen.has(step.tool)) {
      continue;
    }
    seen.add(step.tool);
    tools.push(step.tool);
  }
  return tools;
}

function getQualityScriptEntries(packageJson) {
  return Object.entries(packageJson.scripts)
    .map(([script, command]) => {
      if (script === 'qa:advisory') {
        return {
          script,
          tool: 'verify-advisory.mjs',
          entryKind: 'advisory',
        };
      }

      void command;
      return null;
    })
    .filter(Boolean)
    .sort((left, right) => left.script.localeCompare(right.script));
}

function collectVerificationArrays(packageJson, validationManifest, wrappers) {
  const fullWrapperTools = collectWrapperTools(wrappers.full);
  const focusedWrapperTools = collectWrapperTools(wrappers.focused);
  const focusedTriggerCoveredTools = collectWrapperTools(wrappers.focusedTriggered);
  const harnessWrapperTools = collectWrapperTools(wrappers.harness);
  const buildWrapperTools = collectWrapperTools(wrappers.build);
  const auditWrapperTools = collectWrapperTools(wrappers.audit);
  const advisoryWrapperTools = collectWrapperTools(wrappers.advisory);
  const manualAuditTools = collectWrapperTools(wrappers.manual);
  const closeoutWrapperTools = collectWrapperTools(wrappers.closeout);
  const lifecycleTools = collectWrapperTools(wrappers.lifecycle);
  const e2eTools = collectWrapperTools(wrappers.e2e);
  const focusedCoverageTools = [
    ...new Set([...focusedWrapperTools, ...focusedTriggerCoveredTools]),
  ].sort();
  const validationEntries = validationManifest.tools ?? [];
  const validatedTools = new Map(validationEntries.map((entry) => [entry.tool, entry]));
  const qualityScripts = getQualityScriptEntries(packageJson);
  const advisoryScripts = qualityScripts.filter((entry) => entry.entryKind === 'advisory');
  const repoAuditReportTools = REPO_AUDIT_REPORT_DEFINITIONS.map(({ tool }) => tool).sort();
  const toolCoverage = collectToolCoverage({
    qualityScripts,
    fullWrapperTools,
    focusedWrapperTools,
    focusedTriggerCoveredTools,
  });
  return {
    advisoryWrapperTools,
    auditWrapperTools,
    buildWrapperTools,
    closeoutWrapperTools,
    e2eTools,
    focusedCoverageTools,
    focusedTriggerCoveredTools,
    focusedWrapperTools,
    fullWrapperTools,
    harnessWrapperTools,
    lifecycleTools,
    manualAuditTools,
    advisoryScripts,
    qualityScripts,
    repoAuditReportTools,
    toolCoverage,
    ownerScopedToolProof: OWNER_SCOPED_LIFECYCLE_PROOF,
    ownerScopedTools: OWNER_SCOPED_LIFECYCLE_TOOLS,
    unvalidatedQualityScripts: qualityScripts.filter(({ tool }) => !validatedTools.has(tool)),
    validationEntries,
  };
}

function collectLoopholes({
  fullOnlyTools,
  manualOnlyCheckScripts,
  advisoryScripts,
  qualityScripts,
  repoAuditReportTools,
  skipCapableTools,
  unvalidatedQualityScripts,
}) {
  const checkScriptForTool = (tool) =>
    qualityScripts.find((entry) => entry.tool === tool && entry.entryKind === 'check')?.script ??
    null;

  return [
    ...fullOnlyTools.map((tool) => ({
      kind: 'focused-blind-spot',
      tool,
      summary: 'Focused QA misses it.',
      script: checkScriptForTool(tool),
    })),
    ...manualOnlyCheckScripts.map(({ script, tool }) => ({
      kind: 'manual-only-check',
      tool,
      script,
      summary: 'Full verify skips this script.',
    })),
    ...skipCapableTools.map(({ tool, validationMode, states }) => ({
      kind: 'skip-capable-tool',
      tool,
      script: checkScriptForTool(tool),
      summary: `Validation allows skip (${states.join(', ')}) via ${validationMode}.`,
    })),
    ...advisoryScripts
      .filter(({ tool }) => !repoAuditReportTools.includes(tool))
      .map(({ script, tool }) => ({
        kind: 'advisory-script',
        tool,
        script,
        summary: 'Advisory-only in full verify.',
      })),
    ...unvalidatedQualityScripts.map(({ script, tool }) => ({
      kind: 'unvalidated-script',
      tool,
      script,
      summary: 'No manifest validation coverage.',
    })),
  ];
}

function collectSkipCapableTools(validationEntries) {
  return validationEntries
    .filter((entry) => entry.states.includes('skip'))
    .map((entry) => ({
      tool: entry.tool,
      validationMode: entry.validationMode,
      states: entry.states,
    }))
    .sort((left, right) => left.tool.localeCompare(right.tool));
}

function createLaneEvidence(input) {
  const { wrappers } = input;
  return {
    fullWrapperSteps: wrappers.full,
    focusedWrapperSteps: wrappers.focused,
    focusedTriggeredSteps: wrappers.focusedTriggered,
    harnessWrapperSteps: wrappers.harness,
    buildWrapperSteps: wrappers.build,
    auditWrapperSteps: wrappers.audit,
    advisoryWrapperSteps: wrappers.advisory,
    manualAuditSteps: wrappers.manual,
    closeoutWrapperSteps: wrappers.closeout,
    lifecycleSteps: wrappers.lifecycle,
    e2eSteps: wrappers.e2e,
    fullWrapperTools: input.fullWrapperTools,
    harnessWrapperTools: input.harnessWrapperTools,
    buildWrapperTools: input.buildWrapperTools,
    auditWrapperTools: input.auditWrapperTools,
    advisoryWrapperTools: input.advisoryWrapperTools,
    manualAuditTools: input.manualAuditTools,
    closeoutWrapperTools: input.closeoutWrapperTools,
    lifecycleTools: input.lifecycleTools,
    e2eTools: input.e2eTools,
  };
}

function createVerificationPayload(input) {
  return {
    ...createLaneEvidence(input),
    focusedWrapperTools: input.focusedWrapperTools,
    focusedTriggerCoveredTools: input.focusedTriggerCoveredTools,
    focusedCoverageTools: input.focusedCoverageTools,
    fullOnlyTools: input.fullOnlyTools,
    manualOnlyCheckScripts: input.manualOnlyCheckScripts,
    skipCapableTools: input.skipCapableTools,
    advisoryTools: [...new Set(input.advisoryScripts.map((entry) => entry.tool))].sort(),
    advisoryScripts: input.advisoryScripts,
    repoAuditReportDefinitions: REPO_AUDIT_REPORT_DEFINITIONS,
    repoAuditReportTools: input.repoAuditReportTools,
    qualityScripts: input.qualityScripts,
    toolCoverage: input.toolCoverage,
    ownerScopedToolProof: input.ownerScopedToolProof,
    ownerScopedTools: input.ownerScopedTools,
    unvalidatedQualityScripts: input.unvalidatedQualityScripts,
    validationManifestEntries: input.validationEntries.length,
  };
}

export function collectVerificationProfile(packageJson, validationManifest) {
  const wrappers = collectWrapperStepDefinitions();
  const arrays = collectVerificationArrays(packageJson, validationManifest, wrappers);
  const fullOnlyTools = arrays.fullWrapperTools.filter(
    (tool) => !arrays.focusedCoverageTools.includes(tool) && !arrays.ownerScopedTools.includes(tool)
  );
  const manualOnlyCheckScripts = arrays.qualityScripts.filter(
    ({ entryKind, tool, script }) =>
      entryKind === 'check' &&
      script.startsWith('check:') &&
      !arrays.fullWrapperTools.includes(tool)
  );
  const skipCapableTools = collectSkipCapableTools(arrays.validationEntries);

  return {
    verification: createVerificationPayload({
      wrappers,
      ...arrays,
      fullOnlyTools,
      manualOnlyCheckScripts,
      skipCapableTools,
    }),
    loopholes: collectLoopholes({
      fullOnlyTools,
      manualOnlyCheckScripts,
      advisoryScripts: arrays.advisoryScripts,
      qualityScripts: arrays.qualityScripts,
      repoAuditReportTools: arrays.repoAuditReportTools,
      skipCapableTools,
      unvalidatedQualityScripts: arrays.unvalidatedQualityScripts,
    }),
  };
}

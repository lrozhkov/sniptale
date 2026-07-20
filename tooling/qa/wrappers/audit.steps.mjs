import { createFailureStep, createOkStep } from '../core/focused-qa-results.mjs';
import { collectFullCoverageAuditStep } from '../core/audit-coverage-step.mjs';
import { filterAstGrepAuditFiles, runAstGrepCheck } from '../audits/ast-grep.mjs';
import { runCodeqlCheck } from '../audits/codeql.mjs';
import { runGitleaksCheck } from '../audits/gitleaks.mjs';
import { runJscpdCheck } from '../audits/jscpd.mjs';
import { runKnipCheck } from '../audits/knip.mjs';
import { runLicenseCheck } from '../audits/licenses.mjs';
import { runAudit as runNpmAudit } from '../audits/npm-audit.mjs';
import { runAuditSignatures } from '../audits/npm-audit-signatures.mjs';
import { runOsvCheck } from '../audits/osv.mjs';
import { runSemgrepCheck } from '../audits/semgrep.mjs';
import { collectEvidenceStep, collectTopologyStep } from './audit-inventory-steps.mjs';
import {
  collectProfiledAsyncStep,
  collectProfiledSyncStep,
  toTimedStep,
} from './audit-step-collection.mjs';
import { createAuditToolStep, MAX_AUDIT_FAILURE_PREVIEW } from './audit-tool-step.mjs';

export { createAuditToolStep, MAX_AUDIT_FAILURE_PREVIEW };

function createToolCollector(profile, controlId, label, collector, onProgress) {
  return collectProfiledSyncStep(
    profile,
    controlId,
    label,
    collector,
    (result, durationMs, policy) =>
      createAuditToolStep(label, result, durationMs, {
        profileId: profile.id,
        requirement: policy.requirement,
      }),
    onProgress
  );
}

function collectNpmGateStep(profile, controlId, label, collector, onProgress) {
  return collectProfiledSyncStep(
    profile,
    controlId,
    label,
    collector,
    (result, durationMs) =>
      result.status === 'passed'
        ? toTimedStep(
            createOkStep(
              label,
              [result.detail, result.reportPath ? `report=${result.reportPath}` : '']
                .filter(Boolean)
                .join('; ')
            ),
            durationMs
          )
        : toTimedStep(
            createFailureStep(label, 'failed', {
              stderr: [result.reportPath ? `Report: ${result.reportPath}` : '', result.output ?? '']
                .filter(Boolean)
                .join('\n'),
            }),
            durationMs
          ),
    onProgress
  );
}

function collectSyncAuditToolSteps(profile, onProgress) {
  return {
    astStep: createToolCollector(
      profile,
      'ast-grep',
      'ast-grep',
      () => runAstGrepCheck({ fileFilter: filterAstGrepAuditFiles }),
      onProgress
    ),
    gitleaksStep: createToolCollector(
      profile,
      'gitleaks',
      'Gitleaks',
      () => runGitleaksCheck({ scopes: profile.gitleaksScopes }),
      onProgress
    ),
    jscpdStep: createToolCollector(profile, 'jscpd', 'jscpd', runJscpdCheck, onProgress),
    knipStep: createToolCollector(profile, 'knip', 'Knip', runKnipCheck, onProgress),
    licenseStep: createToolCollector(
      profile,
      'license-inventory',
      'License inventory',
      runLicenseCheck,
      onProgress
    ),
    osvStep: createToolCollector(profile, 'osv-scanner', 'OSV-Scanner', runOsvCheck, onProgress),
    semgrepStep: createToolCollector(profile, 'semgrep', 'Semgrep', runSemgrepCheck, onProgress),
  };
}

async function collectAsyncAuditToolSteps(profile, onProgress) {
  const codeqlStep = await collectProfiledAsyncStep(
    profile,
    'codeql',
    'CodeQL',
    () => Promise.resolve(runCodeqlCheck()),
    (result, durationMs, policy) =>
      createAuditToolStep('CodeQL', result, durationMs, {
        profileId: profile.id,
        requirement: policy.requirement,
      }),
    onProgress
  );
  const coverageStep = await collectProfiledAsyncStep(
    profile,
    'full-product-coverage',
    'Full product coverage',
    collectFullCoverageAuditStep,
    (step) => step,
    onProgress
  );
  return { codeqlStep, coverageStep };
}

export async function collectAuditSteps({ profile, onProgress }) {
  const syncSteps = collectSyncAuditToolSteps(profile, onProgress);
  const asyncSteps = await collectAsyncAuditToolSteps(profile, onProgress);
  return [
    asyncSteps.coverageStep,
    collectEvidenceStep(profile, { onProgress }),
    collectTopologyStep(profile, { onProgress }),
    collectNpmGateStep(profile, 'npm-audit', 'npm audit', runNpmAudit, onProgress),
    collectNpmGateStep(
      profile,
      'npm-audit-signatures',
      'npm audit signatures',
      runAuditSignatures,
      onProgress
    ),
    syncSteps.osvStep,
    syncSteps.gitleaksStep,
    syncSteps.licenseStep,
    syncSteps.astStep,
    syncSteps.knipStep,
    syncSteps.jscpdStep,
    syncSteps.semgrepStep,
    asyncSteps.codeqlStep,
  ];
}

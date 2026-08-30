import {
  createFailureStep,
  createOkStep,
} from '../../../composition/checkpoint/focused-qa-results.mjs';
import { collectFullCoverageAuditStep } from '../../../proof/coverage/audit-coverage-step.mjs';
import { filterAstGrepAuditFiles, runAstGrepCheck } from '../../../audits/ast-grep/ast-grep.mjs';
import { runCodeqlCheck } from '../../../audits/codeql/codeql.mjs';
import { runGitleaksCheck } from '../../../audits/gitleaks/gitleaks.mjs';
import { runJscpdCheck } from '../../../audits/jscpd/check.mjs';
import { runKnipCheck } from '../../../audits/knip/knip.mjs';
import { runLicenseCheck } from '../../../audits/licenses/licenses.mjs';
import { runAudit as runNpmAudit } from '../../../audits/supply-chain/npm-audit.mjs';
import { runAuditSignatures } from '../../../audits/supply-chain/npm-audit-signatures.mjs';
import { runOsvCheck } from '../../../audits/osv/check.mjs';
import { collectEvidenceStep, collectTopologyStep } from '../audit-inventory-steps.mjs';
import {
  collectProfiledAsyncStep,
  collectProfiledSyncStep,
  toTimedStep,
} from '../audit-step-collection.mjs';
import { createAuditToolStep, MAX_AUDIT_FAILURE_PREVIEW } from '../audit-tool-step.mjs';
import { takeUnifiedAstGrepAuditReceipt } from '../../../audits/ast-grep/unified-ast-grep.mjs';

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

export function resolveAstGrepAuditResult({ scanner = runAstGrepCheck } = {}) {
  return takeUnifiedAstGrepAuditReceipt() ?? scanner({ fileFilter: filterAstGrepAuditFiles });
}

function collectSyncAuditToolSteps(profile, onProgress) {
  return {
    astStep: createToolCollector(
      profile,
      'ast-grep',
      'ast-grep',
      resolveAstGrepAuditResult,
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
    asyncSteps.codeqlStep,
  ];
}

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  createJscpdBaselineScope,
  hasExactJscpdBaselineFamilyKeys,
} from './jscpd-baseline-contract.mjs';

function parse(root, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function edgeDigest(edges) {
  const sorted = [...edges].sort(([leftFrom, leftTo], [rightFrom, rightTo]) =>
    `${leftFrom}\0${leftTo}`.localeCompare(`${rightFrom}\0${rightTo}`)
  );
  return crypto.createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}

function validateArchitecture(context) {
  const file = 'tooling/configs/qa/architecture-debt.data.json';
  const baseline = parse(context.root, file);
  for (const entry of baseline.baselines ?? []) {
    context.requireLinkedEntry({
      ...context,
      baselineEntry: entry,
      classification: 'debt',
      sourceKind: 'architecture',
      sourceKey: entry.rule,
      scope: { occurrences: entry.occurrences, rule: entry.rule },
      file,
    });
  }
  return baseline.baselines?.length ?? 0;
}

function validateCodeql(context) {
  const file = 'tooling/configs/qa/codeql-baseline.json';
  const baseline = parse(context.root, file);
  for (const finding of baseline.findings ?? []) {
    const registryClassification = context.byId.get(finding.debtId)?.entry?.classification;
    context.requireLinkedEntry({
      ...context,
      baselineEntry: finding,
      classification: registryClassification,
      sourceKind: 'codeql',
      sourceKey: `${finding.rule}:${finding.file}:${finding.line}:${finding.contentHash}:${finding.messageHash}`,
      scope: {
        contentHash: finding.contentHash,
        file: finding.file,
        line: finding.line,
        messageHash: finding.messageHash,
        rule: finding.rule,
      },
      file,
    });
  }
  return baseline.findings?.length ?? 0;
}

function validateGitleaks(context) {
  const file = 'tooling/configs/qa/gitleaks-baseline.json';
  const baseline = parse(context.root, file);
  for (const finding of baseline) {
    context.requireLinkedEntry({
      ...context,
      baselineEntry: { debtId: finding.SniptaleDebtId },
      classification: 'tool-noise',
      sourceKind: 'gitleaks',
      sourceKey: finding.Fingerprint,
      scope: {
        commit: finding.Commit,
        file: finding.File,
        fingerprint: finding.Fingerprint,
        line: finding.StartLine,
        rule: finding.RuleID,
      },
      file,
    });
  }
  return baseline.length;
}

function validateJscpd(context) {
  const file = 'tooling/configs/qa/jscpd-baseline.json';
  const baseline = parse(context.root, file);
  for (const family of baseline.families ?? []) {
    if (!hasExactJscpdBaselineFamilyKeys(family)) {
      context.violations.push({
        rule: 'technical-debt-source-shape',
        file,
        message: `${family?.family ?? '<unknown>'} must contain only exact jscpd detector scope and debtId.`,
      });
    }
    const registryClassification = context.byId.get(family.debtId)?.entry?.classification;
    context.requireLinkedEntry({
      ...context,
      baselineEntry: family,
      classification: registryClassification,
      sourceKind: 'jscpd',
      sourceKey: family.family,
      scope: createJscpdBaselineScope(family),
      file,
    });
  }
  return baseline.families?.length ?? 0;
}

function validateScc(context) {
  const file = 'tooling/qa/core/architecture-guardrails.scc-registry.data.json';
  const baseline = parse(context.root, file);
  for (const scc of baseline) {
    context.requireLinkedEntry({
      ...context,
      baselineEntry: scc,
      classification: scc.reason.startsWith('Allowed composition:')
        ? 'accepted-architecture'
        : 'debt',
      sourceKind: 'scc',
      sourceKey: scc.id,
      scope: {
        edgeDigest: edgeDigest(scc.edges),
        id: scc.id,
        owners: [...scc.owners].sort(),
      },
      file,
    });
  }
  return baseline.length;
}

function validateLicenses(context) {
  const file = 'tooling/configs/qa/licenses.json';
  const policy = parse(context.root, file);
  for (const exception of policy.reviewedExceptions ?? []) {
    context.requireLinkedEntry({
      ...context,
      baselineEntry: exception,
      classification: 'accepted-architecture',
      sourceKind: 'license',
      sourceKey: [
        `${exception.packageName}@${exception.resolvedVersion}`,
        exception.dependencyScope,
        exception.artifactInclusion,
        exception.licenseExpression,
      ].join(':'),
      scope: {
        approvalOwner: exception.approvalOwner,
        artifactInclusion: exception.artifactInclusion,
        dependencyScope: exception.dependencyScope,
        expiresOn: exception.expiresOn,
        licenseExpression: exception.licenseExpression,
        packageName: exception.packageName,
        reason: exception.reason,
        resolvedVersion: exception.resolvedVersion,
      },
      file,
    });
  }
  return policy.reviewedExceptions?.length ?? 0;
}

export function validateEnforcedDebtSources(context) {
  return (
    validateArchitecture(context) +
    validateCodeql(context) +
    validateGitleaks(context) +
    validateJscpd(context) +
    validateScc(context) +
    validateLicenses(context)
  );
}

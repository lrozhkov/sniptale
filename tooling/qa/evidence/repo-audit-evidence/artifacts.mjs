import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { resolveRepositoryWritePath } from '../../policy/repository-contained-paths.mjs';
import {
  collectSensitiveEnvironmentValues,
  sanitizeLogText,
} from '../../runtime/observability/sanitize.mjs';

export const REPO_AUDIT_EVIDENCE_PATH = '.tmp/repo-audit/evidence.json';
export const REPO_AUDIT_TOPOLOGY_PATH = '.tmp/repo-audit/topology.json';

function sanitizeArtifactValue(value, options) {
  if (typeof value === 'string') return sanitizeLogText(value, options);
  if (Array.isArray(value)) return value.map((entry) => sanitizeArtifactValue(entry, options));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, sanitizeArtifactValue(entry, options)])
    );
  }
  return value;
}

function writeArtifact(
  relativePath,
  value,
  { rootDir = process.cwd(), sensitiveValues = collectSensitiveEnvironmentValues() } = {}
) {
  const finalPath = resolveRepositoryWritePath(rootDir, relativePath);
  fs.mkdirSync(path.dirname(finalPath), { recursive: true });
  const verifiedFinalPath = resolveRepositoryWritePath(rootDir, relativePath);
  const temporaryRelativePath = `${relativePath}.${process.pid}.${randomUUID()}.tmp`;
  const temporaryPath = resolveRepositoryWritePath(rootDir, temporaryRelativePath);
  const sanitized = sanitizeArtifactValue(value, {
    repositoryRoot: rootDir,
    sensitiveValues,
  });

  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(sanitized, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    fs.renameSync(temporaryPath, verifiedFinalPath);
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }

  return relativePath;
}

function summarizeTopologyFindings(findings, exampleLimit = 3) {
  const findingsByRule = new Map();
  for (const finding of findings) {
    const rule = finding.rule ?? 'unclassified';
    const ruleFindings = findingsByRule.get(rule) ?? [];
    ruleFindings.push(finding);
    findingsByRule.set(rule, ruleFindings);
  }

  return [...findingsByRule.entries()]
    .map(([rule, ruleFindings]) => ({
      rule,
      count: ruleFindings.length,
      examples: ruleFindings.slice(0, exampleLimit).map(({ file, line = null, message }) => ({
        file,
        line,
        message,
      })),
    }))
    .sort((left, right) => right.count - left.count || left.rule.localeCompare(right.rule));
}

export function countRepoAuditEvidenceFindings(evidence) {
  return evidence.smellFindings.length + evidence.loopholes.length;
}

function assertEvidenceIntegrity(evidence) {
  const concreteCounts = new Map();
  for (const finding of evidence.smellFindings) {
    concreteCounts.set(finding.family, (concreteCounts.get(finding.family) ?? 0) + 1);
  }
  const summaryCounts = new Map();
  for (const summary of evidence.smellFamilies) {
    if (summaryCounts.has(summary.family)) {
      throw new Error(`Repo audit evidence has duplicate summary family: ${summary.family}`);
    }
    summaryCounts.set(summary.family, summary.count);
  }
  const hasFamilyDrift =
    concreteCounts.size !== summaryCounts.size ||
    [...concreteCounts].some(([family, count]) => summaryCounts.get(family) !== count);
  if (hasFamilyDrift) {
    throw new Error(
      [
        'Repo audit evidence family summary mismatch:',
        `concrete=${JSON.stringify(Object.fromEntries(concreteCounts))}`,
        `summarized=${JSON.stringify(Object.fromEntries(summaryCounts))}`,
      ].join(' ')
    );
  }
}

export function persistRepoAuditEvidence(evidence, options = {}) {
  assertEvidenceIntegrity(evidence);
  const artifact = {
    ...evidence,
    findingCount: countRepoAuditEvidenceFindings(evidence),
    schemaVersion: 1,
    artifactKind: 'repo-audit-evidence',
  };
  return {
    artifact,
    artifactPath: writeArtifact(REPO_AUDIT_EVIDENCE_PATH, artifact, options),
  };
}

export function createTopologyInventory(result, { generatedAt = new Date().toISOString() } = {}) {
  return {
    schemaVersion: 1,
    artifactKind: 'repo-audit-topology',
    generatedAt,
    scope: 'repository',
    findingCount: result.violations.length,
    summaries: summarizeTopologyFindings(result.violations),
    findings: result.violations,
  };
}

export function persistRepoAuditTopology(result, options = {}) {
  const artifact = createTopologyInventory(result);
  return {
    artifact,
    artifactPath: writeArtifact(REPO_AUDIT_TOPOLOGY_PATH, artifact, options),
  };
}

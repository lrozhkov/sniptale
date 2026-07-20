import fs from 'node:fs';
import path from 'node:path';

function parse(root, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function validateQuality({ byId, requireLinkedEntry, root, violations }) {
  const relativePath = 'tooling/configs/qa/quality-baseline.json';
  const baseline = parse(root, relativePath);
  for (const allowance of baseline.allowances ?? []) {
    const scope = { file: allowance.file, rule: allowance.rule };
    if (allowance.line != null) scope.line = allowance.line;
    if (allowance.contentHash != null) scope.contentHash = allowance.contentHash;
    requireLinkedEntry({
      baselineEntry: allowance,
      byId,
      classification: allowance.classification,
      sourceKind: 'quality',
      sourceKey: `${allowance.rule}:${allowance.file}:${allowance.line ?? allowance.contentHash}`,
      scope,
      file: relativePath,
      violations,
    });
  }
  return baseline.allowances?.length ?? 0;
}

function validateSonarjs({ byId, requireLinkedEntry, root, violations }) {
  const relativePath = 'tooling/configs/qa/sonarjs-baseline.json';
  const baseline = parse(root, relativePath);
  for (const entry of baseline.entries ?? []) {
    const scope = { file: entry.file, rule: entry.rule };
    if (entry.line != null) scope.line = entry.line;
    if (entry.messagePattern != null) scope.messagePattern = entry.messagePattern;
    requireLinkedEntry({
      baselineEntry: entry,
      byId,
      classification: 'tool-noise',
      sourceKind: 'sonarjs',
      sourceKey: `${entry.rule}:${entry.file}:${entry.line ?? ''}:${entry.messagePattern ?? ''}`,
      scope,
      file: relativePath,
      violations,
    });
  }
  return baseline.entries?.length ?? 0;
}

export function validateStaticBaselines(context) {
  return validateQuality(context) + validateSonarjs(context);
}

import fs from 'node:fs';
import path from 'node:path';

import {
  createJscpdBaselineScope,
  hasExactJscpdBaselineFamilyKeys,
} from '../core/jscpd-baseline-contract.mjs';
import { repoRoot } from '../core/shared.mjs';
import { parseToolJson } from '../tools/tool-cli.mjs';

export const JSCPD_DEBT_REGISTRY_PATH = 'tooling/configs/qa/technical-debt.data.json';
const REGISTRY_CLASSIFICATIONS = new Set(['accepted-architecture', 'debt', 'tool-noise']);

function resolvePolicyPath(policyPath) {
  return path.isAbsolute(policyPath) ? policyPath : path.join(repoRoot, policyPath);
}

export function readJscpdDebtRegistry(registryPath = JSCPD_DEBT_REGISTRY_PATH) {
  const absolutePath = resolvePolicyPath(registryPath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Required technical-debt registry is missing: ${absolutePath}`);
  }
  return parseToolJson(fs.readFileSync(absolutePath, 'utf8'), { entries: [] });
}

function registryEntries(registry) {
  return new Map(
    (registry.entries ?? [])
      .filter((entry) => entry?.source?.kind === 'jscpd')
      .map((entry) => [entry.id, entry])
  );
}

function hasExactScope(entry, registryEntry) {
  const expected = createJscpdBaselineScope(entry);
  const actual = registryEntry?.scope;
  return (
    registryEntry?.source?.key === entry.family &&
    Object.keys(expected).every((key) => actual?.[key] === expected[key]) &&
    Object.keys(actual ?? {}).length === Object.keys(expected).length
  );
}

function isDispositionComplete(entry) {
  return (
    REGISTRY_CLASSIFICATIONS.has(entry?.classification) &&
    ['owner', 'reason', 'targetAction'].every(
      (field) => typeof entry?.[field] === 'string' && entry[field].trim().length > 0
    ) &&
    (entry?.classification !== 'debt' || hasFrozenAcceptance(entry?.acceptance))
  );
}

function hasFrozenAcceptance(acceptance) {
  return ['criteria', 'negativeCases', 'nonGoals'].every(
    (field) =>
      Array.isArray(acceptance?.[field]) &&
      acceptance[field].length > 0 &&
      acceptance[field].every((value) => typeof value === 'string' && value.trim().length > 0)
  );
}

export function collectJscpdContractViolations(baseline, registry) {
  const byId = registryEntries(registry ?? { entries: [] });
  return (baseline.families ?? []).flatMap((entry) => {
    if (!hasExactJscpdBaselineFamilyKeys(entry)) {
      return [
        {
          rule: 'jscpd-baseline-metadata',
          file: entry?.family ?? '<unknown>',
          message: [
            `${entry?.family ?? '<unknown>'} must contain only`,
            'family, count, lines, sampleFingerprint, and debtId',
          ].join(' '),
        },
      ];
    }
    const disposition = byId.get(entry.debtId);
    const validScope =
      typeof entry.family === 'string' &&
      Number.isInteger(entry.count) &&
      entry.count >= 0 &&
      Number.isInteger(entry.lines) &&
      entry.lines >= 0 &&
      /^[a-f0-9]{64}$/u.test(entry.sampleFingerprint) &&
      isDispositionComplete(disposition) &&
      hasExactScope(entry, disposition);
    return validScope
      ? []
      : [
          {
            rule: 'jscpd-baseline-untriaged',
            file: entry.family,
            message: [
              `${entry.family} must link exact detector scope to registry-owned`,
              'classification, owner, reason, action, and debt acceptance checklist',
            ].join(' '),
          },
        ];
  });
}

export function summarizeJscpdClassifications(baseline, familySummary, registry) {
  const familyNames = new Set(familySummary.map((entry) => entry.family));
  const byId = registryEntries(registry ?? { entries: [] });
  const counts = new Map();
  for (const entry of baseline.families ?? []) {
    if (!familyNames.has(entry.family)) continue;
    const classification = String(byId.get(entry.debtId)?.classification ?? 'untriaged');
    counts.set(classification, (counts.get(classification) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([value, count]) => `${value}=${count}`)
    .join(', ');
}

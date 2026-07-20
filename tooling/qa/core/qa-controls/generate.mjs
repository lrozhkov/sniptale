import fs from 'node:fs';
import path from 'node:path';

import {
  collectControlDiscovery,
  CONTROL_INVENTORY_PATH,
  CONTROL_POLICY_PATH,
  readControlPolicy,
  VALIDATION_MANIFEST_PATH,
} from './discovery.mjs';
import { collectControlPolicyViolations, createInitialControlPolicy } from './policy.mjs';
import { fromRelativePath, isExecutedAsScript } from '../shared.mjs';

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function writeJson(relativePath, value) {
  const target = fromRelativePath(relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, stableJson(value));
}

const PROOF_OVERRIDES = new Map([
  ['npm-audit.mjs', ['tooling/qa/core/verify-runners.test.ts']],
  ['run-controller.mjs', ['tooling/qa/runtime/observability/lifecycle.test.ts']],
  ['verify-technical-debt.mjs', ['tooling/qa/core/technical-debt-registry.test.ts']],
]);

function synchronizeValidationManifest(discovery) {
  const manifest = JSON.parse(fs.readFileSync(fromRelativePath(VALIDATION_MANIFEST_PATH), 'utf8'));
  const uniqueExisting = new Map();
  for (const entry of manifest.tools ?? []) {
    const current = uniqueExisting.get(entry.tool);
    uniqueExisting.set(
      entry.tool,
      current
        ? {
            ...current,
            testFiles: [...new Set([...current.testFiles, ...entry.testFiles])].sort(),
            states: [...new Set([...current.states, ...entry.states])].sort(),
          }
        : entry
    );
  }
  const candidates = new Map();
  for (const control of discovery.controls.filter(({ sourceExists }) => sourceExists === true)) {
    const current = candidates.get(control.tool) ?? [];
    candidates.set(control.tool, [...new Set([...current, ...control.proofFiles])].sort());
  }
  const missing = [...candidates]
    .filter(([tool]) => !uniqueExisting.has(tool))
    .map(([tool, proofFiles]) => ({
      tool,
      validationMode: 'canonical-control-fixture',
      testFiles: proofFiles.length > 0 ? proofFiles : (PROOF_OVERRIDES.get(tool) ?? []),
      states: ['pass', 'fail'],
    }))
    .sort((left, right) => left.tool.localeCompare(right.tool));
  const withoutProof = missing.filter(({ testFiles }) => testFiles.length === 0);
  if (withoutProof.length > 0) {
    throw new Error(
      `Cannot add validation rows without proof: ${withoutProof.map(({ tool }) => tool).join(', ')}`
    );
  }
  manifest.tools = [...uniqueExisting.values(), ...missing];
  writeJson(VALIDATION_MANIFEST_PATH, manifest);
  return missing.length;
}

export function buildControlInventory(discovery, policy) {
  const byId = new Map(policy.controls.map((row) => [row.id, row]));
  const policyByPath = new Map(policy.policyFiles.map((row) => [row.path, row]));
  const executableByPath = new Map(policy.executables.map((row) => [row.path, row]));
  const scriptById = new Map(policy.scripts.map((row) => [row.id, row]));
  const validationByTool = new Map(policy.validationTools.map((row) => [row.tool, row]));
  return {
    schemaVersion: 1,
    controls: discovery.controls.map((control) => ({
      id: control.id,
      toolId: control.toolId,
      label: control.label,
      tool: control.tool,
      source: control.source,
      kind: control.kind,
      status: control.status,
      owner: control.owner,
      lanes: control.lanes,
      requiredBy: control.requiredBy,
      ruleDoc: control.ruleDoc,
      remediation: control.remediation,
      proofFiles: control.proofFiles,
      ...byId.get(control.id),
    })),
    executables: discovery.executables.map((entry) => ({
      ...entry,
      ...executableByPath.get(entry.path),
    })),
    packageQaScripts: discovery.packageQaScripts.map((entry) => ({
      ...entry,
      ...scriptById.get(entry.id),
    })),
    policyFiles: discovery.policyFiles.map((entry) => ({
      ...entry,
      ...policyByPath.get(entry.path),
    })),
    validationTools: discovery.validationTools.map((tool) => ({
      tool,
      ...validationByTool.get(tool),
    })),
  };
}

export function generateControlInventory({ writePolicy = false } = {}) {
  const discovery = collectControlDiscovery();
  const policy = writePolicy ? createInitialControlPolicy(discovery) : readControlPolicy();
  const violations = collectControlPolicyViolations(discovery, policy);
  if (writePolicy) writeJson(CONTROL_POLICY_PATH, policy);
  if (violations.length === 0)
    writeJson(CONTROL_INVENTORY_PATH, buildControlInventory(discovery, policy));
  return { discovery, policy, violations };
}

if (isExecutedAsScript(import.meta.url)) {
  const writePolicy = process.argv.includes('--write-policy');
  const writeValidation = process.argv.includes('--write-validation');
  if (writeValidation) {
    const added = synchronizeValidationManifest(collectControlDiscovery());
    process.stdout.write(`Validation manifest added ${added} canonical control rows\n`);
  }
  const result = generateControlInventory({ writePolicy });
  if (result.violations.length > 0) {
    for (const violation of result.violations) {
      process.stderr.write(`${violation.rule}: ${violation.file}: ${violation.message}\n`);
    }
    process.exit(1);
  }
  process.stdout.write(`QA control inventory generated at ${CONTROL_INVENTORY_PATH}\n`);
}

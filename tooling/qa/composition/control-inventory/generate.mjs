import fs from 'node:fs';
import path from 'node:path';

import {
  collectControlDiscovery,
  CONTROL_INVENTORY_PATH,
  readControlPolicy,
} from './discovery.mjs';
import { collectControlPolicyViolations } from './policy.mjs';
import { fromRelativePath } from '../../analysis/repository/shared-paths.mjs';
import { isExecutedAsScript } from '../../runtime/process/shared-cli.mjs';

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function writeJson(relativePath, value) {
  const target = fromRelativePath(relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, stableJson(value));
}

export function buildControlInventory(discovery, policy) {
  return {
    schemaVersion: 4,
    ownerIdentity: 'owner/control-inventory',
    exceptions: policy.exceptions,
    controls: discovery.controls,
    executables: discovery.executables,
    packageQaScripts: discovery.packageQaScripts,
    policyFiles: discovery.policyFiles,
  };
}

export function generateControlInventory() {
  const discovery = collectControlDiscovery();
  const policy = readControlPolicy();
  const violations = collectControlPolicyViolations(discovery, policy);
  if (violations.length === 0)
    writeJson(CONTROL_INVENTORY_PATH, buildControlInventory(discovery, policy));
  return { discovery, policy, violations };
}

if (isExecutedAsScript(import.meta.url)) {
  const result = generateControlInventory();
  if (result.violations.length > 0) {
    for (const violation of result.violations) {
      process.stderr.write(`${violation.rule}: ${violation.file}: ${violation.message}\n`);
    }
    process.exit(1);
  }
  process.stdout.write(`QA control inventory generated at ${CONTROL_INVENTORY_PATH}\n`);
}

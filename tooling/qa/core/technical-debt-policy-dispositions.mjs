import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { collectPolicySurfaceInventory } from './technical-debt-policy-discovery.mjs';

const CLASSIFICATIONS = new Set(['permanent-policy', 'tool-filter']);
const POLICY_INVENTORY_CACHE = new Map();
const CODE_SOURCE_PATTERN = /\.(?:[cm]?[jt]sx?)$/u;

function digestFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function violation(rule, file, message) {
  return { rule, file, message };
}

function validText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function policyInventory(root) {
  if (root !== process.cwd()) return collectPolicySurfaceInventory(root);
  if (!POLICY_INVENTORY_CACHE.has(root)) {
    POLICY_INVENTORY_CACHE.set(root, collectPolicySurfaceInventory(root));
  }
  return POLICY_INVENTORY_CACHE.get(root);
}

export function collectPolicyDispositionViolations(dispositions, { root, registryPath }) {
  const violations = [];
  const byId = new Map();
  const inventory = policyInventory(root);
  for (const [index, disposition] of dispositions.entries()) {
    const location = `${registryPath}#policyDispositions[${index}]`;
    if (byId.has(disposition?.id)) {
      violations.push(
        violation(
          'policy-disposition-duplicate',
          location,
          `Duplicate policy disposition ${disposition.id}.`
        )
      );
    }
    byId.set(disposition?.id, disposition);
    violations.push(...validateDisposition(disposition, { inventory, location, root }));
  }
  violations.push(...validateDiscoveredPopulation(dispositions, inventory.surfaces, registryPath));
  return violations;
}

export function synchronizePolicyDispositionInventory(dispositions, { root }) {
  const inventory = policyInventory(root);
  const rowsBySource = new Map();
  for (const row of dispositions) {
    const sourcePath = row.exactSource.path;
    const rows = rowsBySource.get(sourcePath) ?? [];
    rows.push(row);
    rowsBySource.set(sourcePath, rows);
  }
  const surfacesBySource = new Map();
  for (const surface of inventory.surfaces) {
    const locators = surfacesBySource.get(surface.sourcePath) ?? [];
    locators.push(surface.locator);
    surfacesBySource.set(surface.sourcePath, locators);
  }
  const sourcePaths = new Set(surfacesBySource.keys());
  for (const sourcePath of rowsBySource.keys()) {
    if (!CODE_SOURCE_PATTERN.test(sourcePath)) sourcePaths.add(sourcePath);
  }
  return [...sourcePaths]
    .sort()
    .map((sourcePath) => {
      const seed = [...(rowsBySource.get(sourcePath) ?? [])].sort((left, right) =>
        left.id.localeCompare(right.id)
      )[0];
      const row = seed ?? createGeneratedDisposition(sourcePath);
      return {
        ...row,
        exactSource: { path: sourcePath, contentHash: digestFile(path.join(root, sourcePath)) },
        consumers: inventory.consumersFor(sourcePath),
        surfaces: [...(surfacesBySource.get(sourcePath) ?? [])].sort((left, right) =>
          left.localeCompare(right)
        ),
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function createGeneratedDisposition(sourcePath) {
  const basename = path
    .basename(sourcePath)
    .replaceAll(/[^a-z0-9]+/giu, '-')
    .toLowerCase();
  const suffix = crypto.createHash('sha256').update(sourcePath).digest('hex').slice(0, 10);
  return {
    id: `policy.source.${basename}.${suffix}`,
    classification: 'tool-filter',
    owner: sourcePath.includes('/security/') ? 'security-tooling' : 'qa-platform',
    risk: 'An unreviewed code-owned control collection can weaken deterministic repository checks.',
    rationale: 'Keep this complete source-owned control population exact and review every change.',
    remediation: 'Narrow or remove the source collection, then regenerate its exact disposition.',
  };
}

function sortedUniqueStrings(values) {
  return (
    Array.isArray(values) &&
    values.every((value) => validText(value) && !value.includes('*')) &&
    new Set(values).size === values.length &&
    values.every((value, index) => index === 0 || values[index - 1].localeCompare(value) < 0)
  );
}

function validateDisposition(disposition, { inventory, location, root }) {
  const violations = [];
  if (!CLASSIFICATIONS.has(disposition?.classification)) {
    violations.push(
      violation(
        'policy-disposition-classification',
        location,
        'Policy classification must be permanent-policy or tool-filter.'
      )
    );
  }
  for (const field of ['id', 'owner', 'risk', 'rationale', 'remediation']) {
    if (!validText(disposition?.[field])) {
      violations.push(
        violation('policy-disposition-metadata', location, `Policy disposition requires ${field}.`)
      );
    }
  }
  for (const field of ['consumers', 'surfaces']) {
    if (!sortedUniqueStrings(disposition?.[field])) {
      violations.push(
        violation(
          'policy-disposition-population-shape',
          location,
          `Policy disposition ${field} must be an exact sorted unique array without wildcards.`
        )
      );
    }
  }
  violations.push(...validateDispositionSource(disposition, { location, root }));
  if (validText(disposition?.exactSource?.path) && Array.isArray(disposition?.consumers)) {
    const discovered = inventory.consumersFor(disposition.exactSource.path);
    if (JSON.stringify(disposition.consumers) !== JSON.stringify(discovered)) {
      violations.push(
        violation(
          'policy-disposition-consumer-drift',
          disposition.exactSource.path,
          `Policy consumers changed for ${disposition.id}; reconcile the exact sorted consumer population.`
        )
      );
    }
  }
  return violations;
}

function validateDiscoveredPopulation(dispositions, surfaces, registryPath) {
  const claimed = new Map();
  const violations = [];
  for (const disposition of dispositions) {
    for (const locator of disposition?.surfaces ?? []) {
      const key = `${disposition?.exactSource?.path}#${locator}`;
      if (claimed.has(key)) {
        violations.push(
          violation(
            'policy-disposition-surface-duplicate',
            registryPath,
            `${key} is claimed by both ${claimed.get(key)} and ${disposition.id}.`
          )
        );
      }
      claimed.set(key, disposition.id);
    }
  }
  const discovered = new Set(surfaces.map(({ key }) => key));
  for (const surface of surfaces) {
    if (!claimed.has(surface.key)) {
      violations.push(
        violation(
          'policy-disposition-missing',
          surface.sourcePath,
          `Discovered policy/filter surface is not classified: ${surface.locator}.`
        )
      );
    }
  }
  for (const [key, id] of claimed) {
    if (!discovered.has(key)) {
      violations.push(
        violation(
          'policy-disposition-stale-surface',
          registryPath,
          `${id} declares stale or undiscovered surface ${key}.`
        )
      );
    }
  }
  return violations;
}

function validateDispositionSource(disposition, { location, root }) {
  const sourcePath = disposition?.exactSource?.path;
  const expectedHash = disposition?.exactSource?.contentHash;
  const absolutePath = validText(sourcePath) ? path.join(root, sourcePath) : null;
  if (
    !absolutePath ||
    !fs.existsSync(absolutePath) ||
    !/^[a-f0-9]{64}$/u.test(expectedHash ?? '')
  ) {
    return [
      violation(
        'policy-disposition-source',
        location,
        'Policy disposition requires an existing exact source and SHA-256 content hash.'
      ),
    ];
  }
  return digestFile(absolutePath) === expectedHash
    ? []
    : [
        violation(
          'policy-disposition-drift',
          sourcePath,
          `Policy population changed for ${disposition.id}; review the widening risk before updating its exact digest.`
        ),
      ];
}

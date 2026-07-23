import fs from 'node:fs';
import path from 'node:path';

import { parseNamedDeclarativeConstArray } from './declarative-inventory.mjs';
import { readHeadFileText } from './git-head-sources.mjs';
import { repoRoot } from './shared.mjs';
import { createSourceFile } from './structural-risk/ast.mjs';

export const INSTANCE_OWNERSHIP_INVENTORY = 'tooling/configs/qa/instance-ownership.data.json';

const LEGACY_INSTANCE_OWNERSHIP_SOURCE = 'tooling/qa/core/verify-instance-ownership.data.mjs';
const OWNERSHIP_RULES = new Set(['facade-default-owner', 'no-top-level-mutable-runtime-state']);
const WAVE_KEYS = ['files', 'id', 'rule'];

function violation(rule, message) {
  return { file: INSTANCE_OWNERSHIP_INVENTORY, message, rule };
}

function hasExactKeys(value, keys) {
  return Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
}

function isValidWaveShape(wave) {
  return wave == null || typeof wave !== 'object' || Array.isArray(wave)
    ? false
    : hasExactKeys(wave, WAVE_KEYS) &&
        typeof wave.id === 'string' &&
        wave.id.length > 0 &&
        Array.isArray(wave.files) &&
        wave.files.length > 0 &&
        OWNERSHIP_RULES.has(wave.rule);
}

function collectWaveIdentityViolations(wave, ids) {
  if (!ids.has(wave.id)) {
    ids.add(wave.id);
    return [];
  }
  return [
    violation('instance-ownership-inventory-duplicate-wave', `Duplicate wave id: ${wave.id}.`),
  ];
}

function collectWaveTargetViolations(wave, targets) {
  const issues = [];
  for (const file of wave.files) {
    const key = `${wave.rule}:${file}`;
    if (typeof file !== 'string' || file.length === 0) {
      issues.push(
        violation('instance-ownership-inventory-file', `${wave.id} contains an invalid target.`)
      );
    } else if (targets.has(key)) {
      issues.push(
        violation(
          'instance-ownership-inventory-duplicate-target',
          `${wave.id} duplicates ${file} for ${wave.rule}.`
        )
      );
    }
    targets.add(key);
  }
  return issues;
}

function validateWave(wave, index, ids, targets) {
  if (!isValidWaveShape(wave)) {
    return [
      violation(
        'instance-ownership-inventory-wave-shape',
        `Ownership wave ${index} requires only a non-empty id, supported rule, and files array.`
      ),
    ];
  }
  return [
    ...collectWaveIdentityViolations(wave, ids),
    ...collectWaveTargetViolations(wave, targets),
  ];
}

function validateInventoryValue(value) {
  if (
    value == null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !hasExactKeys(value, ['schemaVersion', 'waves']) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.waves)
  ) {
    return {
      violations: [
        violation(
          'instance-ownership-inventory-shape',
          'Instance ownership inventory requires schemaVersion 1 and a waves array.'
        ),
      ],
      waves: [],
    };
  }
  const ids = new Set();
  const targets = new Set();
  return {
    violations: value.waves.flatMap((wave, index) => validateWave(wave, index, ids, targets)),
    waves: value.waves,
  };
}

function parseInventoryJson(source) {
  try {
    return validateInventoryValue(JSON.parse(source));
  } catch {
    return {
      violations: [
        violation(
          'instance-ownership-inventory-json',
          'Instance ownership inventory must contain valid inert JSON.'
        ),
      ],
      waves: [],
    };
  }
}

function readCurrentInventory(root) {
  const absolutePath = path.join(root, INSTANCE_OWNERSHIP_INVENTORY);
  return fs.existsSync(absolutePath)
    ? parseInventoryJson(fs.readFileSync(absolutePath, 'utf8'))
    : {
        violations: [
          violation(
            'instance-ownership-inventory-missing',
            'Instance ownership inventory is missing.'
          ),
        ],
        waves: [],
      };
}

function readHeadInventory(headSourceResolver) {
  const jsonSource = headSourceResolver(INSTANCE_OWNERSHIP_INVENTORY);
  if (jsonSource != null) return parseInventoryJson(jsonSource);
  const legacySource = headSourceResolver(LEGACY_INSTANCE_OWNERSHIP_SOURCE);
  if (legacySource == null) return null;
  const sourceFile = createSourceFile(LEGACY_INSTANCE_OWNERSHIP_SOURCE, legacySource);
  const parsed = parseNamedDeclarativeConstArray(sourceFile, 'OWNERSHIP_WAVES');
  return parsed == null ? null : validateInventoryValue({ schemaVersion: 1, waves: parsed.value });
}

function indexTargets(waves) {
  return new Map(
    waves.flatMap((wave) =>
      wave.files.map((file) => [`${wave.rule}:${file}`, { file, rule: wave.rule }])
    )
  );
}

function isLiveTarget(root, file) {
  return file.startsWith('@') || fs.existsSync(path.join(root, file));
}

function collectPopulationViolations(currentWaves, headWaves, root) {
  const currentTargets = indexTargets(currentWaves);
  const headTargets = indexTargets(headWaves);
  const issues = [];
  if (headTargets.size > 0 && currentTargets.size === 0) {
    issues.push(
      violation(
        'instance-ownership-inventory-collapse',
        'Instance ownership inventory cannot collapse a non-empty HEAD census.'
      )
    );
  }
  for (const [key, target] of headTargets) {
    if (!currentTargets.has(key) && isLiveTarget(root, target.file)) {
      issues.push(
        violation(
          'instance-ownership-inventory-live-removal',
          `Cannot remove live ${target.rule} target without harness verification: ${target.file}.`
        )
      );
    }
  }
  for (const [key, target] of currentTargets) {
    if (!headTargets.has(key)) {
      issues.push(
        violation(
          'instance-ownership-inventory-addition-requires-harness',
          `New ${target.rule} target requires executable harness verification: ${target.file}.`
        )
      );
    }
  }
  return issues;
}

export function loadInstanceOwnershipInventory({ root = repoRoot } = {}) {
  const current = readCurrentInventory(root);
  if (current.violations.length > 0) {
    throw new Error(current.violations.map((item) => item.message).join(' '));
  }
  return current.waves;
}

export function collectInstanceOwnershipInventoryViolations({
  root = repoRoot,
  headSourceResolver = (file) => readHeadFileText(file, { root }),
} = {}) {
  const current = readCurrentInventory(root);
  if (current.violations.length > 0) return current.violations;
  const head = readHeadInventory(headSourceResolver);
  if (head == null || head.violations.length > 0) {
    return [
      violation(
        'instance-ownership-inventory-head-proof',
        'Cannot prove the HEAD ownership census for an inventory-only change.'
      ),
    ];
  }
  return collectPopulationViolations(current.waves, head.waves, root);
}

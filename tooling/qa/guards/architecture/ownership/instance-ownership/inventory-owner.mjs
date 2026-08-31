import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readHeadFileText } from '../../../../analysis/git/git-head-sources.mjs';

export const INSTANCE_OWNERSHIP_INVENTORY = 'tooling/configs/qa/instance-ownership.data.json';

const DEFAULT_INVENTORY_ROOT = fileURLToPath(new URL('../../../../../../', import.meta.url));
const OWNERSHIP_RULES = new Set(['facade-default-owner', 'no-top-level-mutable-runtime-state']);
const WAVE_KEYS = ['files', 'id', 'rule'];
const REVIEWED_CROSS_OWNER_PATH_REPLACEMENTS = [
  {
    from: 'apps/extension/src/content/logic/diagnostic-logger.ts',
    to: 'apps/extension/src/content/application/diagnostics/runtime/logger.ts',
    rule: 'facade-default-owner',
    waveId: 'content-facade-owners',
  },
  {
    from: 'apps/extension/src/content/parser/export-manager-diagnostics.ts',
    to: 'apps/extension/src/content/parser/export-manager/diagnostics/source.ts',
    rule: 'facade-default-owner',
    waveId: 'content-facade-owners',
  },
  {
    from: 'apps/extension/src/content/parser/export-manager-dom-driver.ts',
    to: 'apps/extension/src/content/parser/export-manager/diagnostics/dom-driver.ts',
    rule: 'facade-default-owner',
    waveId: 'content-facade-owners',
  },
  {
    from: 'apps/extension/src/content/selection/locker.ts',
    to: 'apps/extension/src/content/selection/locker/index.ts',
    rule: 'facade-default-owner',
    waveId: 'content-facade-owners',
  },
  {
    from: 'apps/extension/src/content/selection/quick-edit.ts',
    to: 'apps/extension/src/content/selection/quick-edit/index.ts',
    rule: 'facade-default-owner',
    waveId: 'content-facade-owners',
  },
  {
    from: 'apps/extension/src/content/selection/selection-mode.ts',
    to: 'apps/extension/src/content/selection/selection-mode/index.ts',
    rule: 'facade-default-owner',
    waveId: 'content-facade-owners',
  },
  {
    from: 'apps/extension/src/content/logic/crop-tool.ts',
    to: 'apps/extension/src/content/drawing/controller.ts',
    rule: 'no-top-level-mutable-runtime-state',
    waveId: 'content-owned-runtime-seams',
  },
  {
    from: 'apps/extension/src/content/selection/highlighter-cursor-style.controller.ts',
    to: 'apps/extension/src/content/selection/highlighter-cursor-style/controller.ts',
    rule: 'no-top-level-mutable-runtime-state',
    waveId: 'content-owned-runtime-seams',
  },
  {
    from: 'apps/extension/src/content/parser/popup-export/controller.ts',
    to: 'apps/extension/src/content/parser/popup-export/controller/index/create.ts',
    rule: 'no-top-level-mutable-runtime-state',
    waveId: 'content-owned-runtime-seams',
  },
  {
    from: 'apps/extension/src/content/selection/quick-edit.controller.ts',
    to: 'apps/extension/src/content/selection/quick-edit/controller.ts',
    rule: 'no-top-level-mutable-runtime-state',
    waveId: 'content-owned-runtime-seams',
  },
  {
    from: 'apps/extension/src/content/selection/selection-mode.controller.ts',
    to: 'apps/extension/src/content/selection/selection-mode/controller/index.ts',
    rule: 'no-top-level-mutable-runtime-state',
    waveId: 'content-owned-runtime-seams',
  },
  {
    from: 'apps/extension/src/scenario-editor/useScenarioEditorController.ts',
    to: 'apps/extension/src/scenario-editor/project/state/index.ts',
    rule: 'no-top-level-mutable-runtime-state',
    waveId: 'scenario-editor-owner-seams',
  },
  {
    from: 'apps/extension/src/scenario-editor/scenario-editor-controller.state.ts',
    to: 'apps/extension/src/scenario-editor/project/state/values.ts',
    rule: 'no-top-level-mutable-runtime-state',
    waveId: 'scenario-editor-owner-seams',
  },
  {
    from: 'apps/extension/src/scenario-editor/scenario-editor-controller.ui-state.ts',
    to: 'apps/extension/src/scenario-editor/project/state/ui.ts',
    rule: 'no-top-level-mutable-runtime-state',
    waveId: 'scenario-editor-owner-seams',
  },
  {
    from: 'apps/extension/src/background/runtime/page-access/service.ts',
    to: 'apps/extension/src/background/page-access/service.ts',
    rule: 'facade-default-owner',
    waveId: 'background-runtime-facades',
  },
  {
    from: 'apps/extension/src/background/media/video/runtime/offscreen-manager.ts',
    to: 'apps/extension/src/background/offscreen-document/service.ts',
    rule: 'facade-default-owner',
    waveId: 'background-runtime-facades',
  },
];

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
  return jsonSource == null ? null : parseInventoryJson(jsonSource);
}

function indexTargets(waves) {
  return new Map(
    waves.flatMap((wave) =>
      wave.files.map((file) => [`${wave.rule}:${file}`, { file, rule: wave.rule, waveId: wave.id }])
    )
  );
}

function packageSelectorParts(selector) {
  const segments = selector.split('/');
  if (segments.length < 2 || !segments[0].startsWith('@')) return null;
  return {
    exportKey: segments.length === 2 ? '.' : `./${segments.slice(2).join('/')}`,
    packageName: segments.slice(0, 2).join('/'),
  };
}

function resolvePackageSelector(root, selector) {
  const parts = packageSelectorParts(selector);
  if (!parts) return null;
  const packagesRoot = path.join(root, 'packages');
  if (!fs.existsSync(packagesRoot)) return null;

  for (const directory of fs.readdirSync(packagesRoot, { withFileTypes: true })) {
    if (!directory.isDirectory()) continue;
    const packageRoot = path.join(packagesRoot, directory.name);
    const manifestPath = path.join(packageRoot, 'package.json');
    if (!fs.existsSync(manifestPath)) continue;
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {
      continue;
    }
    if (manifest?.name !== parts.packageName) continue;
    const exportTarget = manifest.exports?.[parts.exportKey];
    if (typeof exportTarget !== 'string') return null;
    const absoluteTarget = path.resolve(packageRoot, exportTarget);
    if (!absoluteTarget.startsWith(`${packageRoot}${path.sep}`) || !fs.existsSync(absoluteTarget)) {
      return null;
    }
    return path.relative(root, fs.realpathSync(absoluteTarget)).split(path.sep).join('/');
  }
  return null;
}

export function resolveCanonicalOwnershipPath(root, target) {
  if (typeof target !== 'string' || target.length === 0) return null;
  if (target.startsWith('@')) return resolvePackageSelector(root, target);
  if (path.posix.isAbsolute(target) || path.posix.normalize(target) !== target) return null;
  const absoluteTarget = path.join(root, target);
  if (!fs.existsSync(absoluteTarget) || !fs.statSync(absoluteTarget).isFile()) return null;
  const canonicalTarget = path
    .relative(root, fs.realpathSync(absoluteTarget))
    .split(path.sep)
    .join('/');
  return canonicalTarget.startsWith('../') ? null : canonicalTarget;
}

function resolveInventoryWaves(waves, root) {
  const resolvedTargets = new Set();
  const violations = [];
  const resolvedWaves = waves.map((wave) => ({
    ...wave,
    files: wave.files.flatMap((target) => {
      const resolved = resolveCanonicalOwnershipPath(root, target);
      if (!resolved) {
        violations.push(
          violation(
            'instance-ownership-inventory-stale-target',
            `${wave.id} target does not resolve to a canonical live source: ${target}.`
          )
        );
        return [];
      }
      const key = `${wave.rule}:${resolved}`;
      if (resolvedTargets.has(key)) {
        violations.push(
          violation(
            'instance-ownership-inventory-duplicate-resolved-target',
            `${wave.id} resolves a duplicate ${wave.rule} target: ${resolved}.`
          )
        );
      }
      resolvedTargets.add(key);
      return [resolved];
    }),
  }));
  return { violations, waves: resolvedWaves };
}

function projectInventory(waves) {
  return {
    facadeFiles: new Set(
      waves.filter((wave) => wave.rule === 'facade-default-owner').flatMap((wave) => wave.files)
    ),
    stateFiles: new Set(
      waves
        .filter((wave) => wave.rule === 'no-top-level-mutable-runtime-state')
        .flatMap((wave) => wave.files)
    ),
    waves,
  };
}

function isLiveTarget(root, file) {
  return resolveCanonicalOwnershipPath(root, file) != null;
}

function isLocalLiveTarget(root, file) {
  return isLiveTarget(root, file);
}

function collectRetiredPathReplacementKeys(currentTargets, headTargets, root) {
  const retiredTargets = [...headTargets.entries()].filter(
    ([key, target]) => !currentTargets.has(key) && !isLiveTarget(root, target.file)
  );
  const consumedRetiredKeys = new Set();
  const replacementKeys = new Set();

  for (const replacement of REVIEWED_CROSS_OWNER_PATH_REPLACEMENTS) {
    const retiredKey = `${replacement.rule}:${replacement.from}`;
    const successorKey = `${replacement.rule}:${replacement.to}`;
    const retiredTarget = headTargets.get(retiredKey);
    const successorTarget = currentTargets.get(successorKey);
    if (
      retiredTarget?.waveId === replacement.waveId &&
      successorTarget?.waveId === replacement.waveId &&
      !currentTargets.has(retiredKey) &&
      !isLiveTarget(root, replacement.from) &&
      isLocalLiveTarget(root, replacement.to)
    ) {
      consumedRetiredKeys.add(retiredKey);
      replacementKeys.add(successorKey);
    }
  }

  for (const [key, target] of currentTargets) {
    if (headTargets.has(key) || replacementKeys.has(key) || !isLocalLiveTarget(root, target.file)) {
      continue;
    }
    const replacement = retiredTargets.find(
      ([retiredKey, retiredTarget]) =>
        !consumedRetiredKeys.has(retiredKey) &&
        retiredTarget.rule === target.rule &&
        retiredTarget.waveId === target.waveId &&
        path.dirname(retiredTarget.file) === path.dirname(target.file)
    );
    if (!replacement) continue;
    consumedRetiredKeys.add(replacement[0]);
    replacementKeys.add(key);
  }

  return replacementKeys;
}

function collectLiveTargetReclassificationKeys(currentTargets, headTargets, root) {
  const removedTargets = [...headTargets.entries()].filter(
    ([key, target]) => !currentTargets.has(key) && isLocalLiveTarget(root, target.file)
  );
  const consumedRemovedKeys = new Set();
  const currentKeys = new Set();
  const headKeys = new Set();

  for (const [key, target] of currentTargets) {
    if (headTargets.has(key) || !isLocalLiveTarget(root, target.file)) continue;
    const replacement = removedTargets.find(
      ([removedKey, removedTarget]) =>
        !consumedRemovedKeys.has(removedKey) && removedTarget.file === target.file
    );
    if (!replacement) continue;
    consumedRemovedKeys.add(replacement[0]);
    headKeys.add(replacement[0]);
    currentKeys.add(key);
  }

  return { currentKeys, headKeys };
}

function collectPopulationReview(
  currentWaves,
  headWaves,
  root,
  { allowFacadeAdditions = false } = {}
) {
  const currentTargets = indexTargets(currentWaves);
  const headTargets = indexTargets(headWaves);
  const retiredPathReplacementKeys = collectRetiredPathReplacementKeys(
    currentTargets,
    headTargets,
    root
  );
  const liveTargetReclassificationKeys = collectLiveTargetReclassificationKeys(
    currentTargets,
    headTargets,
    root
  );
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
    if (
      !currentTargets.has(key) &&
      !liveTargetReclassificationKeys.headKeys.has(key) &&
      isLiveTarget(root, target.file)
    ) {
      issues.push(
        violation(
          'instance-ownership-inventory-live-removal',
          `Cannot remove live ${target.rule} target without harness verification: ${target.file}.`
        )
      );
    }
  }
  for (const [key, target] of currentTargets) {
    if (
      !headTargets.has(key) &&
      !retiredPathReplacementKeys.has(key) &&
      !liveTargetReclassificationKeys.currentKeys.has(key) &&
      !(allowFacadeAdditions && target.rule === 'facade-default-owner')
    ) {
      issues.push(
        violation(
          'instance-ownership-inventory-addition-requires-harness',
          `New ${target.rule} target requires executable harness verification: ${target.file}.`
        )
      );
    }
  }
  return {
    reclassifications: [...liveTargetReclassificationKeys.currentKeys].map((key) =>
      currentTargets.get(key)
    ),
    violations: issues,
  };
}

export function loadInstanceOwnershipInventory({ root = DEFAULT_INVENTORY_ROOT } = {}) {
  const current = readCurrentInventory(root);
  if (current.violations.length > 0) {
    throw new Error(current.violations.map((item) => item.message).join(' '));
  }
  const resolved = resolveInventoryWaves(current.waves, root);
  if (resolved.violations.length > 0) {
    throw new Error(resolved.violations.map((item) => item.message).join(' '));
  }
  return projectInventory(resolved.waves);
}

export function collectInstanceOwnershipInventoryReview({
  allowFacadeAdditions = false,
  root = DEFAULT_INVENTORY_ROOT,
  headSourceResolver = (file) => readHeadFileText(file, { root }),
} = {}) {
  const current = readCurrentInventory(root);
  if (current.violations.length > 0) {
    return { reclassifications: [], violations: current.violations };
  }
  const resolvedCurrent = resolveInventoryWaves(current.waves, root);
  if (resolvedCurrent.violations.length > 0) {
    return { reclassifications: [], violations: resolvedCurrent.violations };
  }
  const head = readHeadInventory(headSourceResolver);
  if (head == null || head.violations.length > 0) {
    return {
      reclassifications: [],
      violations: [
        violation(
          'instance-ownership-inventory-head-proof',
          'Cannot prove the HEAD ownership census for an inventory-only change.'
        ),
      ],
    };
  }
  return collectPopulationReview(current.waves, head.waves, root, { allowFacadeAdditions });
}

export function collectInstanceOwnershipInventoryViolations(options = {}) {
  return collectInstanceOwnershipInventoryReview(options).violations;
}

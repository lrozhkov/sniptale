import crypto from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  collectPolicySurfaceInventory,
  POLICY_DISCOVERY_SOURCE_MANIFEST,
} from './technical-debt-policy-discovery.mjs';
import {
  collectPolicyDispositionViolations,
  synchronizePolicyDispositionInventory,
} from './technical-debt-policy-dispositions.mjs';

const roots: string[] = [];

function write(root: string, relativePath: string, source: string) {
  const target = join(root, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, source);
}

function createRoot() {
  const root = mkdtempSync(join(tmpdir(), 'policy-surfaces-'));
  roots.push(root);
  mkdirSync(join(root, 'tooling'), { recursive: true });
  for (const sourcePath of POLICY_DISCOVERY_SOURCE_MANIFEST.exactFiles) {
    write(root, sourcePath, 'export default {};\n');
  }
  return root;
}

function digest(root: string, relativePath: string) {
  return crypto
    .createHash('sha256')
    .update(readFileSync(join(root, relativePath)))
    .digest('hex');
}

function disposition(root: string, sourcePath: string, surfaces: string[], consumers: string[]) {
  return {
    id: 'policy.fixture-exceptions',
    classification: 'permanent-policy',
    owner: 'qa-platform',
    risk: 'A widened fixture exception could bypass the guarded path.',
    rationale: 'Keep the fixture exception exact.',
    remediation: 'Remove or narrow the fixture exception.',
    exactSource: { path: sourcePath, contentHash: digest(root, sourcePath) },
    surfaces,
    consumers,
  };
}

function policyViolations(root: string, dispositions: object[]) {
  return collectPolicyDispositionViolations(dispositions, {
    root,
    registryPath: 'tooling/configs/qa/technical-debt.data.json',
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('open-set policy surface discovery', () => {
  it('discovers neutral, skipped-scan, and safe-transition collection names', () => {
    const root = createRoot();
    const sourcePath = 'tooling/qa/core/neutral-controls.ts';
    write(
      root,
      sourcePath,
      [
        "const ARBITRARY_NEUTRAL_NAME = ['alpha'] as const;",
        "const SKIPPED_SCAN_DIRS = new Set(['generated']);",
        "const SAFE_LOCAL_TRANSITION_NAMES = Object.freeze(['setTimeout'] as const);",
        "const LITERAL_KEY_TABLE = { '*': ['exact'] };",
        'export { ARBITRARY_NEUTRAL_NAME, LITERAL_KEY_TABLE, SAFE_LOCAL_TRANSITION_NAMES, SKIPPED_SCAN_DIRS };',
        '',
      ].join('\n')
    );

    expect(collectPolicySurfaceInventory(root).surfaces.map(({ locator }) => locator)).toEqual([
      'binding:ARBITRARY_NEUTRAL_NAME',
      'binding:LITERAL_KEY_TABLE',
      'binding:SAFE_LOCAL_TRANSITION_NAMES',
      'binding:SKIPPED_SCAN_DIRS',
      'property:%2A',
    ]);
  });

  it('discovers policy collections in an exact source outside tooling', () => {
    const root = createRoot();
    const sourcePath = 'eslint.config.js';
    write(
      root,
      sourcePath,
      "const IGNORED_PATHS = ['generated/**'];\nexport default { ignores: IGNORED_PATHS };\n"
    );

    const inventory = collectPolicySurfaceInventory(root);
    expect(inventory.surfaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourcePath,
          locator: 'binding:IGNORED_PATHS',
          consumers: [sourcePath],
        }),
      ])
    );
    expect(policyViolations(root, []).map(({ rule }) => rule)).toContain(
      'policy-disposition-missing'
    );
  });
});

describe('inline policy surface discovery', () => {
  it('rejects a broad inline exception array in an already classified guard', () => {
    const root = createRoot();
    const sourcePath = 'tooling/qa/core/verify-fixture.mjs';
    write(
      root,
      sourcePath,
      [
        "const EXISTING_ALLOWLIST = ['apps/extension/src/exact.ts'];",
        "const INLINE_EXCEPTIONS = ['apps/extension/src/**'];",
        'export { EXISTING_ALLOWLIST, INLINE_EXCEPTIONS };',
        '',
      ].join('\n')
    );
    const surfaces = collectPolicySurfaceInventory(root).surfaces;
    const existing = surfaces.find(({ locator }) => locator.includes('EXISTING_ALLOWLIST'));
    const row = disposition(root, sourcePath, [existing!.locator], [sourcePath]);
    expect(policyViolations(root, [row])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: 'policy-disposition-missing',
          file: sourcePath,
        }),
      ])
    );
  });
});

describe('policy disposition synchronization', () => {
  it('machine-generates a stable source row without a hand-authored size list', () => {
    const root = createRoot();
    const sourcePath = 'tooling/qa/core/new-controls.mjs';
    write(root, sourcePath, "export const CONTROLS = ['one'];\n");

    const first = synchronizePolicyDispositionInventory([], { root });
    const second = synchronizePolicyDispositionInventory([], { root });

    expect(first).toEqual(second);
    expect(first).toEqual([
      expect.objectContaining({
        id: expect.stringMatching(/^policy\.source\.new-controls-mjs\.[a-f0-9]{10}$/u),
        exactSource: { path: sourcePath, contentHash: digest(root, sourcePath) },
        surfaces: ['binding:CONTROLS'],
        consumers: [sourcePath],
      }),
    ]);
  });

  it('groups every discovered source into one deterministic disposition', () => {
    const root = createRoot();
    const sourcePath = 'tooling/qa/core/neutral-controls.mjs';
    write(
      root,
      sourcePath,
      "const FIRST = ['one'];\nconst SECOND = new Set(['two']);\nexport { FIRST, SECOND };\n"
    );
    const duplicate = disposition(root, sourcePath, ['binding:FIRST'], [sourcePath]);
    const rows = synchronizePolicyDispositionInventory(
      [duplicate, { ...duplicate, id: 'policy.fixture-second' }],
      { root }
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'policy.fixture-exceptions',
      surfaces: ['binding:FIRST', 'binding:SECOND'],
      consumers: [sourcePath],
    });
  });
});

describe('imported policy surface discovery', () => {
  it('rejects a newly imported unclassified policy module', () => {
    const root = createRoot();
    write(
      root,
      'tooling/qa/policy/new-policy.mjs',
      "export const ALLOWED_PATHS = new Set(['apps/extension/src/exact.ts']);\n"
    );
    write(
      root,
      'tooling/qa/core/verify-fixture.mjs',
      "import { ALLOWED_PATHS } from '../policy/new-policy.mjs';\nexport { ALLOWED_PATHS };\n"
    );
    const inventory = collectPolicySurfaceInventory(root);
    expect(inventory.surfaces).toEqual([
      expect.objectContaining({
        sourcePath: 'tooling/qa/policy/new-policy.mjs',
        consumers: ['tooling/qa/core/verify-fixture.mjs', 'tooling/qa/policy/new-policy.mjs'],
      }),
    ]);
    expect(policyViolations(root, []).map(({ rule }) => rule)).toContain(
      'policy-disposition-missing'
    );
  });
});

describe('policy surface population drift', () => {
  it('rejects same-count content and source substitutions', () => {
    const root = createRoot();
    const sourcePath = 'tooling/qa/policy/neutral-policy.mjs';
    write(root, sourcePath, "export const NEUTRAL_CONTROL = ['first'];\n");
    const inventory = collectPolicySurfaceInventory(root);
    const row = disposition(
      root,
      sourcePath,
      inventory.surfaces.map(({ locator }) => locator),
      [sourcePath]
    );

    write(root, sourcePath, "export const NEUTRAL_CONTROL = ['other'];\n");
    expect(policyViolations(root, [row]).map(({ rule }) => rule)).toContain(
      'policy-disposition-drift'
    );

    rmSync(join(root, sourcePath));
    write(
      root,
      'tooling/qa/policy/replacement-policy.mjs',
      "export const REPLACEMENT = ['other'];\n"
    );
    expect(policyViolations(root, [row]).map(({ rule }) => rule)).toEqual(
      expect.arrayContaining(['policy-disposition-source', 'policy-disposition-missing'])
    );
  });

  it('rejects exact consumer drift and wildcard registry populations', () => {
    const root = createRoot();
    const sourcePath = 'tooling/qa/policy/new-policy.mjs';
    write(root, sourcePath, "export const ALLOWED_PATHS = new Set(['exact/path']);\n");
    write(
      root,
      'tooling/qa/core/verify-fixture.mjs',
      "import { ALLOWED_PATHS } from '../policy/new-policy.mjs';\nexport { ALLOWED_PATHS };\n"
    );
    const surfaces = collectPolicySurfaceInventory(root).surfaces;
    const row = disposition(root, sourcePath, [surfaces[0].locator], [sourcePath]);
    expect(policyViolations(root, [row]).map(({ rule }) => rule)).toContain(
      'policy-disposition-consumer-drift'
    );

    row.consumers = ['tooling/**'];
    expect(policyViolations(root, [row]).map(({ rule }) => rule)).toContain(
      'policy-disposition-population-shape'
    );
  });
});

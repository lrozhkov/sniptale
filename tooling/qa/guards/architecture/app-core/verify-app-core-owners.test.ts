import { afterEach, expect, it } from 'vitest';

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  appCoreOwnerPolicyErrors,
  collectAppCoreOwnerProjection,
  deriveAppCoreOwnerPath,
} from './app-core-owner-policy.mjs';
import { appCoreOwnerErrors } from './verify-app-core-owners.mjs';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

function write(root: string, path: string, contents = 'export const value = true;\n'): string {
  const output = join(root, path);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, contents);
  return path;
}

const FIXTURE_POLICY = {
  schemaVersion: 3,
  authorityOwners: ['apps/extension/src/composition/persistence/state.ts'],
  forbiddenOwnerEdges: [
    ['apps/extension/src/features', 'apps/extension/src/ui'],
    ['apps/extension/src/platform', 'apps/extension/src/features'],
  ],
  featurePublicEntrypoints: ['apps/extension/src/features/final.ts'],
  sameConcernPersistenceEdges: [],
  forbiddenBroadBarrels: ['apps/extension/src/features/index.ts'],
};

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'app-core-owners-'));
  roots.push(root);
  const policy = structuredClone(FIXTURE_POLICY);
  const codeFiles = [
    write(root, 'apps/extension/src/composition/persistence/state.ts'),
    write(root, 'apps/extension/src/features/final.ts'),
    write(root, 'apps/extension/src/ui/view.ts'),
  ];
  return { codeFiles, policy, root };
}

it('accepts a complete final-owner fixture', () => {
  const context = fixture();
  expect(appCoreOwnerErrors(context)).toEqual([]);
});

it('derives the current owner projection without an exact residency registry', () => {
  const context = fixture();
  context.codeFiles.push(write(context.root, 'apps/extension/src/composition/new-owner/index.ts'));

  expect(appCoreOwnerErrors(context)).toEqual([]);
  expect(collectAppCoreOwnerProjection(context.codeFiles)).toContain(
    'apps/extension/src/composition/new-owner'
  );
  expect(
    deriveAppCoreOwnerPath('apps/extension/src/composition/persistence/example/state.ts')
  ).toBe('apps/extension/src/composition/persistence/example');
});

it('rejects stale owners, missing authorities, unclassified roots and forbidden edges', () => {
  const context = fixture();
  context.codeFiles.push(
    write(context.root, 'apps/extension/src/platform/old.ts'),
    write(
      context.root,
      'apps/extension/src/features/backedge.ts',
      "import '../ui/view';\nexport const value = true;\n"
    ),
    write(context.root, 'apps/extension/src/composition/other.ts')
  );
  rmSync(join(context.root, 'apps/extension/src/composition/persistence/state.ts'));

  expect(appCoreOwnerErrors(context)).toEqual(
    expect.arrayContaining([
      'authority owner is missing: apps/extension/src/composition/persistence/state.ts',
      'forbidden app-core owner import: apps/extension/src/features/backedge.ts -> apps/extension/src/ui/view.ts',
    ])
  );
});

it('rejects duplicate authority classification', () => {
  const { policy } = fixture();
  policy.authorityOwners.push(policy.authorityOwners[0]);
  expect(appCoreOwnerPolicyErrors(policy)).toEqual(['invalid app-core owner policy']);
});

it('rejects duplicate exception pairs', () => {
  const { policy } = fixture();
  policy.forbiddenOwnerEdges.push([...policy.forbiddenOwnerEdges[0]]);
  expect(appCoreOwnerPolicyErrors(policy)).toEqual(['invalid app-core owner policy']);

  policy.forbiddenOwnerEdges.pop();
  policy.sameConcernPersistenceEdges.push([
    'apps/extension/src/features/final',
    'apps/extension/src/composition/persistence/state',
  ]);
  policy.sameConcernPersistenceEdges.push([...policy.sameConcernPersistenceEdges[0]]);
  expect(appCoreOwnerPolicyErrors(policy)).toEqual(['invalid app-core owner policy']);
});

it('accepts declared public feature and same-concern persistence edges', () => {
  const context = fixture();
  context.policy.sameConcernPersistenceEdges.push([
    'apps/extension/src/features/alpha',
    'apps/extension/src/composition/persistence/state.ts',
  ]);
  context.codeFiles.push(
    write(
      context.root,
      'apps/extension/src/features/alpha/public-consumer.ts',
      "import '../final';\nimport '../../composition/persistence/state';\nexport const value = true;\n"
    )
  );

  expect(appCoreOwnerErrors(context)).toEqual([]);
});

function addRuntimeViolationFixtures(context: ReturnType<typeof fixture>) {
  context.codeFiles.push(
    write(
      context.root,
      'apps/extension/src/background/a.ts',
      "import '../content/b';\nexport const value = true;\n"
    ),
    write(context.root, 'apps/extension/src/content/b.ts'),
    write(
      context.root,
      'apps/extension/src/camera-recorder/a.ts',
      "import '../content/b';\nexport const value = true;\n"
    ),
    write(
      context.root,
      'apps/extension/src/workflows/runtime-bridge.ts',
      "import '../content/b';\nexport const value = true;\n"
    )
  );
}

function addAppCoreViolationFixtures(context: ReturnType<typeof fixture>) {
  context.codeFiles.push(
    write(
      context.root,
      'apps/extension/src/features/alpha/source.ts',
      "import '../beta/internal';\nexport const value = true;\n"
    ),
    write(context.root, 'apps/extension/src/features/beta/internal.ts'),
    write(
      context.root,
      'apps/extension/src/features/alpha/storage.ts',
      "import '../../composition/persistence/state';\nexport const value = true;\n"
    ),
    write(
      context.root,
      'apps/extension/src/composition/persistence/foreign.ts',
      "import '../../background/a';\nexport const value = true;\n"
    ),
    write(
      context.root,
      'apps/extension/src/composition/persistence/settings-edge.ts',
      "import '../../settings/runtime';\nexport const value = true;\n"
    ),
    write(context.root, 'apps/extension/src/settings/runtime.ts'),
    write(
      context.root,
      'apps/extension/src/composition/persistence/sandbox-edge.ts',
      "import '../../effect-runtime-sandbox/runtime';\nexport const value = true;\n"
    ),
    write(context.root, 'apps/extension/src/effect-runtime-sandbox/runtime.ts'),
    write(context.root, 'apps/extension/src/ui/previews/example.ts'),
    write(context.root, 'apps/extension/src/features/index.ts')
  );
}

it('rejects app-core boundary, runtime, persistence and UI residency violations', () => {
  const context = fixture();
  addRuntimeViolationFixtures(context);
  addAppCoreViolationFixtures(context);

  expect(appCoreOwnerErrors(context)).toEqual(
    expect.arrayContaining([
      'broad app-core barrel remains: apps/extension/src/features/index.ts',
      expect.stringContaining('cross-feature deep import:'),
      expect.stringContaining('feature imports foreign concrete persistence:'),
      expect.stringContaining('persistence imports UI/runtime/workflow implementation:'),
      'persistence imports UI/runtime/workflow implementation: ' +
        'apps/extension/src/composition/persistence/settings-edge.ts -> ' +
        'apps/extension/src/settings/runtime.ts',
      'persistence imports UI/runtime/workflow implementation: ' +
        'apps/extension/src/composition/persistence/sandbox-edge.ts -> ' +
        'apps/extension/src/effect-runtime-sandbox/runtime.ts',
      'app-core imports runtime implementation: ' +
        'apps/extension/src/workflows/runtime-bridge.ts -> apps/extension/src/content/b.ts',
    ])
  );
});

it('rejects app-core owner tests that import runtime implementation', () => {
  const context = fixture();
  context.codeFiles.push(
    write(context.root, 'apps/extension/src/content/runtime.ts'),
    write(context.root, 'apps/extension/src/settings/runtime.ts'),
    write(
      context.root,
      'apps/extension/src/composition/persistence/state.test.ts',
      "import '../../settings/runtime';\nexport const value = true;\n"
    ),
    write(
      context.root,
      'apps/extension/src/ui/view.test.tsx',
      "import '../content/runtime';\nexport const value = true;\n"
    )
  );

  expect(appCoreOwnerErrors(context)).toEqual(
    expect.arrayContaining([
      'app-core owner test imports runtime implementation: ' +
        'apps/extension/src/composition/persistence/state.test.ts -> ' +
        'apps/extension/src/settings/runtime.ts',
      'app-core owner test imports runtime implementation: ' +
        'apps/extension/src/ui/view.test.tsx -> apps/extension/src/content/runtime.ts',
    ])
  );
});

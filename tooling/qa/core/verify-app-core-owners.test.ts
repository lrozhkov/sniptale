import { afterEach, expect, it } from 'vitest';

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  appCoreOwnerPolicyErrors,
  classifyFinalAppCoreOwnerPath,
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
  schemaVersion: 1,
  finalOwnerRules: [
    {
      ownerClass: 'persistence',
      ownerId: 'persistence.state',
      sourcePrefix: 'apps/extension/src/composition/persistence',
    },
    {
      ownerClass: 'feature',
      ownerId: 'feature.final',
      sourcePrefix: 'apps/extension/src/features',
    },
    {
      ownerClass: 'app-core',
      ownerId: 'app-core.view',
      sourcePrefix: 'apps/extension/src/ui',
    },
    {
      ownerClass: 'feature',
      ownerId: 'feature.final',
      sourcePrefix: 'apps/extension/src/platform',
    },
  ],
  authorityOwners: [
    {
      id: 'state',
      path: 'apps/extension/src/composition/persistence/state.ts',
      stateKind: 'authoritative-durable',
    },
  ],
  forbiddenSourcePrefixes: ['apps/extension/src/platform/old'],
  forbiddenOwnerEdges: [
    ['apps/extension/src/features', 'apps/extension/src/ui'],
    ['apps/extension/src/platform', 'apps/extension/src/features'],
  ],
  featurePublicEntrypoints: ['apps/extension/src/features/final.ts'],
  sameConcernPersistenceEdges: [],
  retainedAppUiRoots: ['apps/extension/src/ui'],
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
      'authority owner is missing: state',
      'forbidden app-core owner import: apps/extension/src/features/backedge.ts -> apps/extension/src/ui/view.ts',
      'retired owner path remains: apps/extension/src/platform/old',
      'unclassified app-core owner: apps/extension/src/composition/other.ts',
    ])
  );
});

it('rejects duplicate authority classification and ambiguous final owners', () => {
  const { policy } = fixture();
  policy.authorityOwners.push({ ...policy.authorityOwners[0] });
  expect(appCoreOwnerPolicyErrors(policy)).toEqual(['invalid app-core owner policy']);

  policy.authorityOwners.pop();
  policy.finalOwnerRules.push({ ...policy.finalOwnerRules[0], ownerId: 'duplicate' });
  expect(() =>
    classifyFinalAppCoreOwnerPath('apps/extension/src/composition/persistence/state.ts', policy)
  ).toThrow('unclassified final app-core owner');
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
      'preview/catalog UI remains app-local: apps/extension/src/ui/previews/example.ts',
      'sibling runtime import: apps/extension/src/background/a.ts -> apps/extension/src/content/b.ts',
      'sibling runtime import: apps/extension/src/camera-recorder/a.ts -> apps/extension/src/content/b.ts',
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

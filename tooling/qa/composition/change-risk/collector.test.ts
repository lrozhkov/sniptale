import { expect, it } from 'vitest';

import {
  createTempRoot,
  initGitRepo,
  runGit,
  withCwd,
  writeJson,
} from '../../test-support/test-helpers';
import { collectChangeRisks, resolveChangeRiskLevel } from './collector.mjs';

function commitFixture(root: string) {
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'fixture');
}

it('distinguishes manifest metadata from permission and runtime topology changes', async () => {
  const root = createTempRoot('change-risk-manifest-');
  const file = 'apps/extension/manifest.json';
  initGitRepo(root);
  writeJson(root, file, {
    manifest_version: 3,
    name: 'Before',
    permissions: ['storage'],
    background: { service_worker: 'background.js' },
  });
  commitFixture(root);

  writeJson(root, file, {
    manifest_version: 3,
    name: 'After',
    permissions: ['storage'],
    background: { service_worker: 'background.js' },
  });
  await withCwd(root, () => {
    expect(collectChangeRisks({ targetFiles: [file] })).toEqual([]);
  });

  writeJson(root, file, {
    manifest_version: 3,
    name: 'After',
    permissions: ['storage', 'scripting'],
    background: { service_worker: 'new-background.js' },
  });
  await withCwd(root, () => {
    expect(collectChangeRisks({ targetFiles: [file] }).map(({ id }) => id)).toEqual([
      'manifest.permissions',
      'manifest.runtime-topology',
    ]);
  });
});

it('separates persistence schema, mutation, and test-only files', () => {
  const files = [
    'apps/extension/src/composition/persistence/infrastructure/indexed-db/schema-contracts.ts',
    'apps/extension/src/composition/persistence/projects/index-mutations.ts',
    'apps/extension/src/composition/persistence/projects/index-mutations.test.ts',
  ];
  expect(collectChangeRisks({ targetFiles: files, mode: 'preflight' }).map(({ id }) => id)).toEqual(
    ['persistence.mutation', 'persistence.schema']
  );
});

it('classifies shared messaging contracts and authorization routes with stable evidence', () => {
  const files = [
    'apps/extension/src/background/runtime/routing/authorization/privileged-tab.ts',
    'apps/extension/src/contracts/messaging/contracts/runtime/background-ingress.data.ts',
    'packages/runtime-contracts/src/messaging/message-types/index.ts',
  ];
  const findings = collectChangeRisks({ targetFiles: files, mode: 'preflight' });

  expect(findings.map(({ id }) => id)).toEqual([
    'authorization',
    'ipc.route',
    'ipc.wire-contract',
    'runtime-contract.public',
  ]);
  expect(findings.find(({ id }) => id === 'authorization')?.reviews).toEqual(['security']);
  expect(findings.find(({ id }) => id === 'ipc.route')?.evidence).toEqual([
    {
      file: 'apps/extension/src/background/runtime/routing/authorization/privileged-tab.ts',
      detail: 'runtime route or binding owner',
    },
    {
      file: 'apps/extension/src/contracts/messaging/contracts/runtime/background-ingress.data.ts',
      detail: 'runtime route or binding owner',
    },
  ]);
});

it('does not classify unrelated UI handlers as IPC routes', () => {
  expect(
    collectChangeRisks({
      targetFiles: ['apps/extension/src/settings/sections/account/handler.ts'],
      mode: 'preflight',
    })
  ).toEqual([]);
});

it('classifies trusted event bridges as a security boundary with explicit proof', () => {
  const findings = collectChangeRisks({
    targetFiles: ['apps/extension/src/content/runtime/ui-activation-bridge/editable-keydown.ts'],
    mode: 'preflight',
  });

  expect(findings).toEqual([
    expect.objectContaining({
      id: 'trusted-event.bridge',
      reviews: ['security'],
      requirements: expect.arrayContaining([
        'Security review',
        'Trusted and untrusted event negative proof',
        'Registered-root boundary proof',
      ]),
    }),
  ]);
});

it('attaches deterministic requirements to every classified seam', () => {
  const findings = collectChangeRisks({
    targetFiles: [
      'apps/extension/manifest.json',
      'apps/extension/src/composition/persistence/projects/index-mutations.ts',
      'packages/runtime-contracts/src/messaging/message-types/index.ts',
    ],
    mode: 'preflight',
  });

  expect(findings.every((finding) => finding.requirements.length > 0)).toBe(true);
  expect(findings.find(({ id }) => id === 'persistence.mutation')?.requirements).toContain(
    'Durable mutation failure and rollback proof'
  );
  expect(findings.find(({ id }) => id === 'runtime-contract.public')?.requirements).toContain(
    'Transitive consumer graph check'
  );
});

it('keeps preflight conservative for the manifest while attaching security guidance', () => {
  const findings = collectChangeRisks({
    targetFiles: ['apps/extension/manifest.json'],
    mode: 'preflight',
  });
  expect(findings.map(({ id }) => id)).toEqual([
    'manifest.permissions',
    'manifest.runtime-topology',
  ]);
  expect(findings[0]?.docs).toContain('docs/security/manifest-permissions.md');
});

it('does not assign a risk level when no classified seam is detected', () => {
  expect(resolveChangeRiskLevel([])).toBeNull();
});

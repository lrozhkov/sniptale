import { expect, it, vi } from 'vitest';

import { runBuild } from './build-step.mjs';
import {
  appendReleaseArchiveStepOrBlock,
  collectBuildStep,
  collectDeadExportsStep,
  collectReleaseArchiveStep,
} from './verify-closeout-step-helpers.mjs';

it('passes release mode only to release wrapper build contexts', async () => {
  const buildRunner = vi.fn(async () => ({
    status: 0,
    stderr: '',
    stdout: '',
  }));

  await collectBuildStep({ buildRunner, releaseMode: true });
  await collectBuildStep({ buildRunner, releaseMode: false });

  expect(buildRunner).toHaveBeenNthCalledWith(1, {
    enforceLint: false,
    mode: 'release',
  });
  expect(buildRunner).toHaveBeenNthCalledWith(2, {
    enforceLint: false,
    mode: undefined,
  });
});

it('runs root/app equivalence for extension build-layout changes', async () => {
  const buildRunner = vi.fn();
  const equivalenceRunner = vi.fn(async () => ({ status: 0, stderr: '', stdout: '' }));

  await collectBuildStep({
    buildRunner,
    equivalenceRunner,
    targetFiles: ['apps/extension/vite.config.ts'],
  });

  expect(equivalenceRunner).toHaveBeenCalledWith({ mode: 'release' });
  expect(buildRunner).not.toHaveBeenCalled();
});

it.each(['apps/extension/postcss.config.js', 'apps/extension/tailwind.config.js'])(
  'runs root/app equivalence for %s',
  async (targetFile) => {
    const buildRunner = vi.fn();
    const equivalenceRunner = vi.fn(async () => ({ status: 0, stderr: '', stdout: '' }));

    await collectBuildStep({ buildRunner, equivalenceRunner, targetFiles: [targetFile] });

    expect(equivalenceRunner).toHaveBeenCalledWith({ mode: 'release' });
    expect(buildRunner).not.toHaveBeenCalled();
  }
);

it('forwards build mode to the underlying Vite build runner', async () => {
  const buildRunner = vi.fn(() => ({
    status: 0,
    stderr: '',
    stdout: '',
  }));

  await runBuild({ buildRunner, enforceLint: false, mode: 'release' });

  expect(buildRunner).toHaveBeenCalledWith({
    cwd: undefined,
    mode: 'release',
  });
});

it('prints concrete dead-export entries in wrapper failure output', () => {
  const step = collectDeadExportsStep({
    deadExportsRunner: () => ({
      unusedTypeExports: [
        {
          exportName: 'UnusedShape',
          file: 'src/example.ts',
          kind: 'InterfaceDeclaration',
        },
      ],
      unusedValueExports: [
        {
          exportName: 'unusedValue',
          file: 'src/example.ts',
          kind: 'VariableDeclaration',
        },
      ],
    }),
  });

  expect(step).toEqual(
    expect.objectContaining({
      label: 'Dead exports',
      status: 'failed',
      stderr: expect.stringContaining('src/example.ts :: unusedValue (VariableDeclaration)'),
    })
  );
  expect(step.stderr).toContain('src/example.ts :: UnusedShape (InterfaceDeclaration)');
  expect(step.stderr).toContain('Dead exports report completed (1 value, 1 type)');
});

it('wraps release archive packaging as a process step', async () => {
  const archiveRunner = vi.fn(async () => ({
    status: 0,
    stderr: '',
    stdout: 'Release archive: /repo/build/sniptale.zip\n',
  }));

  const step = await collectReleaseArchiveStep({ archiveRunner });

  expect(step).toEqual(
    expect.objectContaining({
      detail: 'Release archive: /repo/build/sniptale.zip',
      label: 'Release archive',
      status: 'ok',
    })
  );
});

it('blocks archive packaging when the release build did not pass', async () => {
  const collectors = {
    collectReleaseArchiveStep: vi.fn(),
  };
  const steps = [{ label: 'Build', status: 'blocked', detail: 'earlier failures' }];

  await appendReleaseArchiveStepOrBlock(steps, collectors);

  expect(steps.at(-1)).toEqual({
    detail: 'release build did not complete',
    label: 'Release archive',
    status: 'blocked',
  });
  expect(collectors.collectReleaseArchiveStep).not.toHaveBeenCalled();
});

import { expect, it } from 'vitest';

import {
  createTempRoot,
  importFresh,
  initGitRepo,
  runGit,
  withCwd,
  writeFile,
} from './test-helpers';
import { collectDomainFixtureRealismViolations } from './verify-domain-fixture-realism.mjs';

function rules(violations: { rule: string }[]) {
  return violations.map((violation) => violation.rule);
}

it('blocks broad casts in valid domain test fixtures', () => {
  const root = createTempRoot('domain-fixture-realism-');
  const bad = writeFile(
    root,
    'apps/extension/src/workflows/media-hub-backup/restore/index.test.ts',
    'it("restores video project", () => ({ id: "project-1" } as never));\n'
  );

  expect(rules(collectDomainFixtureRealismViolations([bad]))).toContain('domain-fixture-realism');
});

it('allows explicit malformed boundary fixtures', () => {
  const root = createTempRoot('domain-fixture-realism-invalid-');
  const malformed = writeFile(
    root,
    'apps/extension/src/workflows/media-hub-backup/restore/boundary-invalid.test.ts',
    'it("rejects malformed video project", () => ({ id: "bad" } as never));\n'
  );

  expect(collectDomainFixtureRealismViolations([malformed])).toEqual([]);
});

it('keeps malformed intent local inside mixed fixture files', () => {
  const root = createTempRoot('domain-fixture-realism-mixed-');
  const mixed = writeFile(
    root,
    'apps/extension/src/workflows/media-hub-backup/restore/index.test.ts',
    [
      'it("rejects malformed video project", () => {',
      '  return { id: "bad" } as never;',
      '});',
      'it("restores video project", () => {',
      '  return { id: "project-1" } as never;',
      '});',
      '',
    ].join('\n')
  );

  expect(rules(collectDomainFixtureRealismViolations([mixed]))).toEqual(['domain-fixture-realism']);
});

it('allows builder-backed valid fixtures', () => {
  const root = createTempRoot('domain-fixture-realism-builder-');
  const good = writeFile(
    root,
    'apps/extension/src/workflows/media-hub-backup/restore/index.test.ts',
    'it("restores video project", () => createVideoProjectEntry({ id: "project-1" }));\n'
  );

  expect(collectDomainFixtureRealismViolations([good])).toEqual([]);
});

it('does not rescan existing fixture casts for import-only test diffs', async () => {
  const root = createTempRoot('domain-fixture-realism-import-only-');
  initGitRepo(root);
  writeFile(
    root,
    'apps/extension/src/video-editor/project/state.test.ts',
    [
      "import type { VideoProject } from '../../shared/video-types';",
      '',
      'it("uses a legacy fixture", () => ({ id: "project-1" } as VideoProject));',
      '',
    ].join('\n')
  );
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'baseline');
  writeFile(
    root,
    'apps/extension/src/video-editor/project/state.test.ts',
    [
      "import type { VideoProject } from '../../shared/video-project/types';",
      '',
      'it("uses a legacy fixture", () => ({ id: "project-1" } as VideoProject));',
      '',
    ].join('\n')
  );

  const result = await withCwd(root, async () => {
    const module = await importFresh<typeof import('./verify-domain-fixture-realism.mjs')>(
      './verify-domain-fixture-realism.mjs',
      import.meta.url
    );
    return module.runDomainFixtureRealismCheck({
      files: ['apps/extension/src/video-editor/project/state.test.ts'],
    });
  });

  expect(result).toEqual({
    files: [],
    skipped: true,
    violations: [],
  });
});

it('does not rescan existing fixture casts for import-and-mock-only test diffs', async () => {
  const root = createTempRoot('domain-fixture-realism-mock-only-');
  initGitRepo(root);
  writeFile(
    root,
    'apps/extension/src/video-editor/project/state.test.ts',
    [
      "import type { VideoProject } from '../../shared/video-types';",
      "vi.mock('../../shared/video-project/project/defaults', () => ({ getAssetById: vi.fn() }));",
      '',
      'it("uses a legacy fixture", () => ({ id: "project-1" } as VideoProject));',
      '',
    ].join('\n')
  );
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'baseline');
  writeFile(
    root,
    'apps/extension/src/video-editor/project/state.test.ts',
    [
      "import type { VideoProject } from '../../shared/video-project/types';",
      "vi.mock('../../shared/video-project/timeline', () => ({ getAssetById: vi.fn() }));",
      '',
      'it("uses a legacy fixture", () => ({ id: "project-1" } as VideoProject));',
      '',
    ].join('\n')
  );

  const result = await withCwd(root, async () => {
    const module = await importFresh<typeof import('./verify-domain-fixture-realism.mjs')>(
      './verify-domain-fixture-realism.mjs',
      import.meta.url
    );
    return module.runDomainFixtureRealismCheck({
      files: ['apps/extension/src/video-editor/project/state.test.ts'],
    });
  });

  expect(result).toEqual({
    files: [],
    skipped: true,
    violations: [],
  });
});

it('does not report existing fixture casts outside changed lines', async () => {
  const root = createTempRoot('domain-fixture-realism-changed-lines-');
  initGitRepo(root);
  writeFile(
    root,
    'apps/extension/src/video-editor/project/state.test.ts',
    [
      "vi.mock('../../shared/video-project/project/defaults', () => ({ getAssetById: vi.fn() }));",
      '',
      'it("uses a legacy fixture", () => ({ id: "project-1" } as VideoProject));',
      '',
    ].join('\n')
  );
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'baseline');
  writeFile(
    root,
    'apps/extension/src/video-editor/project/state.test.ts',
    [
      "vi.mock('../../shared/video-project/timeline', () => ({ getAssetById: vi.fn() }));",
      '// local mock path migrated',
      'it("uses a legacy fixture", () => ({ id: "project-1" } as VideoProject));',
      '',
    ].join('\n')
  );

  const result = await withCwd(root, async () => {
    const module = await importFresh<typeof import('./verify-domain-fixture-realism.mjs')>(
      './verify-domain-fixture-realism.mjs',
      import.meta.url
    );
    return module.runDomainFixtureRealismCheck({
      files: [],
      scope: 'workspace',
    });
  });

  expect(result).toEqual({
    files: ['apps/extension/src/video-editor/project/state.test.ts'],
    skipped: false,
    violations: [],
  });
});

it('does not report an existing cast when only fixture fields are renamed', async () => {
  const root = createTempRoot('domain-fixture-realism-renamed-field-');
  initGitRepo(root);
  const file = 'apps/extension/src/video-editor/project/state.test.ts';
  writeFile(root, file, 'it("uses fixture", () => ({ previousId: "p-1" } as VideoProject));\n');
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'baseline');
  writeFile(root, file, 'it("uses fixture", () => ({ currentId: "p-1" } as VideoProject));\n');

  const result = await withCwd(root, async () => {
    const module = await importFresh<typeof import('./verify-domain-fixture-realism.mjs')>(
      './verify-domain-fixture-realism.mjs',
      import.meta.url
    );
    return module.runDomainFixtureRealismCheck({ files: [file], scope: 'workspace' });
  });

  expect(result.violations).toEqual([]);
});

it('reports only the net increase in valid fixture casts', async () => {
  const root = createTempRoot('domain-fixture-realism-net-new-');
  initGitRepo(root);
  const file = 'apps/extension/src/video-editor/project/state.test.ts';
  writeFile(root, file, 'it("uses fixture", () => ({ id: "p-1" } as VideoProject));\n');
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'baseline');
  writeFile(
    root,
    file,
    [
      'it("uses fixture", () => ({ currentId: "p-1" } as VideoProject));',
      'it("uses another fixture", () => ({ id: "p-2" } as VideoProject));',
      '',
    ].join('\n')
  );

  const result = await withCwd(root, async () => {
    const module = await importFresh<typeof import('./verify-domain-fixture-realism.mjs')>(
      './verify-domain-fixture-realism.mjs',
      import.meta.url
    );
    return module.runDomainFixtureRealismCheck({ files: [file], scope: 'workspace' });
  });

  expect(result.violations).toHaveLength(1);
});

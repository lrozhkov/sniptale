import { afterEach, expect, it } from 'vitest';

import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { targetOnlyPathErrors } from './verify-target-only-paths.mjs';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

function write(root: string, path: string, source = '') {
  const output = join(root, path);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, source);
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'target-only-paths-'));
  roots.push(root);
  write(
    root,
    'tooling/configs/qa/target-only-paths.data.json',
    JSON.stringify({
      schemaVersion: 2,
      physicalRetiredRoots: ['src', 'public'],
      retiredRootFiles: ['vite.config.ts'],
      retiredControlPrefixes: ['tooling/qa/policy/migration-move-'],
      retiredControls: [
        { path: 'tooling/configs/qa/migration-owner-map.data.json', action: 'remove' },
      ],
      effectV1RetiredPaths: [],
      effectV1RetiredPathsSha256:
        '01ba4719c80b6fe911b091a7c05124b64eeece964e09c058ef8f9805daca546b',
      requiredTargets: ['apps/extension/src/background/index.ts'],
    })
  );
  write(root, '.prettierignore', '*.md\n');
  write(root, 'README.md', '# Repository\n');
  write(root, 'docs/README.md', '# Docs\n\n## Documentation policy\n');
  write(
    root,
    'tooling/configs/qa/docs-topology.data.json',
    JSON.stringify({
      schemaVersion: 2,
      activeIndex: 'docs/README.md',
      activeDocuments: [],
      generatedDocuments: [],
      rootDocuments: ['README.md'],
      skillDocuments: [],
      productDocuments: [],
      requiredIndexContractFragments: ['## Documentation policy'],
      retiredActivePrefixes: ['docs/deprecated/', 'docs/migrations/', 'docs/research/'],
      retiredActivePaths: ['docs/tooling/old.md'],
      forbiddenActiveFragments: ['OSS Transformation Program'],
    })
  );
  write(root, 'apps/extension/src/background/index.ts', 'export {};\n');
  return root;
}

function readDocsPolicy(root: string) {
  return JSON.parse(readFileSync(join(root, 'tooling/configs/qa/docs-topology.data.json'), 'utf8'));
}

function writeDocsPolicy(root: string, policy: object) {
  write(root, 'tooling/configs/qa/docs-topology.data.json', JSON.stringify(policy));
}

it('accepts a target-only tree and retained negative fixture text', () => {
  const root = fixture();
  write(
    root,
    'tooling/qa/core/example.test.ts',
    'const fixture = "import \'../../../../src/shared/types\'";\n'
  );

  expect(targetOnlyPathErrors(root)).toEqual([]);
});

it('accepts exact legacy paths only in tracked historical control records', () => {
  const root = fixture();
  write(
    root,
    'tooling/configs/qa/gitleaks-baseline.json',
    '[{"File":"src/shared/security/secret-redaction.test.ts"}]\n'
  );
  write(
    root,
    'tooling/configs/qa/technical-debt.data.json',
    '{"scope":{"file":"src/shared/security/secret-redaction.test.ts"}}\n'
  );

  expect(targetOnlyPathErrors(root)).toEqual([]);
});

it('rejects retired roots, controls and active path literals', () => {
  const root = fixture();
  write(root, 'src/background/index.ts', 'export {};\n');
  write(root, 'vite.config.ts', 'export {};\n');
  write(root, 'tooling/configs/qa/migration-owner-map.data.json', '{}\n');
  write(root, 'tooling/qa/policy/migration-move-old.mjs', 'export {};\n');
  write(
    root,
    'docs/engineering/live.md',
    [
      'Import from src/content/index.ts.',
      'Load src/manifest.json.',
      'Run tooling/qa/policy/migration-move-manifest.mjs.',
    ].join('\n')
  );

  expect(targetOnlyPathErrors(root)).toEqual(
    expect.arrayContaining([
      'active legacy path reference: docs/engineering/live.md:1 -> src/content',
      'active legacy path reference: docs/engineering/live.md:2 -> src/manifest.json',
      'active legacy path reference: docs/engineering/live.md:3 -> ' +
        'tooling/qa/policy/migration-move-manifest.mjs',
      'retired migration control remains: tooling/configs/qa/migration-owner-map.data.json',
      'retired root path remains: src',
      'retired root path remains: vite.config.ts',
    ])
  );
  expect(targetOnlyPathErrors(root)).toContain(
    'retired migration control prefix remains: tooling/qa/policy/migration-move-'
  );
});

it('rejects a dangling physical-root symlink', () => {
  const root = fixture();
  symlinkSync('missing-target', join(root, 'public'));

  expect(targetOnlyPathErrors(root)).toContain('retired root path remains: public');
});

it('rejects stale imports and mocks even inside tests', () => {
  const root = fixture();
  write(
    root,
    'apps/extension/src/background/stale.test.ts',
    "import '../../../../src/shared/types';\nvi.mock('../../../../src/content/runtime');\n"
  );

  expect(targetOnlyPathErrors(root)).toEqual(
    expect.arrayContaining([
      expect.stringContaining('stale module path: apps/extension/src/background/stale.test.ts'),
    ])
  );
});

it('rejects retired Engine1 physical owners and active source references', () => {
  const root = fixture();
  const policy = JSON.parse(
    readFileSync(join(root, 'tooling/configs/qa/target-only-paths.data.json'), 'utf8')
  );
  policy.physicalRetiredRoots.push('apps/extension/src/package-renderer-sandbox');
  write(root, 'tooling/configs/qa/target-only-paths.data.json', JSON.stringify(policy));
  write(root, 'apps/extension/src/package-renderer-sandbox/index.ts', 'export {};\n');
  write(
    root,
    'apps/extension/src/background/stale-engine1.ts',
    "import 'apps/extension/src/features/video/project/video-pack/runtime';\n"
  );

  expect(targetOnlyPathErrors(root)).toEqual(
    expect.arrayContaining([
      'retired root path remains: apps/extension/src/package-renderer-sandbox',
      expect.stringContaining('active legacy path reference'),
    ])
  );
});

it('rejects dynamic, require, alias, source-reading, config, CSS and JSON legacy paths', () => {
  const root = fixture();
  write(
    root,
    'apps/extension/src/background/stale-paths.ts',
    [
      "void import('../../../../src/content/runtime');",
      "require('../../../../src/shared/types');",
      "new URL('../../../../src/background/worker.ts', import.meta.url);",
    ].join('\n')
  );
  write(root, 'tsconfig.json', '{"paths":{"@old/*":["src/features/*"]}}\n');
  write(root, 'apps/extension/src/popup/stale.css', 'url("../../../../public/icons/icon.svg");\n');
  write(root, 'apps/extension/build/stale.json', '{"input":"src/popup/index.html"}\n');
  write(
    root,
    'tooling/qa/core/stale-source-reader.test.ts',
    "readFileSync(new URL('../../../src/content/runtime.ts', import.meta.url), 'utf8');\n"
  );

  expect(targetOnlyPathErrors(root)).toEqual(
    expect.arrayContaining([
      expect.stringContaining('stale module path: apps/extension/src/background/stale-paths.ts'),
      'active legacy path reference: apps/extension/build/stale.json:1 -> src/popup',
      'active legacy path reference: apps/extension/src/popup/stale.css:1 -> public/icons',
      'active legacy path reference: tsconfig.json:1 -> src/features',
      expect.stringContaining(
        'stale source-reading path: tooling/qa/core/stale-source-reader.test.ts'
      ),
    ])
  );
});

it('rejects unclassified, dangling, retired, clone-specific and extra-index documentation', () => {
  const root = fixture();
  write(
    root,
    'docs/README.md',
    [
      '[missing](missing.md)',
      'See docs/deprecated/history.md.',
      '[clone](C:\\Users\\person\\sniptale\\AGENTS.md)',
      '[reference][owner]',
      '[owner]: architecture/owner.md',
      'OSS Transformation Program',
    ].join('\n')
  );
  write(root, 'docs/architecture/README.md', '# Extra index\n');
  write(root, 'docs/architecture/owner.md', '# Owner\n');
  write(root, 'docs/unclassified.md', '# Unclassified\n');
  const policy = readDocsPolicy(root);
  policy.activeDocuments.push('docs/architecture/README.md', 'docs/architecture/owner.md');
  writeDocsPolicy(root, policy);

  expect(targetOnlyPathErrors(root)).toEqual(
    expect.arrayContaining([
      'active document is missing from docs/README.md: docs/architecture/owner.md',
      'clone-specific repository path: docs/README.md',
      'dangling Markdown link: docs/README.md -> missing.md',
      'docs must have exactly one active index',
      'reference-style Markdown link is not allowed: docs/README.md:5',
      'retired documentation authority in docs/README.md: docs/deprecated/',
      'retired documentation authority in docs/README.md: OSS Transformation Program',
      'unclassified documentation: docs/unclassified.md',
    ])
  );
});

it('rejects retired documentation trees and Markdown formatter admission', () => {
  const root = fixture();
  write(root, 'docs/deprecated/history.md', '# Historical\n');
  write(root, 'docs/research/notes.md', '# Research\n');
  write(root, 'docs/migrations/plan.md', '# Migration\n');
  write(root, '.prettierignore', 'src/**\n');

  expect(targetOnlyPathErrors(root)).toEqual(
    expect.arrayContaining([
      'retired active documentation prefix remains: docs/deprecated/',
      'retired active documentation prefix remains: docs/migrations/',
      'retired active documentation prefix remains: docs/research/',
      'Markdown must remain excluded from formatting',
    ])
  );
});

it('rejects restoration of the retired documentation archive policy', () => {
  const root = fixture();
  const policy = readDocsPolicy(root);
  policy.archiveIndex = 'docs/deprecated/README.md';
  writeDocsPolicy(root, policy);

  expect(() => targetOnlyPathErrors(root)).toThrow('invalid docs topology policy');
});

it('rejects removal of the documentation index contract', () => {
  const root = fixture();
  write(root, 'docs/README.md', '# Docs\n');

  expect(targetOnlyPathErrors(root)).toContain(
    'documentation index contract is incomplete: ## Documentation policy'
  );
});

it('rejects hard-wrapped prose in authored and generated Markdown', () => {
  const root = fixture();
  write(root, 'docs/current.md', '# Current\n\nFirst physical line\nsecond physical line\n');
  write(root, 'docs/generated.md', '# Generated\n\nGenerated first line\ngenerated second line\n');
  write(root, 'NOTICE', 'First notice line\nsecond notice line\n');
  write(root, 'docs/README.md', '# Docs\n\n- [Current](current.md)\n- [Generated](generated.md)\n');
  const policy = readDocsPolicy(root);
  policy.activeDocuments.push('docs/current.md');
  policy.generatedDocuments.push('docs/generated.md');
  writeDocsPolicy(root, policy);

  expect(targetOnlyPathErrors(root)).toEqual(
    expect.arrayContaining([
      'documentation uses a hard-wrapped paragraph: NOTICE:2',
      'documentation uses a hard-wrapped paragraph: docs/current.md:4',
      'documentation uses a hard-wrapped paragraph: docs/generated.md:4',
    ])
  );
});

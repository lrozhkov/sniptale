import fs from 'node:fs';

import { expect, it, vi } from 'vitest';

import {
  TYPECHECK_CHECKERS,
  resolveCanonicalTypeScriptEntry,
  resolveDiagnosticTypeScript6Entry,
  resolveTypeScriptCliEntry,
  runCanonicalTypeScriptCli,
} from './typescript-cli.mjs';

it('resolves the canonical TS7 package entry without a bare-bin authority', () => {
  const existsSync = vi.fn(() => true);

  expect(resolveCanonicalTypeScriptEntry({ cwd: '/repo', existsSync, platform: 'linux' })).toBe(
    '/repo/node_modules/@typescript/native/bin/tsc'
  );
  expect(existsSync).toHaveBeenCalledWith('/repo/node_modules/@typescript/native/bin/tsc');
});

it('resolves the same canonical package identity on Windows', () => {
  expect(
    resolveCanonicalTypeScriptEntry({
      cwd: 'C:\\repo',
      existsSync: () => true,
      platform: 'win32',
    })
  ).toBe('C:\\repo\\node_modules\\@typescript\\native\\bin\\tsc');
});

it('keeps TS6 on an explicitly diagnostic-only entry', () => {
  expect(
    resolveDiagnosticTypeScript6Entry({ cwd: '/repo', existsSync: () => true, platform: 'linux' })
  ).toBe('/repo/node_modules/typescript/bin/tsc6');
});

it('fails closed when the locked canonical entry is absent', () => {
  expect(() =>
    resolveCanonicalTypeScriptEntry({ cwd: '/repo', existsSync: () => false, platform: 'linux' })
  ).toThrow('run npm ci with the locked toolchain');
  expect(() =>
    resolveTypeScriptCliEntry({
      cwd: '/repo',
      existsSync: () => true,
      kind: 'legacy',
      platform: 'linux',
    })
  ).toThrow('Unsupported TypeScript CLI kind');
});

it('runs workspace typechecks through the exact TS7 launcher with fixed checkers', () => {
  const spawnSyncImpl = vi.fn(() => ({ status: 0 }));

  expect(
    runCanonicalTypeScriptCli(['--noEmit', '--project', 'tsconfig.json'], {
      cwd: '/repo/packages/ui',
      existsSync: () => true,
      repositoryRoot: '/repo',
      spawnSyncImpl,
    })
  ).toBe(0);
  expect(TYPECHECK_CHECKERS.full).toBe(4);
  expect(spawnSyncImpl).toHaveBeenCalledWith(
    process.execPath,
    [
      '/repo/node_modules/@typescript/native/bin/tsc',
      '--checkers',
      '4',
      '--noEmit',
      '--project',
      'tsconfig.json',
    ],
    { cwd: '/repo/packages/ui', stdio: 'inherit' }
  );
});

it('routes every package typecheck script through the exact CLI owner', () => {
  const workspaceManifests = [
    'packages/foundation/package.json',
    'packages/platform/package.json',
    'packages/runtime-contracts/package.json',
    'packages/ui/package.json',
  ];
  const expectedCommand =
    'node ../../tooling/qa/core/typescript-cli.mjs --noEmit --project tsconfig.json';

  for (const manifestPath of workspaceManifests) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      scripts?: Record<string, string>;
    };
    expect(manifest.scripts?.typecheck, manifestPath).toBe(expectedCommand);
    expect(Object.values(manifest.scripts ?? {}).join('\n'), manifestPath).not.toMatch(
      /(^|\s)tsc6?(?:\s|$)/u
    );
  }
});

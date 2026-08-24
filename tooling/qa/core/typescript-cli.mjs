import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { isExecutedAsScript } from './shared.mjs';

const CLI_ENTRIES = Object.freeze({
  canonical: 'node_modules/@typescript/native/bin/tsc',
  diagnostic: 'node_modules/typescript/bin/tsc6',
});
export const TYPECHECK_CHECKERS = Object.freeze({ affected: 2, full: 4 });
export const TYPESCRIPT_TOOLCHAIN_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const TYPESCRIPT_TOOL_VERSION = JSON.parse(
  fs.readFileSync(
    path.join(TYPESCRIPT_TOOLCHAIN_ROOT, 'node_modules/@typescript/native/package.json'),
    'utf8'
  )
).version;

function selectPathApi(platform) {
  return platform === 'win32' ? path.win32 : path.posix;
}

export function resolveTypeScriptCliEntry({
  cwd = process.cwd(),
  existsSync = fs.existsSync,
  kind = 'canonical',
  platform = process.platform,
} = {}) {
  const relativeEntry = CLI_ENTRIES[kind];
  if (!relativeEntry) throw new Error(`Unsupported TypeScript CLI kind: ${kind}.`);

  const pathApi = selectPathApi(platform);
  const entryPath = pathApi.resolve(cwd, ...relativeEntry.split('/'));
  if (!existsSync(entryPath)) {
    throw new Error(
      `TypeScript ${kind} CLI is unavailable at ${entryPath}; run npm ci with the locked toolchain.`
    );
  }
  return entryPath;
}

export function resolveCanonicalTypeScriptEntry(options = {}) {
  return resolveTypeScriptCliEntry({ ...options, kind: 'canonical' });
}

export function resolveDiagnosticTypeScript6Entry(options = {}) {
  return resolveTypeScriptCliEntry({ ...options, kind: 'diagnostic' });
}

export function runCanonicalTypeScriptCli(
  args,
  {
    cwd = process.cwd(),
    existsSync = fs.existsSync,
    repositoryRoot = TYPESCRIPT_TOOLCHAIN_ROOT,
    spawnSyncImpl = spawnSync,
  } = {}
) {
  const result = spawnSyncImpl(
    process.execPath,
    [
      resolveCanonicalTypeScriptEntry({ cwd: repositoryRoot, existsSync }),
      '--checkers',
      String(TYPECHECK_CHECKERS.full),
      ...args,
    ],
    { cwd, stdio: 'inherit' }
  );
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (isExecutedAsScript(import.meta.url)) {
  process.exitCode = runCanonicalTypeScriptCli(process.argv.slice(2));
}

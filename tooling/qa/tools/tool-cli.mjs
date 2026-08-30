import fs from 'node:fs';
import path from 'node:path';

import { fromRelativePath, repoRoot } from '../analysis/repository/shared-paths.mjs';
import { runCommand } from '../runtime/process/shared-process.mjs';
import { executeAuditCommand } from '../audits/contracts/execution-error.mjs';

function resolveNodeBin(name) {
  const suffix = process.platform === 'win32' ? '.cmd' : '';
  const executable = fromRelativePath(`node_modules/.bin/${name}${suffix}`);
  return fs.existsSync(executable) ? executable : null;
}

function resolvePathExecutable(name, environment = process.env) {
  const pathEntries = (environment.PATH ?? '').split(path.delimiter).filter(Boolean);
  const suffixes =
    process.platform === 'win32'
      ? (environment.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
      : [''];

  for (const entry of pathEntries) {
    for (const suffix of suffixes) {
      const executable = path.join(entry, process.platform === 'win32' ? `${name}${suffix}` : name);
      if (fs.existsSync(executable)) {
        return executable;
      }
    }
  }

  return null;
}

export function resolveAstGrepExecutable() {
  return resolveNodeBin('ast-grep');
}

export function resolveKnipExecutable() {
  return resolveNodeBin('knip');
}

export function resolveCodeqlExecutable() {
  if (process.env.SNIPTALE_CODEQL_BIN) {
    return process.env.SNIPTALE_CODEQL_BIN;
  }

  return resolvePathExecutable('codeql');
}

export function resolveOsvScannerExecutable() {
  if (process.env.SNIPTALE_OSV_SCANNER_BIN) {
    return process.env.SNIPTALE_OSV_SCANNER_BIN;
  }

  return resolvePathExecutable('osv-scanner');
}

export function resolveGitleaksExecutable() {
  if (process.env.SNIPTALE_GITLEAKS_BIN) {
    return process.env.SNIPTALE_GITLEAKS_BIN;
  }

  return resolvePathExecutable('gitleaks');
}

export function parseToolJson(stdout, emptyValue) {
  const text = stdout.trim();
  if (text.length === 0) {
    return emptyValue;
  }

  return JSON.parse(text);
}

export function runToolCommand(command, args, options = {}, runCommandImpl = runCommand) {
  return executeAuditCommand(
    () =>
      runCommandImpl(command, args, {
        cwd: options.cwd ?? repoRoot,
        env: options.env ?? {},
        killSignal: options.killSignal,
        stdio: options.stdio ?? 'pipe',
        timeout: options.timeout,
      }),
    { tool: path.basename(command) }
  );
}

import fs from 'node:fs';
import path from 'node:path';

import { fromRelativePath, repoRoot, runCommand } from '../core/shared.mjs';
import { executeAuditCommand } from '../audits/execution-error.mjs';

const SEMGREP_SETTINGS_PATH = fromRelativePath('.tmp/semgrep/settings.yml');
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

export function resolveJscpdExecutable() {
  return resolveNodeBin('jscpd');
}

function collectSanitizedProxyOverrides(environment = process.env) {
  const overrides = {};
  for (const key of [
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
    'http_proxy',
    'https_proxy',
    'all_proxy',
    'NO_PROXY',
    'no_proxy',
  ]) {
    if (typeof environment[key] === 'string' && environment[key].trim().length === 0) {
      overrides[key] = null;
    }
  }

  return overrides;
}

export function resolveSemgrepCommand({ environment = process.env } = {}) {
  const env = {
    ...collectSanitizedProxyOverrides(environment),
    SEMGREP_ENABLE_VERSION_CHECK: '0',
    SEMGREP_APP_TOKEN: null,
    SEMGREP_SEND_METRICS: 'off',
    SEMGREP_SETTINGS_FILE: SEMGREP_SETTINGS_PATH,
  };
  if (environment.SNIPTALE_SEMGREP_BIN) {
    return {
      command: environment.SNIPTALE_SEMGREP_BIN,
      args: [],
      env,
    };
  }

  const executable = resolvePathExecutable('semgrep', environment);
  if (executable) {
    return {
      command: executable,
      args: [],
      env,
    };
  }

  return null;
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
        stdio: options.stdio ?? 'pipe',
      }),
    { tool: path.basename(command) }
  );
}

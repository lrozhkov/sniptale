import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { mutationProfiles } from './profiles.mjs';

const profileName = process.argv[2];
const runLabel = process.argv[3] ?? 'current';
if (!(profileName in mutationProfiles)) {
  throw new Error(`Unknown mutation profile: ${String(profileName)}`);
}
if (!/^[a-z0-9-]+$/u.test(runLabel)) {
  throw new Error(`Invalid mutation run label: ${runLabel}`);
}

const outputDir = resolve('.tmp/mutation', profileName, runLabel);
const resultFile = resolve(outputDir, 'stryker-report.json');
const summaryFile = resolve(outputDir, 'summary.json');
mkdirSync(dirname(resultFile), { recursive: true });
rmSync(resultFile, { force: true });
rmSync(summaryFile, { force: true });

const startedAt = new Date().toISOString();
const started = performance.now();
const cli = process.env.SNIPTALE_MUTATION_CLI
  ? resolve(process.env.SNIPTALE_MUTATION_CLI)
  : resolve('tooling/test/mutation/node_modules/@stryker-mutator/core/bin/stryker.js');
const config = resolve('tooling/test/mutation/stryker.config.mjs');

if (!existsSync(cli)) {
  const displayPath = process.env.SNIPTALE_MUTATION_CLI
    ? '<configured-path>'
    : 'tooling/test/mutation/node_modules/@stryker-mutator/core/bin/stryker.js';
  process.stderr.write(`Mutation CLI is unavailable at ${displayPath}\n`);
  process.exitCode = 1;
} else {
  const result = spawnSync(process.execPath, [cli, 'run', config], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SNIPTALE_MUTATION_PROFILE: profileName,
      SNIPTALE_MUTATION_RESULT_FILE: resultFile,
      SNIPTALE_MUTATION_RUN_LABEL: runLabel,
    },
    stdio: ['inherit', 'pipe', 'pipe'],
  });
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');

  const elapsedMs = Math.round(performance.now() - started);
  let mutationScore = null;
  const counts = {
    error: 0,
    ignored: 0,
    killed: 0,
    noCoverage: 0,
    survived: 0,
    timeout: 0,
    total: 0,
  };
  if (result.status === 0) {
    if (!existsSync(resultFile)) {
      process.stderr.write('Mutation report is missing after a successful runner exit.\n');
    } else {
      const report = JSON.parse(readFileSync(resultFile, 'utf8'));
      for (const file of Object.values(report.files ?? {})) {
        for (const mutant of file.mutants ?? []) {
          counts.total += 1;
          const key = statusKey(mutant.status);
          if (key) counts[key] += 1;
        }
      }
      const scored = counts.total - counts.ignored;
      const detected = counts.killed + counts.timeout + counts.error;
      mutationScore = scored === 0 ? 100 : Number(((detected / scored) * 100).toFixed(2));
    }
  }

  const reportMissing = result.status === 0 && !existsSync(resultFile);

  const summary = {
    completedAt: new Date().toISOString(),
    counts,
    elapsedMs,
    exitCode: reportMissing ? 1 : result.status,
    mutationScore,
    profile: profileName,
    runLabel,
    startedAt,
  };
  writeFileSync(summaryFile, `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(`Mutation summary: ${summaryFile}\n${JSON.stringify(summary, null, 2)}\n`);
  process.exitCode = reportMissing ? 1 : (result.status ?? 1);
}

function statusKey(status) {
  switch (status) {
    case 'CompileError':
    case 'RuntimeError':
      return 'error';
    case 'Ignored':
      return 'ignored';
    case 'Killed':
      return 'killed';
    case 'NoCoverage':
      return 'noCoverage';
    case 'Survived':
      return 'survived';
    case 'Timeout':
      return 'timeout';
    default:
      throw new Error(`Unsupported Stryker mutant status: ${String(status)}`);
  }
}

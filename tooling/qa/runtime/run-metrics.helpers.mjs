import fs from 'node:fs';
import path from 'node:path';

import { isExecutedAsScript } from '../core/shared.mjs';

const RUN_METRICS_DIR = '.tmp/qa/wrapper-run-metrics';
const HISTORY_SAMPLE_SIZE = 10;

function sanitizeWrapperId(wrapperId) {
  return wrapperId.replace(/[^a-z0-9]+/giu, '-').replace(/^-+|-+$/gu, '');
}

function resolveMetricsPath(wrapperId, rootDir = process.cwd()) {
  const safeWrapperId = sanitizeWrapperId(wrapperId);
  return path.join(rootDir, RUN_METRICS_DIR, `${safeWrapperId}.jsonl`);
}

function readMetricsLines(wrapperId, options = {}) {
  const metricsPath = resolveMetricsPath(wrapperId, options.rootDir);
  if (!fs.existsSync(metricsPath)) {
    return [];
  }

  return fs
    .readFileSync(metricsPath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function parseMetricsEntry(line) {
  try {
    const parsed = JSON.parse(line);
    if (
      typeof parsed.finishedAt !== 'string' ||
      typeof parsed.durationMs !== 'number' ||
      !Number.isFinite(parsed.durationMs)
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function formatDuration(durationMs) {
  if (durationMs < 1000) {
    return `${Math.round(durationMs)}ms`;
  }

  const seconds = durationMs / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  }

  const roundedSeconds = Math.round(seconds);
  const minutes = Math.floor(roundedSeconds / 60);
  const remainingSeconds = roundedSeconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export function readRecentSuccessfulRuns(wrapperId, options = {}) {
  return readMetricsLines(wrapperId, options)
    .map(parseMetricsEntry)
    .filter((entry) => entry !== null)
    .slice(-HISTORY_SAMPLE_SIZE);
}

export function getRecentRunStats(wrapperId, options = {}) {
  const runs = readRecentSuccessfulRuns(wrapperId, options);
  if (runs.length === 0) {
    return null;
  }

  const durations = runs.map((entry) => entry.durationMs);
  const totalDuration = durations.reduce((sum, value) => sum + value, 0);

  return {
    runCount: runs.length,
    minDurationMs: Math.min(...durations),
    averageDurationMs: totalDuration / durations.length,
    maxDurationMs: Math.max(...durations),
  };
}

export function formatRunStatsLine(wrapperId) {
  const stats = getRecentRunStats(wrapperId);
  if (!stats) {
    return `Run timing (last 10 successful ${wrapperId} runs): no successful history yet`;
  }

  return [
    `Run timing (last ${stats.runCount} successful ${wrapperId} runs):`,
    `min=${formatDuration(stats.minDurationMs)}`,
    `avg=${formatDuration(stats.averageDurationMs)}`,
    `max=${formatDuration(stats.maxDurationMs)}`,
  ].join(' ');
}

export function printRunStatsLine(wrapperId) {
  process.stdout.write(`${formatRunStatsLine(wrapperId)}\n`);
}

export function recordSuccessfulRun(wrapperId, startedAtMs) {
  void wrapperId;
  void startedAtMs;
  throw new Error(
    'Legacy wrapper-run metrics are read-only; canonical wrappers write one qa-observability run record'
  );
}

function assertCliArgument(value, description) {
  if (!value) {
    throw new Error(`Missing ${description}`);
  }
}

function runCli(argv) {
  const [mode, wrapperId] = argv;

  if (mode === '--print') {
    assertCliArgument(wrapperId, 'wrapper id for --print');
    printRunStatsLine(wrapperId);
    return;
  }

  if (mode === '--now') {
    process.stdout.write(`${Date.now()}\n`);
    return;
  }

  throw new Error('Usage: --print <wrapper-id> | --now');
}

if (isExecutedAsScript(import.meta.url)) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}

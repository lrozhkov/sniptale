import { isExecutedAsScript } from '../../core/shared.mjs';
import { parseStrictArguments } from '../../core/shared-cli.mjs';
import { getRecentRunStats } from '../run-metrics.helpers.mjs';
import { resolveObservabilityRoot } from './root.mjs';
import { collectRunStatistics } from './statistics.mjs';

const REPORT_CLI = {
  command: 'qa:stats',
  usage: 'npm run qa:stats -- [--wrapper <id>] [--task <id>]',
  description: 'Print structured statistics derived from validated per-run QA records.',
  options: [
    { name: '--wrapper', kind: 'value', key: 'wrapperId', description: 'Select one wrapper.' },
    { name: '--task', kind: 'value', key: 'taskId', description: 'Select one opaque task ID.' },
  ],
};

function selectById(entries, id) {
  return id ? entries.filter((entry) => entry.id === id) : entries;
}

export function collectQaStatisticsReport({ rootDir, wrapperId, taskId } = {}) {
  const statistics = collectRunStatistics({ rootDir });
  const wrappers = selectById(statistics.wrappers, wrapperId);
  return {
    ...statistics,
    wrappers,
    tasks: selectById(statistics.tasks, taskId),
    legacySuccessfulDurationFallback:
      wrapperId && wrappers.length === 0 ? getRecentRunStats(wrapperId, { rootDir }) : null,
  };
}

export function parseQaStatisticsArguments(argv = []) {
  return parseStrictArguments(argv, REPORT_CLI);
}

if (isExecutedAsScript(import.meta.url)) {
  try {
    const parsed = parseQaStatisticsArguments(process.argv.slice(2));
    if (parsed.values.help) {
      process.stdout.write(parsed.help);
    } else {
      const rootDir = resolveObservabilityRoot();
      const report = collectQaStatisticsReport({ rootDir, ...parsed.values });
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

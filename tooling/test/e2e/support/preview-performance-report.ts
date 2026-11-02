import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import type { FullConfig, Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export function performancePercentiles(values: readonly number[]) {
  const sorted = values.filter(Number.isFinite).toSorted((a, b) => a - b);
  const at = (fraction: number) =>
    sorted.length ? sorted[Math.ceil(sorted.length * fraction) - 1]! : null;
  return { count: sorted.length, p50: at(0.5), p95: at(0.95), p99: at(0.99) };
}

export function previewPerformanceSummary(
  metrics: {
    measurementIdentity: { valid: boolean };
    previewStatus: { start: { phase: string }; end: { phase: string } };
    expired: boolean;
    overflow: boolean;
    durationMs: number;
    nativePresentedFps: number | null;
    rafIntervals: number[];
    composedPublication: { fps: number | null; samples: { now: number }[] };
  },
  compositionMeasured = true
) {
  const samples = metrics.composedPublication.samples;
  return {
    valid:
      metrics.measurementIdentity.valid &&
      !metrics.expired &&
      !metrics.overflow &&
      metrics.previewStatus.start.phase !== 'failed' &&
      metrics.previewStatus.end.phase !== 'failed',
    previewPhase: {
      start: metrics.previewStatus.start.phase,
      end: metrics.previewStatus.end.phase,
    },
    durationMs: metrics.durationMs,
    sourceFps: metrics.nativePresentedFps,
    compositionFps: compositionMeasured ? (1000 * samples.length) / metrics.durationMs : null,
    activePublicationFps: metrics.composedPublication.fps,
    compositionIntervalMs: performancePercentiles(
      samples.slice(1).map((sample, index) => sample.now - samples[index]!.now)
    ),
    rafIntervalMs: performancePercentiles(metrics.rafIntervals),
    interpretation:
      'Observed publication is not GPU scanout. RAF measures jank, not composition FPS. ' +
      'No performance threshold is enforced.',
  };
}

function numeric(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Completed drag acceptance is required before a sample can enter comparisons. */
export function validPerformanceDrag(checks: {
  stageValid: boolean;
  errorFree: boolean;
  trustedInputsReceived: boolean;
  geometryMoved: boolean;
  authoredCommitted: boolean;
  decodedFixtureVisible: boolean;
}) {
  return Object.values(checks).every((passed) => passed);
}

export function aggregatePerformanceSamples(samples: readonly unknown[]) {
  const valid = samples.filter(
    (sample): sample is Record<string, unknown> => record(sample) && sample['valid'] === true
  );
  return {
    validSamples: valid.length,
    invalidSamples: samples.length - valid.length,
    compositionFps: performancePercentiles(
      valid.flatMap((sample) =>
        numeric(sample['compositionFps']) ? [sample['compositionFps']] : []
      )
    ),
    geometryP95Ms: performancePercentiles(
      valid.flatMap((sample) => {
        const latency = sample['geometryLatencyMs'];
        return record(latency) && numeric(latency['p95']) ? [latency['p95']] : [];
      })
    ),
    publicationP95Ms: performancePercentiles(
      valid.flatMap((sample) => {
        const latency = sample['publicationLatencyMs'];
        return record(latency) && numeric(latency['p95']) ? [latency['p95']] : [];
      })
    ),
  };
}

async function captureBuildIdentity() {
  const buildDirectory = process.env['SNIPTALE_EXTENSION_BUILD_DIR'] ?? '.tmp/e2e-builds/test';
  try {
    const assetDirectory = resolve(buildDirectory, 'assets');
    const files = (await readdir(assetDirectory))
      .filter((file) => /\.(?:js|css)$/u.test(file))
      .sort();
    if (!files.length) throw new Error('Missing E2E assets');
    const hash = createHash('sha256');
    for (const file of files) {
      hash.update(file);
      hash.update(await readFile(resolve(assetDirectory, file)));
    }
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    if (!/^[a-f0-9]{40}$/u.test(revision)) throw new Error('Invalid Git revision');
    const dirty =
      execFileSync('git', ['status', '--porcelain'], {
        encoding: 'utf8',
        env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
      }).trim().length > 0;
    return {
      available: true,
      revision,
      dirty,
      buildDirectory,
      assetsSha256: hash.digest('hex'),
      assetCount: files.length,
    };
  } catch {
    return {
      available: false,
      buildDirectory,
      reason:
        'Build assets or Git identity are unavailable. Do not compare this run with a baseline.',
    };
  }
}

/** Optional-run report. Test validity and execution failures stay distinct from slow measurements. */
export default class PreviewPerformanceReporter implements Reporter {
  private directory = resolve('.tmp/preview-performance');
  private buildIdentity: Awaited<ReturnType<typeof captureBuildIdentity>> | null = null;
  async onBegin(config: FullConfig) {
    const project = config.projects[0];
    if (project) this.directory = dirname(project.outputDir);
    this.buildIdentity = await captureBuildIdentity();
  }

  private readonly results: {
    test: string;
    status: string;
    errors: string[];
    samples: unknown[];
  }[] = [];

  async onTestEnd(test: TestCase, result: TestResult) {
    const samples: unknown[] = [];
    for (const attachment of result.attachments) {
      if (attachment.name !== 'preview-performance-sample') continue;
      const bytes =
        attachment.body ?? (attachment.path ? await readFile(attachment.path) : undefined);
      if (!bytes) continue;
      const value: unknown = JSON.parse(bytes.toString('utf8'));
      samples.push(value);
    }
    this.results.push({
      test: test.title,
      status: result.status,
      errors: result.errors.map((error) => error.message ?? 'Test execution failed'),
      samples,
    });
  }

  async onEnd() {
    if (!this.results.length) return;
    const path = resolve(this.directory, 'summary.json');
    await mkdir(dirname(path), { recursive: true });
    const results = this.results.map((result) => ({
      ...result,
      aggregate: aggregatePerformanceSamples(result.samples),
    }));
    const report =
      JSON.stringify(
        {
          schemaVersion: 1,
          advisory: true,
          buildIdentity: this.buildIdentity,
          createdAt: new Date().toISOString(),
          results,
        },
        null,
        2
      ) + '\n';
    await writeFile(path, report);
    const latest = resolve('.tmp/preview-performance/summary.json');
    const temporary = `${latest}.${process.pid}.partial`;
    await writeFile(temporary, report);
    await rename(temporary, latest);
    for (const result of results) {
      if (!result.samples.length) continue;
      const sample = result.samples.find(record);
      const protocol = sample?.['protocol'];
      const purpose =
        record(protocol) && typeof protocol['purpose'] === 'string'
          ? protocol['purpose']
          : 'interaction';
      const fps = result.aggregate.compositionFps.p50;
      const latency = result.aggregate.publicationP95Ms.p50;
      process.stdout.write(
        `${purpose} ${result.test}: ${result.status}, ` +
          `median FPS ${fps === null ? 'n/a' : fps.toFixed(2)}, ` +
          `publication p95 ${latency === null ? 'n/a' : latency.toFixed(1) + ' ms'}\n`
      );
    }
    process.stdout.write(`Preview performance report: ${path}\n`);
  }
}

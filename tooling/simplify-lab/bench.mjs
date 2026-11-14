import { createHash, randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateCorpus, loadFrozenCorpus } from './corpus.mjs';
import { DEFAULT_THRESHOLDS, evaluateRaster, ORACLE_VERSION } from './evaluate.mjs';
import {
  compareRunSummaries,
  validateBaselineSummary,
  validateManifest,
} from './report-contract.mjs';
import { createBrowserRunner } from './bench-browser-runner.mjs';

const SETTINGS = Object.freeze({
  automatic: true,
  erase: true,
  content: 'all',
  manualKind: 'text',
  sensitivity: 55,
  thickness: 0.5,
  lineSpacing: 1.5,
  textPattern: 'typical',
  textAlign: 'left',
  color: null,
});
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function failure(classification, message) {
  return Object.assign(new Error(message), { classification });
}
function checkAbort(signal) {
  if (signal?.aborted) throw failure('cancelled', 'Benchmark was cancelled.');
}
function rgba(value, width, height) {
  if (
    (!Array.isArray(value) && !ArrayBuffer.isView(value)) ||
    value.length !== width * height * 4 ||
    !value.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255)
  )
    throw failure('compute-error', 'Invalid decoded raster dimensions or channels.');
  return new Uint8Array(value);
}
async function pngFile(root, path, expectedHash, width, height) {
  if (typeof path !== 'string' || isAbsolute(path))
    throw failure('corpus-error', 'Corpus image path must be relative.');
  const target = await realpath(resolve(root, path));
  const scoped = relative(root, target);
  if (!scoped || scoped.startsWith('..') || isAbsolute(scoped))
    throw failure('corpus-error', 'Corpus image escapes its root.');
  const info = await stat(target);
  if (!info.isFile() || info.size > 40_000_000)
    throw failure('corpus-error', 'Corpus image exceeds its file budget.');
  const bytes = await readFile(target);
  if (
    hash(bytes) !== expectedHash ||
    bytes.length < 24 ||
    bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
    bytes.toString('ascii', 12, 16) !== 'IHDR' ||
    bytes.readUInt32BE(16) !== width ||
    bytes.readUInt32BE(20) !== height
  )
    throw failure('corpus-error', 'Corpus image hash, PNG header, or dimensions differ.');
  return bytes;
}
function binaryMask(pixels) {
  const mask = new Uint8Array(pixels.length / 4);
  for (let i = 0; i < mask.length; i++) {
    const value = pixels[i * 4];
    if (
      (value !== 0 && value !== 255) ||
      pixels[i * 4 + 1] !== value ||
      pixels[i * 4 + 2] !== value ||
      pixels[i * 4 + 3] !== 255
    )
      throw failure('oracle-error', 'Corpus mask must contain opaque binary grayscale pixels.');
    mask[i] = value;
  }
  return mask;
}
async function readCase(root, entry, runner) {
  const files = await Promise.all([
    pngFile(root, entry.path, entry.sourceHash, entry.width, entry.height),
    pngFile(root, entry.referencePath, entry.referenceHash, entry.width, entry.height),
    pngFile(root, entry.inkMaskPath, entry.inkMaskHash, entry.width, entry.height),
    pngFile(root, entry.protectedMaskPath, entry.protectedMaskHash, entry.width, entry.height),
  ]);
  const decoded = await Promise.all(
    files.map(async (bytes) =>
      rgba(await runner.decodePng(bytes, entry.width, entry.height), entry.width, entry.height)
    )
  );
  return {
    sourceBytes: files[0],
    referenceBytes: files[1],
    source: decoded[0],
    reference: decoded[1],
    inkMask: binaryMask(decoded[2]),
    protectedMask: binaryMask(decoded[3]),
  };
}

async function selectedCases(manifest, options) {
  let cases = manifest.cases.filter((entry) => !options.split || entry.split === options.split);
  let requested = options.caseIds ?? [];
  if (options.failuresFrom) {
    const lines = (await readFile(options.failuresFrom, 'utf8'))
      .split('\n')
      .filter((line) => line.trim());
    const failures = lines.map((line) => JSON.parse(line));
    if (failures.some((entry) => typeof entry.caseId !== 'string'))
      throw failure('selection-error', 'Failure records must name a caseId.');
    const failedIds = new Set(failures.map((entry) => entry.caseId));
    requested = requested.length ? requested.filter((id) => failedIds.has(id)) : [...failedIds];
  }
  if (requested.some((id) => !manifest.cases.some((entry) => entry.id === id)))
    throw failure('selection-error', 'An explicitly selected case does not exist in this corpus.');
  if (requested.length || options.failuresFrom || options.caseIds?.length)
    cases = cases.filter((entry) => requested.includes(entry.id));
  if (options.limit !== undefined) cases = cases.slice(0, options.limit);
  if (!cases.length) throw failure('empty-selection', 'No corpus case was selected.');
  return cases;
}
function aggregate(cases) {
  const sum = (key) => cases.reduce((value, entry) => value + (entry.metrics[key] ?? 0), 0);
  const ratio = (a, b) => (sum(b) ? sum(a) / sum(b) : 0);
  return {
    cases: cases.length,
    remainingFraction: sum('insideInkPixels')
      ? cases.reduce(
          (value, entry) => value + entry.metrics.remainingFraction * entry.metrics.insideInkPixels,
          0
        ) / sum('insideInkPixels')
      : 0,
    protectedDamageFraction: ratio('protectedDamagedPixels', 'protectedPixels'),
    backgroundDamageFraction: ratio('backgroundDamagedPixels', 'backgroundPixels'),
    outsideRegionChangedFraction: ratio('outsideRegionChangedPixels', 'outsideRegionPixels'),
    fullMissFragments: sum('fullMissFragments'),
    partialCleanupFragments: sum('partialCleanupFragments'),
  };
}
function errorMap(entry, source, reference, output, noise) {
  const pixels = new Uint8ClampedArray(output.length);
  for (let y = 0; y < entry.height; y++)
    for (let x = 0; x < entry.width; x++) {
      const i = (y * entry.width + x) * 4;
      const inside =
        x >= entry.region.x &&
        y >= entry.region.y &&
        x < entry.region.x + entry.region.width &&
        y < entry.region.y + entry.region.height;
      const expected = inside ? reference : source;
      if (
        [0, 1, 2, 3].some(
          (channel) => Math.abs(output[i + channel] - expected[i + channel]) > noise
        )
      ) {
        pixels[i] = 255;
        pixels[i + 3] = 255;
      }
    }
  return pixels;
}
async function artifacts(out, entry, decoded, output, runner, thresholds) {
  const directory = join(out, 'artifacts');
  await mkdir(directory, { recursive: true });
  const paths = {
    source: `artifacts/${entry.id}-source.png`,
    reference: `artifacts/${entry.id}-reference.png`,
    output: `artifacts/${entry.id}-output.png`,
    errorMap: `artifacts/${entry.id}-errors.png`,
  };
  const bytes = [
    decoded.sourceBytes,
    decoded.referenceBytes,
    await runner.encodePng(output, entry.width, entry.height),
    await runner.encodePng(
      errorMap(entry, decoded.source, decoded.reference, output, thresholds.repeatNoise),
      entry.width,
      entry.height
    ),
  ];
  for (const [index, path] of Object.values(paths).entries())
    await writeFile(join(out, path), bytes[index], { flag: 'wx' });
  return paths;
}
function abortable(work, signal) {
  if (!signal) return work;
  checkAbort(signal);
  let rejectAbort;
  const aborted = new Promise((_, reject) => {
    rejectAbort = () => reject(failure('cancelled', 'Benchmark was cancelled.'));
    signal.addEventListener('abort', rejectAbort, { once: true });
  });
  return Promise.race([work, aborted]).finally(() =>
    signal.removeEventListener('abort', rejectAbort)
  );
}
function validateCorpusOptions(options) {
  if (options.holdoutRevision !== undefined && ![1, 2].includes(options.holdoutRevision))
    throw failure('argument-error', 'Holdout revision must be exactly 1 or 2.');
  if (
    options.corpus !== undefined &&
    (options.fontConfig !== undefined || options.holdoutRevision !== undefined)
  )
    throw failure(
      'argument-error',
      'Frozen corpus input cannot be combined with font configuration or holdout revision.'
    );
}
/** Generate verified inputs, run the actual Worker adapter, and preserve complete or partial reports. */
export async function runBench(options = {}, dependencies = {}) {
  const profile = options.profile ?? 'smoke',
    seed = options.seed ?? 1;
  const out = resolve(options.out ?? `.tmp/simplify-corpus-runs/${Date.now()}-${randomUUID()}`);
  await mkdir(dirname(out), { recursive: true });
  try {
    await mkdir(out);
  } catch (error) {
    throw failure(
      'output-exists',
      `Benchmark output must be a new directory: ${out} (${error.code ?? 'unavailable'})`
    );
  }
  await Promise.all(
    ['cases.jsonl', 'failures.jsonl'].map((name) => writeFile(join(out, name), '', { flag: 'wx' }))
  );
  const thresholds = { ...DEFAULT_THRESHOLDS, ...options.thresholds },
    settings = { ...SETTINGS };
  const summary = {
    schemaVersion: 1,
    status: 'incomplete',
    complete: false,
    exitCode: 2,
    corpus: null,
    provenance: {
      input: {
        mode: options.corpus !== undefined ? 'frozen-explicit' : 'generated',
        manifestPath: null,
      },
    },
    selection: {
      caseIds: [],
      split: options.split ?? null,
      subset: false,
      complete: false,
      requested: {
        caseIds: options.caseIds ?? [],
        failuresFrom: options.failuresFrom ?? null,
        limit: options.limit ?? null,
      },
    },
    settings,
    engineHash: null,
    oracleVersion: ORACLE_VERSION,
    thresholds,
    counts: { selected: 0, completed: 0, failed: 0, executionErrors: 0, fragments: 0 },
    cases: [],
    failuresCount: 0,
    comparison: null,
    error: null,
  };
  let runner,
    activeCase = null;
  const cancelled = () => {
    void runner?.cancel();
  };
  options.signal?.addEventListener('abort', cancelled);
  try {
    checkAbort(options.signal);
    validateCorpusOptions(options);
    const admitted =
      options.corpus !== undefined
        ? await (dependencies.loadFrozen ?? loadFrozenCorpus)(options.corpus)
        : await (dependencies.generate ?? generateCorpus)({
            profile,
            seed,
            ...(options.fontConfig ? { fontConfig: options.fontConfig } : {}),
            ...(options.holdoutRevision !== undefined
              ? { holdoutRevision: options.holdoutRevision }
              : {}),
            ...(options.signal ? { signal: options.signal } : {}),
          });
    const manifestPath = await realpath(admitted.manifestPath),
      root = await realpath(dirname(manifestPath));
    const manifest = validateManifest(admitted.manifest);
    summary.provenance.input.manifestPath = manifestPath;
    if (
      options.corpus !== undefined &&
      ((options.profile !== undefined && options.profile !== manifest.profile) ||
        (options.seed !== undefined && options.seed !== manifest.seed))
    )
      throw failure(
        'argument-error',
        'Explicit profile and seed must match the frozen corpus metadata.'
      );
    summary.corpus = Object.fromEntries(
      [
        'fingerprint',
        'seed',
        'profile',
        'generatorVersion',
        'recipeVersion',
        'renderEnvironment',
        'fonts',
        'splitDefinition',
      ].map((key) => [key, manifest[key]])
    );
    const entries = await selectedCases(manifest, options);
    summary.selection.caseIds = entries.map((entry) => entry.id);
    summary.selection.subset = entries.length !== manifest.cases.length;
    summary.counts.selected = entries.length;
    const noise = entries.map((entry) => entry.repeatNoise);
    const evidenceComplete = noise.every(
      (entry) =>
        entry &&
        Number.isInteger(entry.sourceMaxChannel) &&
        entry.sourceMaxChannel >= 0 &&
        entry.sourceMaxChannel <= 255 &&
        Number.isInteger(entry.referenceMaxChannel) &&
        entry.referenceMaxChannel >= 0 &&
        entry.referenceMaxChannel <= 255
    );
    const measuredRepeatNoise = evidenceComplete
      ? {
          sourceMaxChannel: Math.max(...noise.map((entry) => entry.sourceMaxChannel)),
          referenceMaxChannel: Math.max(...noise.map((entry) => entry.referenceMaxChannel)),
        }
      : null;
    summary.provenance.calibration = {
      measuredRepeatNoise,
      evidenceComplete,
      cases: entries.length,
      repeatNoiseThreshold: thresholds.repeatNoise,
    };
    if (
      measuredRepeatNoise &&
      Math.max(measuredRepeatNoise.sourceMaxChannel, measuredRepeatNoise.referenceMaxChannel) >
        thresholds.repeatNoise
    )
      throw failure(
        'oracle-error',
        'Oracle repeat-noise threshold is below the measured corpus noise.'
      );
    const baseline = options.baseline
      ? validateBaselineSummary(JSON.parse(await readFile(options.baseline, 'utf8')))
      : null;
    checkAbort(options.signal);
    runner = await (dependencies.createRunner ?? createBrowserRunner)({
      manifestPath,
      signal: options.signal,
      ...(dependencies.start ? { start: dependencies.start } : {}),
      ...(dependencies.launch ? { launch: dependencies.launch } : {}),
    });
    summary.engineHash = runner.engineHash;
    for (const entry of entries) {
      checkAbort(options.signal);
      activeCase = entry;
      const decoded = await readCase(root, entry, runner);
      checkAbort(options.signal);
      const started = performance.now();
      const result = await abortable(
        runner.render({
          source: {
            dataUrl: `data:image/png;base64,${decoded.sourceBytes.toString('base64')}`,
            width: entry.width,
            height: entry.height,
          },
          region: entry.region,
          settings,
        }),
        options.signal
      );
      checkAbort(options.signal);
      const output = rgba(result.output, entry.width, entry.height);
      const evaluation = (dependencies.evaluate ?? evaluateRaster)({
        source: decoded.source,
        reference: decoded.reference,
        output,
        width: entry.width,
        height: entry.height,
        inkMask: decoded.inkMask,
        protectedMask: decoded.protectedMask,
        fragments: entry.fragments,
        region: entry.region,
        thresholds,
      });
      const common = {
        schemaVersion: 1,
        caseId: entry.id,
        fragmentId: null,
        split: entry.split,
        tags: entry.tags,
        sourceHash: entry.sourceHash,
        settings,
        engineHash: summary.engineHash,
        oracleVersion: ORACLE_VERSION,
      };
      let artifactPaths = null,
        artifactError = null;
      if (
        options.artifacts === 'all' ||
        (options.artifacts !== 'none' && evaluation.findings.length)
      )
        try {
          artifactPaths = await artifacts(out, entry, decoded, output, runner, thresholds);
        } catch (error) {
          artifactError = error;
        }
      checkAbort(options.signal);
      const fragments = evaluation.fragments.map((fragment) => ({
        ...common,
        ...fragment,
        fragmentId: fragment.id,
        tags: [...new Set([...entry.tags, ...fragment.tags])],
        metrics: Object.fromEntries(
          Object.entries(fragment).filter(([, value]) => typeof value === 'number')
        ),
        reason: fragment.status,
        artifacts: artifactPaths,
      }));
      const record = {
        ...common,
        settingsIndex: 0,
        metrics: evaluation.metrics,
        fragments,
        findings: evaluation.findings,
        status: evaluation.status,
        reason: evaluation.status,
        artifacts: artifactPaths,
        durationMs: performance.now() - started,
        workerVersion: result.version ?? null,
      };
      summary.cases.push(record);
      summary.counts.completed++;
      summary.counts.fragments += fragments.length;
      if (evaluation.status === 'fail') summary.counts.failed++;
      await appendFile(join(out, 'cases.jsonl'), `${JSON.stringify(record)}\n`);
      for (const finding of evaluation.findings) {
        const record = {
          ...common,
          fragmentId: finding.fragmentId,
          text: finding.text,
          rects: finding.rects,
          tags: [...new Set([...entry.tags, ...finding.tags])],
          metrics: { value: finding.value, affectedPixels: finding.affectedPixels },
          status: finding.type,
          reason: finding.type,
          artifacts: artifactPaths,
        };
        await appendFile(join(out, 'failures.jsonl'), `${JSON.stringify(record)}\n`);
        summary.failuresCount++;
      }
      activeCase = null;
      if (artifactError) throw failure('artifact-error', artifactError.message);
    }
    summary.selection.complete = true;
    checkAbort(options.signal);
    summary.complete = true;
    summary.status = 'baseline';
    summary.exitCode = 0;
    try {
      validateBaselineSummary(summary);
    } catch (error) {
      throw failure('report-error', error.message);
    }
    if (baseline) {
      summary.comparison = compareRunSummaries(baseline, summary);
      summary.status = summary.comparison.status;
      summary.exitCode = summary.status === 'failed' ? 1 : 0;
    }
  } catch (error) {
    summary.complete = false;
    summary.selection.complete =
      summary.counts.selected > 0 && summary.counts.completed === summary.counts.selected;
    summary.status =
      options.signal?.aborted || error.classification === 'cancelled' ? 'cancelled' : 'incomplete';
    summary.exitCode = 2;
    summary.error = {
      classification:
        summary.status === 'cancelled'
          ? 'cancelled'
          : (error.classification ??
            error.kind ??
            (activeCase ? 'compute-error' : 'execution-error')),
      message: error.message,
    };
    if (activeCase) {
      summary.counts.executionErrors++;
      const record = {
        schemaVersion: 1,
        caseId: activeCase.id,
        fragmentId: null,
        split: activeCase.split,
        tags: activeCase.tags,
        sourceHash: activeCase.sourceHash,
        settings,
        engineHash: summary.engineHash,
        oracleVersion: ORACLE_VERSION,
        metrics: null,
        status: summary.status,
        reason: summary.error.classification,
        error: summary.error.message,
        artifacts: null,
      };
      await appendFile(join(out, 'cases.jsonl'), `${JSON.stringify(record)}\n`);
      await appendFile(join(out, 'failures.jsonl'), `${JSON.stringify(record)}\n`);
      summary.failuresCount++;
    }
  } finally {
    options.signal?.removeEventListener('abort', cancelled);
    try {
      await runner?.close();
    } catch (error) {
      summary.status = 'incomplete';
      summary.complete = false;
      summary.exitCode = 2;
      summary.error = { classification: 'cleanup-error', message: error.message };
    }
    if (options.signal?.aborted) {
      summary.status = 'cancelled';
      summary.complete = false;
      summary.exitCode = 2;
      summary.error = { classification: 'cancelled', message: 'Benchmark was cancelled.' };
    }
    summary.metrics = aggregate(summary.cases);
    const tags = [...new Set(summary.cases.flatMap((entry) => entry.tags))];
    summary.groups = Object.fromEntries(
      tags.map((tag) => [tag, aggregate(summary.cases.filter((entry) => entry.tags.includes(tag)))])
    );
    summary.worstFragments = summary.cases
      .flatMap((entry) => entry.fragments)
      .filter((entry) => entry.status !== 'not-applicable')
      .sort((a, b) => b.remainingFraction - a.remainingFraction)
      .slice(0, 20);
    await writeFile(join(out, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, {
      flag: 'wx',
    });
  }
  return { summary, out, exitCode: summary.exitCode };
}
/** Parse the benchmark's explicit corpus, subset, artifact, and output controls. */
export function parseBenchArgs(args) {
  const options = { caseIds: [] };
  const values = new Map([
    ['--profile', 'profile'],
    ['--seed', 'seed'],
    ['--baseline', 'baseline'],
    ['--case-id', 'caseId'],
    ['--failures-from', 'failuresFrom'],
    ['--limit', 'limit'],
    ['--out', 'out'],
    ['--split', 'split'],
    ['--font-config', 'fontConfig'],
    ['--corpus', 'corpus'],
    ['--holdout-revision', 'holdoutRevision'],
  ]);
  for (let i = 0; i < args.length; i++) {
    const name = args[i];
    if (name === '--artifacts') {
      options.artifacts = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'all';
      if (!['all', 'failures', 'none'].includes(options.artifacts))
        throw failure('argument-error', 'Artifacts must be all, failures, or none.');
      continue;
    }
    const key = values.get(name);
    if (!key || !args[i + 1] || args[i + 1].startsWith('--'))
      throw failure('argument-error', `Unknown argument or missing value: ${name}`);
    const value = args[++i];
    if (key === 'caseId') options.caseIds.push(value);
    else {
      if (key in options) throw failure('argument-error', `Repeated argument: ${name}`);
      options[key] = value;
    }
  }
  if (options.profile && !['smoke', 'full'].includes(options.profile))
    throw failure('argument-error', 'Profile must be smoke or full.');
  if (options.split && !['tuning', 'holdout'].includes(options.split))
    throw failure('argument-error', 'Split must be tuning or holdout.');
  for (const key of ['seed', 'limit'])
    if (options[key] !== undefined) {
      if (
        !/^\d+$/.test(options[key]) ||
        !Number.isSafeInteger(Number(options[key])) ||
        (key === 'limit' && Number(options[key]) < 1)
      )
        throw failure('argument-error', `Invalid ${key}.`);
      options[key] = Number(options[key]);
    }
  if (options.holdoutRevision !== undefined) {
    if (!/^[12]$/.test(options.holdoutRevision))
      throw failure('argument-error', 'Holdout revision must be exactly 1 or 2.');
    options.holdoutRevision = Number(options.holdoutRevision);
  }
  validateCorpusOptions(options);
  return options;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  try {
    const result = await runBench({
      ...parseBenchArgs(process.argv.slice(2)),
      signal: controller.signal,
    });
    console.log(`${result.summary.status}: ${result.out}`);
    process.exitCode = result.exitCode;
  } catch (error) {
    console.error(`${error.classification ?? 'execution-error'}: ${error.message}`);
    process.exitCode = 2;
  } finally {
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
  }
}

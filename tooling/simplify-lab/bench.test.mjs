import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCanvas } from 'canvas';
import { parseBenchArgs, runBench } from './bench.mjs';
import { createBrowserRunner } from './bench-browser-runner.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const white = [255, 255, 255, 255],
  black = [0, 0, 0, 255];
const source = new Uint8Array([...black, ...white, ...black]);
const reference = new Uint8Array([...white, ...white, ...black]);
function png(pixels) {
  const canvas = createCanvas(3, 1),
    context = canvas.getContext('2d'),
    image = context.createImageData(3, 1);
  image.data.set(pixels);
  context.putImageData(image, 0, 0);
  return canvas.toBuffer('image/png');
}
function mask(values) {
  return new Uint8Array(values.flatMap((value) => [value, value, value, 255]));
}
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'simplify-bench-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const corpus = join(root, 'corpus');
  await mkdir(corpus);
  const arrays = { source, reference, ink: mask([255, 0, 0]), protected: mask([0, 0, 255]) },
    decoded = new Map();
  for (const [name, pixels] of Object.entries(arrays)) {
    const bytes = png(pixels);
    await writeFile(join(corpus, `${name}.png`), bytes);
    decoded.set(hash(bytes), pixels);
  }
  const resource = (name) => ({ path: `${name}.png`, hash: hash(png(arrays[name])) });
  const make = (id, split) => ({
    id,
    split,
    repeatNoise: { sourceMaxChannel: 0, referenceMaxChannel: 0 },
    tags: ['fixture', split],
    width: 3,
    height: 1,
    region: { x: 0, y: 0, width: 2, height: 1 },
    path: resource('source').path,
    sourceHash: resource('source').hash,
    referencePath: resource('reference').path,
    referenceHash: resource('reference').hash,
    inkMaskPath: resource('ink').path,
    inkMaskHash: resource('ink').hash,
    protectedMaskPath: resource('protected').path,
    protectedMaskHash: resource('protected').hash,
    fragments: [
      { id: 'text-1', text: 'A', rects: [{ x: 0, y: 0, width: 1, height: 1 }], tags: ['latin'] },
    ],
  });
  const manifest = {
    schemaVersion: 1,
    status: 'complete',
    fingerprint: hash('corpus'),
    profile: 'smoke',
    seed: 1,
    generatorVersion: 'fixture-v1',
    recipeVersion: 'fixture-v1',
    renderEnvironment: { chromium: 'fixture' },
    fonts: [{ sha256: hash('font') }],
    splitDefinition: { version: 'fixture-v1' },
    cases: [make('case-a', 'tuning'), make('case-b', 'holdout')],
  };
  const manifestPath = join(corpus, 'manifest.json');
  const save = async () => {
    const bytes = JSON.stringify(manifest);
    await writeFile(manifestPath, bytes);
    await writeFile(join(corpus, 'manifest.sha256'), hash(bytes));
  };
  await save();
  const generated = { manifest, manifestPath };
  let sequence = 0;
  return {
    root,
    corpus,
    manifest,
    manifestPath,
    generated,
    decoded,
    save,
    out: () => join(root, `run-${++sequence}`),
    runner(output = reference) {
      const calls = [];
      let closed = 0,
        cancelled = 0;
      return {
        engineHash: hash('engine'),
        calls,
        get closed() {
          return closed;
        },
        get cancelled() {
          return cancelled;
        },
        async decodePng(bytes) {
          const value = decoded.get(hash(bytes));
          assert.ok(value, 'only verified fixture bytes reach decoding');
          return value;
        },
        async render(input) {
          calls.push(input);
          return { output, version: 'fixture-worker-v1' };
        },
        async encodePng(pixels) {
          return png(pixels);
        },
        async cancel() {
          cancelled++;
        },
        async close() {
          closed++;
        },
      };
    },
  };
}
async function run(f, runner, options = {}) {
  return runBench(
    { out: f.out(), artifacts: 'none', ...options },
    { generate: async () => f.generated, createRunner: async () => runner }
  );
}
async function jsonl(out, name) {
  return (await readFile(join(out, name), 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

test('initial baseline reports misses and sends only source/settings to compute', async (t) => {
  const f = await fixture(t),
    runner = f.runner(source),
    result = await run(f, runner, { artifacts: 'failures' });
  assert.equal(result.summary.status, 'baseline');
  assert.equal(result.exitCode, 0);
  assert.equal(result.summary.complete, true);
  assert.equal(result.summary.failuresCount, 2);
  assert.equal(runner.closed, 1);
  assert.deepEqual(result.summary.selection.caseIds, ['case-a', 'case-b']);
  assert.equal(result.summary.selection.subset, false);
  assert.deepEqual(Object.keys(runner.calls[0]).sort(), ['region', 'settings', 'source']);
  assert.equal(runner.calls[0].settings.erase, true);
  assert.equal(runner.calls[0].settings.content, 'all');
  const failures = await jsonl(result.out, 'failures.jsonl');
  assert.equal(failures[0].reason, 'full-miss');
  for (const key of [
    'schemaVersion',
    'caseId',
    'fragmentId',
    'split',
    'tags',
    'sourceHash',
    'settings',
    'engineHash',
    'oracleVersion',
    'metrics',
    'status',
    'reason',
    'artifacts',
  ])
    assert.ok(key in failures[0], key);
  assert.equal(failures[0].fragmentId, 'text-1');
  assert.deepEqual(failures[0].rects, [{ x: 0, y: 0, width: 1, height: 1 }]);
  assert.equal(
    (await readFile(join(result.out, failures[0].artifacts.output))).subarray(0, 8).toString('hex'),
    '89504e470d0a1a0a'
  );
  assert.equal((await jsonl(result.out, 'cases.jsonl')).length, 2);
  assert.equal(result.summary.worstFragments[0].remainingFraction, 1);
});
test('compares identical cohorts, ignores changed engine hashes and blocks new local misses', async (t) => {
  const f = await fixture(t),
    baseline = await run(f, f.runner());
  const candidateRunner = f.runner();
  candidateRunner.engineHash = hash('candidate engine');
  const candidate = await run(f, candidateRunner, { baseline: join(baseline.out, 'summary.json') });
  assert.equal(candidate.summary.status, 'pass');
  assert.equal(candidate.exitCode, 0);
  const missed = await run(f, f.runner(source), { baseline: join(baseline.out, 'summary.json') });
  assert.equal(missed.summary.status, 'failed');
  assert.equal(missed.exitCode, 1);
  assert.ok(missed.summary.comparison.regressions.some((entry) => entry.fragmentId === 'text-1'));
});
test('refuses incompatible source cohorts, settings, oracle versions and thresholds', async (t) => {
  const f = await fixture(t),
    original = await run(f, f.runner());
  for (const change of [
    (value) => {
      value.corpus.fingerprint = hash('different corpus');
    },
    (value) => {
      value.settings.sensitivity = 10;
    },
    (value) => {
      value.oracleVersion = 'different';
    },
    (value) => {
      value.thresholds.repeatNoise = 1;
    },
  ]) {
    const baseline = structuredClone(original.summary);
    change(baseline);
    const path = join(f.root, `${hash(JSON.stringify(baseline))}.json`);
    await writeFile(path, JSON.stringify(baseline));
    const runner = f.runner(),
      result = await run(f, runner, { baseline: path });
    assert.equal(result.summary.status, 'incomplete');
    assert.equal(result.summary.error.classification, 'incompatible-baseline');
    assert.notEqual(result.exitCode, 0);
    assert.equal(runner.closed, 1);
  }
  const subset = await run(f, f.runner(), { caseIds: ['case-a'] });
  const otherSubset = await run(f, f.runner(), {
    caseIds: ['case-b'],
    baseline: join(subset.out, 'summary.json'),
  });
  assert.equal(otherSubset.summary.error.classification, 'incompatible-baseline');
});
test('records explicit holdout and failed-case subset selection without silently truncating', async (t) => {
  const f = await fixture(t),
    holdout = await run(f, f.runner(), { split: 'holdout' });
  assert.deepEqual(holdout.summary.selection.caseIds, ['case-b']);
  assert.equal(holdout.summary.selection.subset, true);
  assert.equal(holdout.summary.selection.complete, true);
  const failures = join(f.root, 'failed.jsonl');
  await writeFile(failures, '{"caseId":"case-b"}\n{"caseId":"case-a"}\n');
  const limited = await run(f, f.runner(), { failuresFrom: failures, limit: 1 });
  assert.deepEqual(limited.summary.selection.caseIds, ['case-a']);
  assert.equal(limited.summary.selection.subset, true);
  assert.equal(limited.summary.selection.requested.limit, 1);
});
test('empty or invalid selection cannot produce a successful empty baseline', async (t) => {
  const f = await fixture(t),
    runner = f.runner();
  const failures = join(f.root, 'empty.jsonl');
  await writeFile(failures, '');
  for (const options of [{ caseIds: ['missing'] }, { failuresFrom: failures }]) {
    const result = await run(f, runner, options);
    assert.equal(result.summary.status, 'incomplete');
    assert.equal(result.summary.complete, false);
    assert.notEqual(result.exitCode, 0);
  }
  assert.equal(runner.calls.length, 0);
});
test('hash, dimensions, symlink boundaries and binary masks are admitted before compute', async (t) => {
  for (const kind of ['hash', 'dimensions', 'symlink', 'mask']) {
    const f = await fixture(t),
      runner = f.runner();
    if (kind === 'hash') await writeFile(join(f.corpus, 'source.png'), Buffer.from('changed'));
    if (kind === 'dimensions') {
      f.manifest.cases[0].width = 4;
      await f.save();
    }
    if (kind === 'symlink') {
      const outside = join(f.root, 'outside.png');
      await writeFile(outside, png(source));
      await symlink(outside, join(f.corpus, 'escaped.png'));
      f.manifest.cases[0].path = 'escaped.png';
      await f.save();
    }
    if (kind === 'mask') {
      const pixels = mask([127, 0, 0]),
        bytes = png(pixels);
      await writeFile(join(f.corpus, 'ink.png'), bytes);
      f.decoded.set(hash(bytes), pixels);
      for (const entry of f.manifest.cases) entry.inkMaskHash = hash(bytes);
      await f.save();
    }
    const result = await run(f, runner);
    assert.equal(result.summary.status, 'incomplete');
    assert.equal(runner.calls.length, 0);
    assert.equal(runner.closed, 1);
    assert.notEqual(result.exitCode, 0);
    assert.equal(
      result.summary.error.classification,
      kind === 'mask' ? 'oracle-error' : 'corpus-error'
    );
  }
});
test('refuses output reuse and preserves an existing baseline directory', async (t) => {
  const f = await fixture(t),
    out = f.out();
  await mkdir(out);
  await writeFile(join(out, 'keep.txt'), 'preserved');
  await assert.rejects(run(f, f.runner(), { out }), { classification: 'output-exists' });
  assert.equal(await readFile(join(out, 'keep.txt'), 'utf8'), 'preserved');
});
test('concurrent runs with the same output preserve the first run owner and completed reports', async (t) => {
  const f = await fixture(t),
    out = f.out(),
    owner = f.runner(source),
    contender = f.runner();
  let started,
    release,
    contenderGenerations = 0;
  const reserved = new Promise((resolve) => {
    started = resolve;
  });
  const held = new Promise((resolve) => {
    release = resolve;
  });
  t.after(() => release());
  const first = runBench(
    { out, artifacts: 'none' },
    {
      generate: async () => {
        started();
        await held;
        return f.generated;
      },
      createRunner: async () => owner,
    }
  );
  await reserved;
  const before = await Promise.all(
    ['cases.jsonl', 'failures.jsonl'].map((name) => readFile(join(out, name)))
  );
  await assert.rejects(
    runBench(
      { out, artifacts: 'none' },
      {
        generate: async () => {
          contenderGenerations++;
          return f.generated;
        },
        createRunner: async () => contender,
      }
    ),
    { classification: 'output-exists' }
  );
  assert.equal(contenderGenerations, 0);
  assert.equal(contender.closed, 0);
  assert.equal(owner.closed, 0);
  assert.deepEqual(
    await Promise.all(['cases.jsonl', 'failures.jsonl'].map((name) => readFile(join(out, name)))),
    before
  );
  await assert.rejects(readFile(join(out, 'summary.json')), { code: 'ENOENT' });
  release();
  const completed = await first;
  assert.equal(completed.summary.status, 'baseline');
  assert.equal(completed.summary.complete, true);
  assert.equal(completed.exitCode, 0);
  assert.equal(owner.closed, 1);
  assert.equal(contender.closed, 0);
  assert.deepEqual(
    JSON.parse(await readFile(join(out, 'summary.json'), 'utf8')),
    completed.summary
  );
  assert.deepEqual(
    (await jsonl(out, 'cases.jsonl')).map((record) => record.caseId),
    ['case-a', 'case-b']
  );
  assert.deepEqual(
    (await jsonl(out, 'failures.jsonl')).map((record) => record.caseId),
    ['case-a', 'case-b']
  );
});
test('preserves completed work and closes resources after a later compute error', async (t) => {
  const f = await fixture(t),
    runner = f.runner();
  let calls = 0;
  runner.render = async () => {
    if (++calls === 2) throw new Error('controlled worker failure');
    return { output: reference, version: 'fixture' };
  };
  const result = await run(f, runner, { artifacts: 'all' });
  assert.equal(result.summary.status, 'incomplete');
  assert.equal(result.summary.cases.length, 1);
  assert.equal(result.summary.counts.executionErrors, 1);
  assert.equal(runner.closed, 1);
  assert.equal(result.summary.error.classification, 'compute-error');
  assert.equal((await jsonl(result.out, 'cases.jsonl')).length, 2);
  assert.ok(await readFile(join(result.out, 'artifacts/case-a-output.png')));
});
test('cancellation preserves earlier results, cancels the compute owner and ignores late results', async (t) => {
  const f = await fixture(t),
    runner = f.runner(),
    controller = new AbortController();
  let started,
    release,
    calls = 0;
  const pending = new Promise((resolve) => {
      release = resolve;
    }),
    secondStarted = new Promise((resolve) => {
      started = resolve;
    });
  runner.render = async () => {
    if (++calls === 2) {
      started();
      return pending;
    }
    return { output: reference, version: 'fixture' };
  };
  const running = run(f, runner, { signal: controller.signal });
  await secondStarted;
  controller.abort();
  const result = await running;
  assert.equal(result.summary.status, 'cancelled');
  assert.equal(result.summary.complete, false);
  assert.equal(result.summary.cases.length, 1);
  assert.equal(runner.cancelled, 1);
  assert.equal(runner.closed, 1);
  assert.notEqual(result.exitCode, 0);
  release({ output: source, version: 'late' });
  await Promise.resolve();
  assert.equal(result.summary.cases.length, 1);
});
test('generation, browser startup and cleanup errors each leave an incomplete report', async (t) => {
  const f = await fixture(t),
    generation = await runBench(
      { out: f.out() },
      {
        generate: async () => {
          throw Object.assign(new Error('Missing pinned font'), { classification: 'font-error' });
        },
      }
    );
  assert.equal(generation.summary.error.classification, 'font-error');
  assert.equal(generation.summary.status, 'incomplete');
  let serverClosed = 0,
    browserClosed = 0;
  const startup = await runBench(
    { out: f.out() },
    {
      generate: async () => f.generated,
      start: async () => ({
        config: { stamp: { sourceDigest: hash('engine') } },
        close: async () => {
          serverClosed++;
        },
      }),
      launch: async () => ({
        newPage: async () => {
          throw new Error('controlled page startup failure');
        },
        close: async () => {
          browserClosed++;
        },
      }),
    }
  );
  assert.equal(startup.summary.status, 'incomplete');
  assert.equal(serverClosed, 1);
  assert.equal(browserClosed, 1);
  const runner = f.runner();
  runner.close = async () => {
    throw new Error('controlled cleanup failure');
  };
  const cleanup = await run(f, runner);
  assert.equal(cleanup.summary.status, 'incomplete');
  assert.equal(cleanup.summary.error.classification, 'cleanup-error');
  assert.notEqual(cleanup.exitCode, 0);
});
test('CLI keeps corpus profile, seed, independent split and artifact controls explicit', () => {
  assert.deepEqual(
    parseBenchArgs([
      '--profile',
      'full',
      '--seed',
      '9',
      '--split',
      'holdout',
      '--case-id',
      'a',
      '--case-id',
      'b',
      '--limit',
      '2',
      '--out',
      'new-run',
      '--artifacts',
    ]),
    {
      caseIds: ['a', 'b'],
      profile: 'full',
      seed: 9,
      split: 'holdout',
      limit: 2,
      out: 'new-run',
      artifacts: 'all',
    }
  );
  for (const args of [
    ['--unknown'],
    ['--seed', 'NaN'],
    ['--limit', '0'],
    ['--profile', 'other'],
    ['--split', 'all'],
    ['--artifacts', 'bad'],
    ['--out'],
  ])
    assert.throws(() => parseBenchArgs(args), { classification: 'argument-error' });
});

test('aggregates continuous residue instead of counting every partly visible pixel as fully retained', async (t) => {
  const f = await fixture(t),
    runner = f.runner();
  const firstSource = new Uint8Array([0, 0, 0, 255, ...white, ...black]);
  const secondSource = new Uint8Array([100, 100, 100, 255, ...white, ...black]);
  const expected = new Uint8Array([200, 200, 200, 255, ...white, ...black]);
  for (const [index, pixels] of [firstSource, secondSource].entries()) {
    const sourceBytes = png(pixels),
      referenceBytes = png(expected),
      sourcePath = `contrast-${index}.png`,
      referencePath = `contrast-reference-${index}.png`;
    await writeFile(join(f.corpus, sourcePath), sourceBytes);
    await writeFile(join(f.corpus, referencePath), referenceBytes);
    f.decoded.set(hash(sourceBytes), pixels);
    f.decoded.set(hash(referenceBytes), expected);
    Object.assign(f.manifest.cases[index], {
      path: sourcePath,
      sourceHash: hash(sourceBytes),
      referencePath,
      referenceHash: hash(referenceBytes),
    });
  }
  await f.save();
  runner.render = async ({ source: input }) => ({
    output:
      input.dataUrl === `data:image/png;base64,${png(firstSource).toString('base64')}`
        ? new Uint8Array([100, 100, 100, 255, ...white, ...black])
        : new Uint8Array([150, 150, 150, 255, ...white, ...black]),
    version: 'continuous-residue',
  });
  const result = await run(f, runner);
  assert.deepEqual(
    result.summary.cases.map((entry) => entry.metrics.remainingFraction),
    [0.5, 0.5]
  );
  assert.equal(result.summary.metrics.remainingFraction, 0.5);
  assert.equal(result.summary.groups.fixture.remainingFraction, 0.5);
});

test('records structured repeat-render noise and refuses an undersized frozen threshold', async (t) => {
  const f = await fixture(t),
    initial = await run(f, f.runner());
  assert.deepEqual(initial.summary.provenance.calibration.measuredRepeatNoise, {
    sourceMaxChannel: 0,
    referenceMaxChannel: 0,
  });
  assert.equal(initial.summary.provenance.calibration.evidenceComplete, true);
  f.manifest.cases[1].repeatNoise.referenceMaxChannel = 2;
  await f.save();
  const runner = f.runner(),
    refused = await run(f, runner);
  assert.equal(refused.summary.status, 'incomplete');
  assert.equal(refused.summary.error.classification, 'oracle-error');
  assert.equal(runner.calls.length, 0);
  assert.deepEqual(refused.summary.provenance.calibration.measuredRepeatNoise, {
    sourceMaxChannel: 0,
    referenceMaxChannel: 2,
  });
});

test('cancellation during artifact encoding cannot publish the current case or a complete baseline', async (t) => {
  const f = await fixture(t),
    runner = f.runner(),
    controller = new AbortController();
  let started,
    release,
    encodes = 0;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const encodingStarted = new Promise((resolve) => {
    started = resolve;
  });
  runner.encodePng = async (pixels) => {
    if (++encodes === 3) {
      started();
      await held;
    }
    return png(pixels);
  };
  const running = run(f, runner, { signal: controller.signal, artifacts: 'all' });
  await encodingStarted;
  controller.abort();
  release();
  const result = await running;
  assert.equal(result.summary.status, 'cancelled');
  assert.equal(result.summary.error.classification, 'cancelled');
  assert.notEqual(result.exitCode, 0);
  assert.equal(result.summary.complete, false);
  assert.equal(result.summary.cases.length, 1);
  assert.equal(result.summary.cases[0].caseId, 'case-a');
  assert.ok(await readFile(join(result.out, 'artifacts/case-a-output.png')));
  assert.equal(runner.closed, 1);
});

test('actual Worker PNG bridge preserves immutable source bytes outside its ROI including alpha', async (t) => {
  const f = await fixture(t),
    defaults = await run(f, f.runner());
  const canvas = createCanvas(96, 48),
    context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, 96, 48);
  const translucent = context.createImageData(1, 1);
  translucent.data.set([255, 0, 0, 128]);
  context.putImageData(translucent, 0, 0);
  context.clearRect(1, 0, 1, 1);
  context.fillStyle = '#000000';
  context.fillRect(34, 12, 4, 16);
  const bytes = canvas.toBuffer('image/png'),
    immutable = Buffer.from(bytes),
    region = { x: 28, y: 8, width: 24, height: 32 };
  const runner = await createBrowserRunner({ manifestPath: f.manifestPath });
  try {
    const before = await runner.decodePng(bytes, 96, 48);
    const result = await runner.render({
      source: {
        dataUrl: `data:image/png;base64,${bytes.toString('base64')}`,
        width: 96,
        height: 48,
      },
      region,
      settings: defaults.summary.settings,
    });
    assert.equal(result.output.length, before.length);
    assert.equal(typeof result.version, 'string');
    for (let y = 0; y < 48; y++)
      for (let x = 0; x < 96; x++)
        if (
          x < region.x ||
          x >= region.x + region.width ||
          y < region.y ||
          y >= region.y + region.height
        ) {
          const offset = (y * 96 + x) * 4;
          assert.deepEqual(
            result.output.subarray(offset, offset + 4),
            before.subarray(offset, offset + 4)
          );
        }
    assert.deepEqual(result.output.subarray(0, 8), new Uint8Array([255, 0, 0, 128, 0, 0, 0, 0]));
    const saved = await runner.encodePng(result.output, 96, 48),
      decoded = await runner.decodePng(saved, 96, 48);
    assert.deepEqual(decoded.subarray(0, 8), before.subarray(0, 8));
    assert.deepEqual(bytes, immutable);
  } finally {
    await runner.close();
  }
});

test('explicit frozen corpus replay bypasses generation and keeps original baseline identity', async (t) => {
  const f = await fixture(t),
    baseline = await run(f, f.runner());
  const baselinePath = join(baseline.out, 'summary.json'),
    original = await readFile(baselinePath);
  let generated = 0,
    admitted = 0;
  const candidate = await runBench(
    { corpus: f.manifestPath, out: f.out(), artifacts: 'none', baseline: baselinePath },
    {
      generate: async () => {
        generated++;
        return f.generated;
      },
      loadFrozen: async (path) => {
        admitted++;
        assert.equal(path, f.manifestPath);
        return f.generated;
      },
      createRunner: async () => f.runner(),
    }
  );
  assert.equal(generated, 0);
  assert.equal(admitted, 1);
  assert.equal(candidate.summary.status, 'pass');
  assert.equal(candidate.summary.corpus.fingerprint, baseline.summary.corpus.fingerprint);
  assert.equal(candidate.summary.provenance.input.mode, 'frozen-explicit');
  assert.deepEqual(await readFile(baselinePath), original);
});

test('explicit frozen metadata and generation-only flags cannot conflict through the API', async (t) => {
  const f = await fixture(t);
  let generated = 0;
  const dependencies = {
    generate: async () => {
      generated++;
      return f.generated;
    },
    loadFrozen: async () => f.generated,
    createRunner: async () => f.runner(),
  };
  for (const extra of [
    { profile: 'full' },
    { seed: 2 },
    { fontConfig: 'fonts.json' },
    { holdoutRevision: 2 },
  ]) {
    const result = await runBench(
      { corpus: f.manifestPath, out: f.out(), artifacts: 'none', ...extra },
      dependencies
    );
    assert.equal(result.summary.status, 'incomplete');
    assert.equal(result.summary.error.classification, 'argument-error');
    assert.notEqual(result.exitCode, 0);
  }
  assert.equal(generated, 0);
});

test('CLI accepts frozen input and exact versioned holdout choices without generation conflicts', () => {
  assert.deepEqual(
    parseBenchArgs(['--corpus', 'old/manifest.json', '--profile', 'full', '--seed', '1']),
    { caseIds: [], corpus: 'old/manifest.json', profile: 'full', seed: 1 }
  );
  assert.deepEqual(parseBenchArgs(['--holdout-revision', '2']), {
    caseIds: [],
    holdoutRevision: 2,
  });
  for (const args of [
    ['--corpus', 'old.json', '--font-config', 'fonts.json'],
    ['--corpus', 'old.json', '--holdout-revision', '1'],
    ['--holdout-revision', '0'],
    ['--holdout-revision', '3'],
    ['--holdout-revision', '01'],
    ['--holdout-revision', '1.0'],
    ['--holdout-revision', '2e0'],
  ])
    assert.throws(() => parseBenchArgs(args), { classification: 'argument-error' });
});

test('frozen replay preserves old input identity and baseline comparison', async (t) => {
  const f = await fixture(t);
  const baseline = await run(f, f.runner());
  const baselinePath = join(baseline.out, 'summary.json');
  const baselineBytes = await readFile(baselinePath);
  let generated = 0;
  const result = await runBench(
    {
      corpus: f.manifestPath,
      profile: 'smoke',
      seed: 1,
      out: f.out(),
      artifacts: 'none',
      baseline: baselinePath,
    },
    {
      generate: async () => {
        generated++;
        throw new Error('Frozen replay must not generate');
      },
      createRunner: async () => f.runner(),
    }
  );
  assert.equal(generated, 0);
  assert.equal(result.summary.status, 'pass');
  assert.equal(result.summary.corpus.generatorVersion, 'fixture-v1');
  assert.equal(result.summary.corpus.fingerprint, f.manifest.fingerprint);
  assert.equal(result.summary.provenance.input.mode, 'frozen-explicit');
  assert.equal(result.summary.provenance.input.manifestPath, f.manifestPath);
  assert.deepEqual(await readFile(baselinePath), baselineBytes);
});

test('frozen admission rejects missing sidecars and changed manifest or resource bytes before compute', async (t) => {
  for (const corruption of [
    'missing-sidecar',
    'changed-sidecar',
    'changed-manifest',
    'changed-resource',
  ]) {
    const f = await fixture(t);
    if (corruption === 'missing-sidecar') await rm(join(f.corpus, 'manifest.sha256'));
    if (corruption === 'changed-sidecar')
      await writeFile(join(f.corpus, 'manifest.sha256'), hash('changed'));
    if (corruption === 'changed-manifest')
      await writeFile(f.manifestPath, `${JSON.stringify(f.manifest)}\n`);
    if (corruption === 'changed-resource')
      await writeFile(join(f.corpus, 'source.png'), png(reference));
    let generated = 0,
      started = 0;
    const result = await runBench(
      { corpus: f.manifestPath, out: f.out(), artifacts: 'none' },
      {
        generate: async () => {
          generated++;
          return f.generated;
        },
        createRunner: async () => {
          started++;
          return f.runner();
        },
      }
    );
    assert.equal(result.summary.status, 'incomplete', corruption);
    assert.equal(result.exitCode, 2, corruption);
    assert.equal(result.summary.counts.completed, 0, corruption);
    assert.equal(generated, 0, corruption);
    assert.equal(started, 0, corruption);
    assert.equal(result.summary.error.classification, 'generation-error', corruption);
  }
});

test('generation receives the selected holdout revision and rejects nonnumeric API revisions', async (t) => {
  const f = await fixture(t);
  let received;
  const result = await runBench(
    { holdoutRevision: 2, out: f.out(), artifacts: 'none' },
    {
      generate: async (options) => {
        received = options;
        return f.generated;
      },
      createRunner: async () => f.runner(),
    }
  );
  assert.equal(result.summary.status, 'baseline');
  assert.equal(result.summary.provenance.input.mode, 'generated');
  assert.equal(received.holdoutRevision, 2);
  for (const holdoutRevision of [0, 3, '1', '2', NaN, 1.5]) {
    const refused = await runBench(
      { holdoutRevision, out: f.out(), artifacts: 'none' },
      {
        generate: async () => {
          assert.fail('Invalid revision must not generate');
        },
      }
    );
    assert.equal(refused.summary.error.classification, 'argument-error');
    assert.equal(refused.exitCode, 2);
  }
});

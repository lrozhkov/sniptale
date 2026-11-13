import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, mkdir, symlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { watch } from 'node:fs';
import { createCanvas, loadImage } from 'canvas';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { generateCorpus, loadFrozenCorpus } from './corpus.mjs';
import { verifyBrowserFonts } from './corpus-fonts.mjs';

test('offline paired corpus repeats pixels/annotations and validates reuse without overwrite', async () => {
  const root = await mkdtemp(join(tmpdir(), 'simplify-generated-proof-'));
  try {
    const first = await generateCorpus({ seed: 19, out: join(root, 'first') });
    const second = await generateCorpus({ seed: 19, out: join(root, 'second') });
    assert.deepEqual(second.manifest, first.manifest);
    assert.deepEqual(await loadFrozenCorpus(first.manifestPath), first);
    const refreshed = await generateCorpus({
      seed: 19,
      holdoutRevision: 2,
      out: join(root, 'refreshed'),
    });
    assert.equal(refreshed.manifest.holdoutRevision, 2);
    assert.deepEqual(refreshed.manifest.splitDefinition.holdout, ['forms', 'timeline']);
    assert.deepEqual(
      refreshed.manifest.cases.filter((entry) => entry.split === 'tuning'),
      first.manifest.cases.filter((entry) => entry.split === 'tuning')
    );
    for (const entry of refreshed.manifest.cases) {
      assert.equal(entry.repeatNoise.sourceMaxChannel, 0);
      assert.equal(entry.repeatNoise.referenceMaxChannel, 0);
      assert.ok(
        entry.fontEvidence.every((evidence) => evidence.rendered.every((font) => font.isCustomFont))
      );
      if (entry.fragments.length) {
        assert.ok(entry.roiEvidence.insideInkPixels > 0);
        assert.equal(entry.roiEvidence.outsideInkPixels > 0, entry.roiEvidence.kind === 'partial');
      }
    }
    assert.deepEqual(await loadFrozenCorpus(refreshed.manifestPath), refreshed);
    assert.equal(first.manifest.cases.length, 8);
    for (const entry of first.manifest.cases) {
      const roi = entry.roiEvidence;
      if (roi.kind === 'negative') assert.equal(entry.fragments.length, 0);
      else {
        assert.ok(roi.insideInkPixels > 0);
        assert.equal(roi.outsideInkPixels > 0, roi.kind === 'partial');
        if (roi.kind === 'edge') {
          assert.equal(roi.touchesLeft, true);
          assert.equal(roi.touchesTop, true);
          assert.equal(entry.region.x, entry.fragments[0].inkBounds.x);
          assert.equal(entry.region.y, entry.fragments[0].inkBounds.y);
        }
        assert.equal([...entry.fragments[6].text].length, 1);
        assert.ok(
          entry.fragments.every(
            (fragment) => fragment.inkPixels > 0 && fragment.inkBounds.width > 0
          )
        );
      }
    }
    assert.ok(
      first.manifest.cases.every(
        (entry) =>
          entry.repeatNoise.sourceMaxChannel === 0 && entry.repeatNoise.referenceMaxChannel === 0
      )
    );
    assert.ok(
      first.manifest.cases.some((entry) => entry.shaping?.connected < entry.shaping?.disconnected)
    );
    assert.ok(
      first.manifest.cases
        .flatMap((entry) => entry.fontEvidence)
        .every((entry) => entry.rendered.every((font) => font.isCustomFont))
    );
    assert.deepEqual(await generateCorpus({ seed: 19, out: join(root, 'first') }), first);
    await assert.rejects(
      generateCorpus({ seed: 20, out: join(root, 'first') }),
      /identity differs/
    );
    const manifestBytes = await readFile(first.manifestPath, 'utf8');
    await writeFile(first.manifestPath, manifestBytes.replace('"seed": 19', '"seed": 20'));
    await assert.rejects(
      generateCorpus({ seed: 19, out: join(root, 'first') }),
      /not a complete corpus/
    );
    await writeFile(first.manifestPath, manifestBytes);
    await writeFile(join(root, 'first', first.manifest.cases[0].inkMaskPath), 'corrupted');
    await assert.rejects(generateCorpus({ seed: 19, out: join(root, 'first') }), /hash differs/);
    await writeFile(join(root, 'foreign.txt'), 'preserved');
    await assert.rejects(generateCorpus({ seed: 19, out: root }), /not a complete corpus/);
    assert.equal(await readFile(join(root, 'foreign.txt'), 'utf8'), 'preserved');
    await assert.rejects(generateCorpus({ signal: AbortSignal.abort() }), { kind: 'cancelled' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('frozen replay admits prior generators and refuses corrupt or foreign oracle resources', async () => {
  const root = await mkdtemp(join(tmpdir(), 'simplify-frozen-admission-'));
  const directory = join(root, 'corpus');
  const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const png = (colors) => {
    const canvas = createCanvas(3, 1),
      context = canvas.getContext('2d');
    colors.forEach((color, x) => {
      context.fillStyle = color;
      context.fillRect(x, 0, 1, 1);
    });
    return canvas.toBuffer('image/png');
  };
  try {
    await mkdir(directory);
    const resources = {
      source: png(['black', 'white', '#334455']),
      reference: png(['white', 'white', '#334455']),
      ink: png(['white', 'black', 'black']),
      protected: png(['black', 'black', 'white']),
    };
    for (const [name, bytes] of Object.entries(resources))
      await writeFile(join(directory, `${name}.png`), bytes);
    const entry = {
      id: 'prior-case',
      width: 3,
      height: 1,
      region: { x: 0, y: 0, width: 3, height: 1 },
      split: 'tuning',
      tags: [],
      fragments: [
        { id: 'glyph', text: 'W', tags: [], rects: [{ x: 0, y: 0, width: 1, height: 1 }] },
      ],
      path: 'source.png',
      sourceHash: digest(resources.source),
      referencePath: 'reference.png',
      referenceHash: digest(resources.reference),
      inkMaskPath: 'ink.png',
      inkMaskHash: digest(resources.ink),
      protectedMaskPath: 'protected.png',
      protectedMaskHash: digest(resources.protected),
    };
    const manifest = {
      schemaVersion: 1,
      status: 'complete',
      fingerprint: '1'.repeat(64),
      seed: 1,
      profile: 'smoke',
      generatorVersion: 'prior-generator',
      recipeVersion: 'prior-recipe',
      generatorSources: { 'corpus.mjs': '2'.repeat(64) },
      renderEnvironment: {},
      splitDefinition: {},
      fonts: [{ sha256: '3'.repeat(64) }],
      cases: [entry],
    };
    const manifestPath = join(directory, 'manifest.json');
    const publish = async () => {
      const bytes = JSON.stringify(manifest);
      await writeFile(manifestPath, bytes);
      await writeFile(join(directory, 'manifest.sha256'), digest(bytes));
    };
    await publish();
    assert.deepEqual((await loadFrozenCorpus(manifestPath)).manifest, manifest);
    await writeFile(join(directory, 'manifest.sha256'), '0'.repeat(64));
    await assert.rejects(loadFrozenCorpus(manifestPath), /manifest hash differs/);
    await publish();
    await writeFile(join(directory, 'ink.png'), 'corrupted');
    await assert.rejects(loadFrozenCorpus(manifestPath), /hash differs/);
    await writeFile(join(directory, 'ink.png'), png(['#888888', 'black', 'black']));
    entry.inkMaskHash = digest(await readFile(join(directory, 'ink.png')));
    await publish();
    await assert.rejects(loadFrozenCorpus(manifestPath), { kind: 'oracle-error' });
    await writeFile(join(directory, 'ink.png'), resources.ink);
    entry.inkMaskHash = digest(resources.ink);
    entry.region.width = 4;
    await publish();
    await assert.rejects(loadFrozenCorpus(manifestPath), /geometry/);
    entry.region.width = 3;
    entry.inkMaskPath = '../foreign.png';
    await writeFile(join(root, 'foreign.png'), resources.ink);
    await publish();
    await assert.rejects(loadFrozenCorpus(manifestPath), /escapes corpus/);
    entry.inkMaskPath = 'external.png';
    await symlink(join(root, 'foreign.png'), join(directory, 'external.png'));
    await publish();
    await assert.rejects(loadFrozenCorpus(manifestPath), /escapes corpus/);
    entry.inkMaskPath = 'ink.png';
    await writeFile(join(directory, 'ink.png'), png(['black', 'black', 'black']));
    entry.inkMaskHash = digest(await readFile(join(directory, 'ink.png')));
    await publish();
    await assert.rejects(loadFrozenCorpus(manifestPath), /paired source pixels/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('browser identity refuses an unverified system fallback', async () => {
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
  try {
    const page = await browser.newPage();
    await page.setContent(
      '<span data-fragment="missing" style="font-family:UninstalledCorpusFont">Text</span>'
    );
    await assert.rejects(
      verifyBrowserFonts(
        page,
        [{ id: 'missing', fontId: 'missing' }],
        [{ id: 'missing', family: 'UninstalledCorpusFont' }]
      ),
      { kind: 'font-error' }
    );
  } finally {
    await browser.close();
  }
});

test('mid-generation cancellation preserves published pixels and refuses retry into incomplete output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'simplify-cancelled-generation-'));
  const directory = join(root, 'partial'),
    controller = new AbortController();
  const observer = watch(root, { recursive: true }, (_event, filename) => {
    if (filename === join('partial', 'rows-sans.png')) controller.abort();
  });
  try {
    await assert.rejects(generateCorpus({ out: directory, signal: controller.signal }), {
      kind: 'cancelled',
    });
    assert.equal(controller.signal.aborted, true);
    const firstPath = join(directory, 'rows-sans.png'),
      bytes = await readFile(firstPath);
    const decoded = await loadImage(bytes);
    assert.equal(decoded.width, 1920);
    assert.equal(decoded.height, 1520);
    const markerPath = join(directory, 'generation-error.json'),
      marker = await readFile(markerPath);
    assert.equal(JSON.parse(marker).kind, 'cancelled');
    await assert.rejects(readFile(join(directory, 'manifest.json')), { code: 'ENOENT' });
    await assert.rejects(generateCorpus({ out: directory }), /not a complete corpus/);
    assert.deepEqual(await readFile(firstPath), bytes);
    assert.deepEqual(await readFile(markerPath), marker);
  } finally {
    observer.close();
    await rm(root, { recursive: true, force: true });
  }
});

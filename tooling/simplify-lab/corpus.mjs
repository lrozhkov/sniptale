import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir, realpath } from 'node:fs/promises';
import { dirname, basename, resolve, relative, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  recipesFor,
  requiredFontText,
  RECIPE_VERSION,
  CORPUS_VIEWPORT,
  splitDefinitionFor,
} from './corpus-recipes.mjs';
import { verifyFonts } from './corpus-fonts.mjs';
import { renderCorpusCase, decodeCorpusPng, CORPUS_RASTER_RUNTIME } from './corpus-render.mjs';

export const GENERATOR_VERSION = '1';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const failure = (kind, message) => Object.assign(new Error(message), { kind });
const checkAbort = (signal) => {
  if (signal?.aborted) throw failure('cancelled', 'Corpus generation cancelled');
};

const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const validHash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const validId = (value) => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,99}$/.test(value);
const positive = (value) => Number.isSafeInteger(value) && value > 0;
const strings = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string');

function validRectangle(value, width, height, integer = false) {
  return (
    record(value) &&
    [value.x, value.y, value.width, value.height].every(
      (number) => Number.isFinite(number) && (!integer || Number.isSafeInteger(number))
    ) &&
    value.x >= 0 &&
    value.y >= 0 &&
    value.width > 0 &&
    value.height > 0 &&
    value.x + value.width <= width &&
    value.y + value.height <= height
  );
}

function validateFrozenCase(entry) {
  if (
    !record(entry) ||
    !validId(entry.id) ||
    !positive(entry.width) ||
    !positive(entry.height) ||
    entry.width * entry.height > 16_777_216 ||
    !validRectangle(entry.region, entry.width, entry.height, true) ||
    !['tuning', 'holdout'].includes(entry.split) ||
    !strings(entry.tags) ||
    !Array.isArray(entry.fragments)
  )
    throw failure('generation-error', 'Invalid frozen corpus case geometry');
  const ids = new Set();
  for (const fragment of entry.fragments) {
    if (
      !record(fragment) ||
      !validId(fragment.id) ||
      ids.has(fragment.id) ||
      typeof fragment.text !== 'string' ||
      !fragment.text.length ||
      !strings(fragment.tags) ||
      !Array.isArray(fragment.rects) ||
      !fragment.rects.length ||
      !fragment.rects.every((rect) => validRectangle(rect, entry.width, entry.height)) ||
      (fragment.inkBounds !== undefined &&
        !validRectangle(fragment.inkBounds, entry.width, entry.height, true)) ||
      (fragment.layoutRects !== undefined &&
        (!Array.isArray(fragment.layoutRects) ||
          !fragment.layoutRects.every((rect) => validRectangle(rect, entry.width, entry.height))))
    )
      throw failure('generation-error', 'Invalid frozen fragment geometry');
    ids.add(fragment.id);
  }
}

function validateFrozenPixels(entry, images) {
  const [source, reference, ink, protectedPixels] = images;
  let protectedCount = 0;
  const counts = new Map(entry.fragments.map((fragment) => [fragment.id, 0]));
  for (let offset = 0; offset < ink.data.length; offset += 4) {
    const changed = [0, 1, 2, 3].some(
      (channel) => source.data[offset + channel] !== reference.data[offset + channel]
    );
    if (Boolean(ink.data[offset]) !== changed || (ink.data[offset] && protectedPixels.data[offset]))
      throw failure('oracle-error', 'Frozen masks disagree with paired source pixels');
    if (protectedPixels.data[offset]) protectedCount++;
    if (!ink.data[offset]) continue;
    const x = (offset / 4) % entry.width,
      y = Math.floor(offset / 4 / entry.width);
    const owner = entry.fragments.find((fragment) =>
      fragment.rects.some(
        (rect) =>
          x >= rect.x - 1 &&
          x < rect.x + rect.width + 1 &&
          y >= rect.y - 1 &&
          y < rect.y + rect.height + 1
      )
    );
    if (!owner) throw failure('oracle-error', 'Frozen ink is outside fragment geometry');
    counts.set(owner.id, counts.get(owner.id) + 1);
  }
  if (!protectedCount || [...counts.values()].some((count) => !count))
    throw failure('oracle-error', 'Frozen oracle omits visible text or protected geometry');
}

async function verifyExisting(directory, manifest) {
  const boundary = await realpath(directory);
  for (const entry of manifest.cases) {
    validateFrozenCase(entry);
    const images = [];
    for (const [pathKey, hashKey] of [
      ['path', 'sourceHash'],
      ['referencePath', 'referenceHash'],
      ['inkMaskPath', 'inkMaskHash'],
      ['protectedMaskPath', 'protectedMaskHash'],
    ]) {
      if (
        typeof entry[pathKey] !== 'string' ||
        isAbsolute(entry[pathKey]) ||
        !entry[pathKey].endsWith('.png') ||
        !validHash(entry[hashKey])
      )
        throw failure('generation-error', 'Invalid existing artifact path');
      const absolute = await realpath(resolve(directory, entry[pathKey]));
      const scoped = relative(boundary, absolute);
      if (scoped.startsWith('..') || isAbsolute(scoped))
        throw failure('generation-error', 'Existing artifact escapes corpus');
      const bytes = await readFile(absolute);
      if (hash(bytes) !== entry[hashKey])
        throw failure('generation-error', 'Existing corpus artifact hash differs');
      if (
        bytes.length > 40_000_000 ||
        bytes.length < 24 ||
        bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
        bytes.readUInt32BE(16) !== entry.width ||
        bytes.readUInt32BE(20) !== entry.height
      )
        throw failure('generation-error', 'Frozen PNG header or dimensions differ');
      const image = await decodeCorpusPng(bytes);
      images.push(image);
      if (image.width !== entry.width || image.height !== entry.height)
        throw failure('generation-error', 'Existing corpus dimensions differ');
      if (pathKey.endsWith('MaskPath'))
        for (let index = 0; index < image.data.length; index += 4) {
          if (
            ![0, 255].includes(image.data[index]) ||
            image.data[index + 1] !== image.data[index] ||
            image.data[index + 2] !== image.data[index] ||
            image.data[index + 3] !== 255
          )
            throw failure('oracle-error', 'Existing mask is not binary opaque grayscale');
        }
    }
    validateFrozenPixels(entry, images);
  }
  return { manifest, manifestPath: join(directory, 'manifest.json') };
}

/** Admit immutable generated inputs using their own integrity, without invoking the current generator. */
export async function loadFrozenCorpus(manifestPath) {
  try {
    if (typeof manifestPath !== 'string' || !manifestPath.length)
      throw failure('generation-error', 'Frozen corpus manifest path is required');
    const canonical = await realpath(resolve(manifestPath));
    if (basename(canonical) !== 'manifest.json')
      throw failure('generation-error', 'Expected generated manifest.json');
    const directory = dirname(canonical),
      bytes = await readFile(canonical);
    const expected = (await readFile(join(directory, 'manifest.sha256'), 'utf8')).trim();
    if (!validHash(expected) || hash(bytes) !== expected)
      throw failure(
        'generation-error',
        'Existing output is not a complete corpus: manifest hash differs'
      );
    const manifest = JSON.parse(bytes.toString('utf8'));
    if (
      !record(manifest) ||
      manifest.schemaVersion !== 1 ||
      manifest.status !== 'complete' ||
      !validHash(manifest.fingerprint) ||
      !['smoke', 'full'].includes(manifest.profile) ||
      !Number.isSafeInteger(manifest.seed) ||
      manifest.seed < 0 ||
      manifest.seed > 0xffffffff ||
      typeof manifest.generatorVersion !== 'string' ||
      typeof manifest.recipeVersion !== 'string' ||
      !record(manifest.renderEnvironment) ||
      !record(manifest.splitDefinition) ||
      !Array.isArray(manifest.fonts) ||
      !manifest.fonts.length ||
      !manifest.fonts.every((font) => record(font) && validHash(font.sha256)) ||
      !Array.isArray(manifest.cases) ||
      !manifest.cases.length ||
      manifest.cases.length > 100 ||
      new Set(manifest.cases.map((entry) => entry?.id)).size !== manifest.cases.length ||
      (manifest.holdoutRevision !== undefined && ![1, 2].includes(manifest.holdoutRevision))
    )
      throw failure('generation-error', 'Existing output is not a complete generated corpus');
    return await verifyExisting(directory, manifest);
  } catch (error) {
    if (error.kind) throw error;
    throw failure('generation-error', `Existing output is not a complete corpus: ${error.message}`);
  }
}

/** Generate the full local oracle corpus, or verify exact artifacts before reuse. */
export async function generateCorpus({
  profile = 'smoke',
  seed = 1,
  holdoutRevision = 1,
  out,
  fontConfig,
  signal,
} = {}) {
  checkAbort(signal);
  const cases = recipesFor({ profile, seed, holdoutRevision });
  if (!cases.length) throw failure('generation-error', 'Corpus selection is empty');
  const fonts = await verifyFonts({ fontConfig, textByFace: requiredFontText(cases) });
  const generatorSources = await Promise.all(
    ['corpus.mjs', 'corpus-recipes.mjs', 'corpus-fonts.mjs', 'corpus-render.mjs'].map(
      async (name) => [name, hash(await readFile(new URL(name, import.meta.url)))]
    )
  );
  const browser = await chromium.launch({
    headless: true,
    chromiumSandbox: true,
    args: ['--force-color-profile=srgb', '--font-render-hinting=none'],
  });
  let directory,
    owned = false;
  try {
    const renderEnvironment = {
      chromium: browser.version(),
      viewport: CORPUS_VIEWPORT,
      deviceScaleFactors: [...new Set(cases.map((entry) => entry.dpr))].sort(),
      locale: 'en-US',
      colorScheme: 'light',
      colorProfile: 'srgb',
      fontHinting: 'none',
      platform: process.platform,
      architecture: process.arch,
      offline: true,
      rasterRuntime: CORPUS_RASTER_RUNTIME,
    };
    const publicFonts = fonts.map(({ base64: _base64, charset: _charset, ...font }) => font);
    const fingerprint = hash(
      JSON.stringify({
        seed,
        holdoutRevision,
        profile,
        recipeVersion: RECIPE_VERSION,
        generatorVersion: GENERATOR_VERSION,
        generatorSources,
        renderEnvironment,
        fonts: publicFonts.map(({ path: _path, licensePath: _licensePath, ...font }) => font),
        cases,
      })
    );
    directory = resolve(out ?? join(root, '.tmp/simplify-corpus', fingerprint));
    try {
      await readdir(directory);
      const existing = await loadFrozenCorpus(join(directory, 'manifest.json'));
      if (
        existing.manifest.fingerprint !== fingerprint ||
        existing.manifest.cases.map((entry) => entry.id).join('\n') !==
          cases.map((entry) => entry.id).join('\n') ||
        JSON.stringify(existing.manifest.generatorSources) !==
          JSON.stringify(Object.fromEntries(generatorSources))
      )
        throw failure('generation-error', 'Existing corpus identity differs');
      return existing;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await mkdir(dirname(directory), { recursive: true });
    await mkdir(directory);
    owned = true;
    const manifest = {
      schemaVersion: 1,
      status: 'complete',
      fingerprint,
      seed,
      holdoutRevision,
      profile,
      generatorVersion: GENERATOR_VERSION,
      recipeVersion: RECIPE_VERSION,
      generatorSources: Object.fromEntries(generatorSources),
      renderEnvironment,
      fonts: publicFonts,
      splitDefinition: splitDefinitionFor(holdoutRevision),
      cases: [],
    };
    for (const entry of cases) {
      checkAbort(signal);
      const rendered = await renderCorpusCase(browser, entry, fonts, signal);
      const artifacts = {};
      for (const [key, filename] of [
        ['source', `${entry.id}.png`],
        ['reference', `${entry.id}-reference.png`],
        ['inkMask', `${entry.id}-ink.png`],
        ['protectedMask', `${entry.id}-protected.png`],
      ]) {
        await writeFile(join(directory, filename), rendered[key], { flag: 'wx' });
        artifacts[key === 'source' ? 'path' : `${key}Path`] = filename;
        artifacts[`${key}Hash`] = hash(rendered[key]);
      }
      await writeFile(join(directory, `${entry.id}.html`), rendered.html, { flag: 'wx' });
      const dpr = entry.dpr;
      manifest.cases.push({
        id: entry.id,
        ...artifacts,
        width: CORPUS_VIEWPORT.width * dpr,
        height: CORPUS_VIEWPORT.height * dpr,
        dpr,
        region: rendered.region,
        roiEvidence: rendered.roiEvidence,
        split: entry.split,
        tags: entry.tags,
        family: entry.family,
        fragments: rendered.fragments,
        repeatNoise: rendered.noise,
        fontEvidence: rendered.fontEvidence,
        shaping: rendered.shaping,
      });
    }
    const manifestBytes = JSON.stringify(manifest, null, 2);
    await writeFile(join(directory, 'manifest.sha256'), hash(manifestBytes), { flag: 'wx' });
    await writeFile(join(directory, 'manifest.json'), manifestBytes, {
      flag: 'wx',
    });
    return { manifest, manifestPath: join(directory, 'manifest.json') };
  } catch (error) {
    if (owned)
      await writeFile(
        join(directory, 'generation-error.json'),
        JSON.stringify(
          {
            schemaVersion: 1,
            status: 'incomplete',
            kind: error.kind ?? 'generation-error',
            message: error.message,
          },
          null,
          2
        ),
        { flag: 'wx' }
      ).catch(() => undefined);
    throw error;
  } finally {
    await browser.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2),
    options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = {
      '--profile': 'profile',
      '--seed': 'seed',
      '--holdout-revision': 'holdoutRevision',
      '--out': 'out',
      '--font-config': 'fontConfig',
    }[args[index]];
    if (!key || !args[index + 1] || args[index + 1].startsWith('--'))
      throw new Error(`Invalid corpus argument: ${args[index]}`);
    options[key] = ['seed', 'holdoutRevision'].includes(key)
      ? Number(args[index + 1])
      : args[index + 1];
  }
  try {
    console.log((await generateCorpus(options)).manifestPath);
  } catch (error) {
    console.error(
      JSON.stringify({
        status: 'incomplete',
        kind: error.kind ?? 'generation-error',
        message: error.message,
      })
    );
    process.exitCode = 1;
  }
}

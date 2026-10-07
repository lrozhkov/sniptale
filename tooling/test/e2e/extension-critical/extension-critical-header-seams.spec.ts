import { writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { expect, test } from '@playwright/test';

test('browser header slices and video join stay opaque through fractional zoom', async ({
  page,
}, info) => {
  test.setTimeout(150_000);
  const bundle = await build({
    entryPoints: ['tooling/test/e2e/support/header-seams-probe.ts'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    loader: { '.svg': 'text', '.woff2': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const result = await page.evaluate(async (text) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
    try {
      return await (await import(url)).probeHeaderSeams();
    } finally {
      URL.revokeObjectURL(url);
    }
  }, bundle.outputFiles[0]!.text);
  await writeFile(info.outputPath('header-seams.json'), JSON.stringify(result, null, 2));
  await page.screenshot({ path: info.outputPath('header-seams.png'), fullPage: false });
  for (const sample of result) {
    expect.soft(sample.slices.minAlpha, JSON.stringify(sample)).toBe(255);
    for (const seam of sample.seams) {
      expect.soft(seam.minAlpha, JSON.stringify({ width: sample.width, ...seam })).toBe(255);
      // Chromium's opaque high-quality interpolation can round RGB by one level depending on the backdrop.
      expect
        .soft(seam.leak, JSON.stringify({ width: sample.width, ...seam }))
        .toBeLessThanOrEqual(1);
    }
  }
});

test('header boundary stroke filters like an internal line during zoom', async ({ page }, info) => {
  const bundle = await build({
    entryPoints: ['tooling/test/e2e/support/header-seams-probe.ts'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    loader: { '.svg': 'text', '.woff2': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const result = await page.evaluate(async (text) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
    try {
      return (await import(url)).probeHeaderJoinFiltering();
    } finally {
      URL.revokeObjectURL(url);
    }
  }, bundle.outputFiles[0]!.text);
  await writeFile(info.outputPath('join-filtering.json'), JSON.stringify(result, null, 2));
  await page.screenshot({ path: info.outputPath('join-filtering.png'), fullPage: false });
  expect(result.maxDifference, JSON.stringify(result.worst)).toBeLessThanOrEqual(1);
});

test('image header join stays opaque across fractional zoom', async ({ page }, info) => {
  const bundle = await build({
    entryPoints: ['tooling/test/e2e/support/header-seams-probe.ts'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    loader: { '.woff2': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const result = await page.evaluate(async (text) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
    try {
      return await (await import(url)).probeImageHeaderJoin();
    } finally {
      URL.revokeObjectURL(url);
    }
  }, bundle.outputFiles[0]!.text);
  await writeFile(info.outputPath('image-header-join.json'), JSON.stringify(result, null, 2));
  await page.screenshot({ path: info.outputPath('image-header-join.png'), fullPage: false });
  for (const sample of result) expect.soft(sample.minAlpha, JSON.stringify(sample)).toBe(255);
});

test('image header preserves transparent rows and consecutive filter changes', async ({
  page,
}, info) => {
  const bundle = await build({
    entryPoints: ['tooling/test/e2e/support/header-seams-probe.ts'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    loader: { '.woff2': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const result = await page.evaluate(async (text) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
    try {
      return await (await import(url)).probeImageHeaderContent();
    } finally {
      URL.revokeObjectURL(url);
    }
  }, bundle.outputFiles[0]!.text);
  await writeFile(info.outputPath('image-header-content.json'), JSON.stringify(result, null, 2));
  expect.soft(result.alpha).toEqual([0, 128, 255]);
  expect.soft(result.fractionalAlpha).toEqual([0, 128, 255]);
  expect(result.reusedFilterElement).toBe(true);
  expect(result.second - result.first).toBeGreaterThan(40);
});

import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { startLab } from './server.mjs';
import { fileURLToPath } from 'node:url';
export async function runLabCheck({
  out = '.tmp/simplify-lab-results',
  corpus,
  target,
  full = false,
  start = startLab,
} = {}) {
  out = resolve(out);
  const sample = ['commerce-books', 'knowledge-wikipedia', 'cyrillic-godot-body'];
  const lab = await start({
    corpus,
    targets: target ? [target] : !full && !corpus ? sample : undefined,
  });
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const results = [],
    acquisitions = [];
  let page,
    failure = null;
  try {
    await mkdir(out, { recursive: true });
    page = await browser.newPage({
      viewport: { width: 1280, height: 560 },
      deviceScaleFactor: 1,
    });
    await page.goto(lab.url);
    await page.waitForFunction(() => globalThis.window.simplifyLab?.ready);
    const cases =
      full || target
        ? lab.config.cases
        : corpus
          ? lab.config.cases.slice(0, 3)
          : lab.config.cases.filter((entry) => sample.includes(entry.id));
    const matrix = [
      { automatic: true, content: 'text', sensitivity: 55, thickness: 0.5, color: null },
      { automatic: true, content: 'all', sensitivity: 10, thickness: 0.35, color: null },
      { automatic: true, content: 'all', sensitivity: 90, thickness: 0.65, color: '#536b84' },
      { automatic: false, manualKind: 'text', sensitivity: 55, thickness: 0.5, color: null },
      { automatic: false, manualKind: 'image', sensitivity: 55, thickness: 0.5, color: '#536b84' },
    ];
    for (const entry of cases) {
      const acquisition = await page.evaluate(
        (id) => globalThis.window.simplifyLab.selectCase(id),
        entry.id
      );
      acquisitions.push({ id: entry.id, ...acquisition });
      if (acquisition?.status !== 'PASS') continue;
      for (let index = 0; index < matrix.length; index++) {
        await page.evaluate(
          (settings) => globalThis.window.simplifyLab.configure(settings),
          matrix[index]
        );
        const result = await page.evaluate(() => globalThis.window.simplifyLab.run());
        assert.ok(result?.version);
        assert.equal(result.caseId, entry.id);
        assert.equal(result.assessment.style, 'unreviewed');
        const bytes = await page
          .locator('#after')
          .evaluate((canvas) => canvas.toDataURL('image/png').split(',')[1]);
        await writeFile(join(out, `${entry.id}-${index}.png`), Buffer.from(bytes, 'base64'));
        results.push(result);
      }
    }
    if (!results.length)
      throw new Error('No site produced a result. Inspect SKIP and FAIL acquisition records.');
    if (acquisitions.at(-1).status !== 'PASS') {
      const completed = results.at(-1);
      const restored = await page.evaluate(
        (id) => globalThis.window.simplifyLab.selectCase(id),
        completed.caseId
      );
      assert.equal(restored.status, 'PASS');
      await page.evaluate(
        (settings) => globalThis.window.simplifyLab.configure(settings),
        completed.settings
      );
      await page.evaluate(() => globalThis.window.simplifyLab.run());
    }
    await page.getByRole('button', { name: 'Сохранить оценку' }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'PNG результата' }).click();
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /\.png$/);
    for (const viewport of [
      { width: 1280, height: 560 },
      { width: 1920, height: 900 },
      { width: 999, height: 700 },
      { width: 1000, height: 700 },
      { width: 1001, height: 700 },
      { width: 649, height: 700 },
      { width: 650, height: 700 },
      { width: 651, height: 700 },
    ]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => globalThis.window.scrollTo(0, 0));
      assert.equal(
        await page.evaluate(
          () => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth
        ),
        false
      );
      await page.screenshot({
        path: join(out, `lab-${viewport.width}x${viewport.height}.png`),
        fullPage: false,
      });
    }
    await page.evaluate(async () => {
      const before = globalThis.document.getElementById('after').toDataURL();
      const pending = globalThis.window.simplifyLab.run();
      globalThis.document.getElementById('cancel').click();
      if (
        (await pending) !== null ||
        globalThis.document.getElementById('after').toDataURL() !== before
      )
        throw new Error('Cancel replaced accepted result');
    });
    await page.evaluate(async (id) => {
      const pending = globalThis.window.simplifyLab.run();
      await globalThis.window.simplifyLab.selectCase(id);
      const late = await pending;
      if (late !== null || !globalThis.document.getElementById('downloadPng').disabled)
        throw new Error('Stale source result accepted');
    }, results[0].caseId);
    await page.locator('#x').fill('36');
    await page.locator('#y').fill('40');
    await page.locator('#width').fill('360');
    await page.locator('#height').fill('100');
    await page.getByRole('button', { name: 'Обработать', exact: true }).click();
    await page.waitForFunction(() => !globalThis.document.getElementById('run').disabled);
    await page.locator('#judge-textResidue').selectOption('unreviewed');
    await page
      .locator('#notes')
      .fill('Automation tests report recording only; visual quality is unreviewed.');
    await page.getByRole('button', { name: 'Сохранить оценку' }).click();
    const report = await page.evaluate(() => globalThis.window.simplifyLab.report());
    assert.equal(report.results.at(-1).region.width, 360);
    assert.equal(
      report.results.at(-1).notes,
      'Automation tests report recording only; visual quality is unreviewed.'
    );
    if (acquisitions.some((entry) => entry.status === 'FAIL'))
      throw new Error('Site capture failed after readiness. Inspect report.json.');
    console.log(
      `Passed ${results.length} current-worker renders; manual quality assessment remains unreviewed. ${out}`
    );
  } catch (error) {
    failure = error.message;
    throw error;
  } finally {
    try {
      const report = await page
        ?.evaluate(() => globalThis.window.simplifyLab.report())
        .catch(() => ({ stamp: lab.config.stamp }));
      await writeFile(
        join(out, 'report.json'),
        JSON.stringify(
          {
            ...report,
            status: failure ? 'FAIL' : 'PASS',
            failure,
            acquisitions,
            matrixResults: results,
          },
          null,
          2
        )
      );
    } finally {
      await browser.close();
      await lab.close();
    }
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--full') continue;
    if (
      ['--corpus', '--out', '--target'].includes(args[index]) &&
      args[index + 1] &&
      !args[index + 1].startsWith('--')
    ) {
      index++;
      continue;
    }
    throw new Error(`Invalid argument: ${args[index]}`);
  }
  await runLabCheck({
    out: option('--out'),
    corpus: option('--corpus'),
    target: option('--target'),
    full: args.includes('--full'),
  });
}

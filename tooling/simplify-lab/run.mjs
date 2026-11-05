import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { startLab } from './server.mjs';
const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
for (let index = 0; index < args.length; index++) {
  if (args[index] === '--full') continue;
  if (
    ['--corpus', '--out'].includes(args[index]) &&
    args[index + 1] &&
    !args[index + 1].startsWith('--')
  ) {
    index++;
    continue;
  }
  throw new Error(`Invalid argument: ${args[index]}`);
}
const out = resolve(option('--out') ?? '.tmp/simplify-lab-results');
const lab = await startLab({ corpus: option('--corpus') });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const results = [];
try {
  await mkdir(out, { recursive: true });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 560 },
    deviceScaleFactor: 1,
  });
  await page.goto(lab.url);
  await page.waitForFunction(
    () =>
      globalThis.window.simplifyLab?.ready && !globalThis.document.getElementById('run').disabled
  );
  const cases = args.includes('--full') ? lab.config.cases : lab.config.cases.slice(0, 3);
  const matrix = [
    { automatic: true, content: 'text', sensitivity: 55, thickness: 0.5, color: null },
    { automatic: true, content: 'all', sensitivity: 10, thickness: 0.35, color: null },
    { automatic: true, content: 'all', sensitivity: 90, thickness: 0.65, color: '#536b84' },
    { automatic: false, manualKind: 'text', sensitivity: 55, thickness: 0.5, color: null },
    { automatic: false, manualKind: 'image', sensitivity: 55, thickness: 0.5, color: '#536b84' },
  ];
  for (const entry of cases) {
    await page.evaluate((id) => globalThis.window.simplifyLab.selectCase(id), entry.id);
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
  await page.evaluate(async () => {
    const pending = globalThis.window.simplifyLab.run();
    await globalThis.window.simplifyLab.selectCase('forms');
    const late = await pending;
    if (late !== null || !globalThis.document.getElementById('downloadPng').disabled)
      throw new Error('Stale source result accepted');
  });
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
  await writeFile(
    join(out, 'report.json'),
    JSON.stringify({ ...report, matrixResults: results }, null, 2)
  );
  console.log(
    `Passed ${results.length} current-worker renders; manual quality assessment remains unreviewed. ${out}`
  );
} finally {
  await browser.close();
  await lab.close();
}

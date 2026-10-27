import { writeFile } from 'node:fs/promises';
import { test, expect } from '../support/extension-fixture';

test('final PNG preserves web, photo, mixed, tall and alpha pixels', async ({
  page,
  extensionId,
}, info) => {
  test.setTimeout(120_000);
  await page.goto(
    `chrome-extension://${extensionId}/tooling/test/harness/screenshot-encoding.html`
  );
  await page.waitForFunction(() => 'screenshotEncodingProof' in window);
  const results = [];
  for (const kind of ['text', 'photo', 'mixed', 'tall', 'alpha', 'tall-alpha'] as const) {
    const result = await page.evaluate(async (kind) => {
      const proof = Reflect.get(window, 'screenshotEncodingProof') as {
        pngProof(kind: string): Promise<{
          before: number;
          after: number;
          width: number;
          height: number;
          exact: boolean;
          elapsedMs: number;
        }>;
      };
      return proof.pngProof(kind);
    }, kind);
    expect(result.exact, kind).toBe(true);
    expect(result.after, kind).toBeLessThanOrEqual(result.before);
    expect(result.width).toBe(1280);
    expect(result.height).toBe(kind === 'tall' || kind === 'tall-alpha' ? 18000 : 900);
    if (kind === 'text' || kind === 'tall' || kind === 'tall-alpha')
      expect(
        result.after,
        `${kind} must finish compression within the optimization budget`
      ).toBeLessThan(result.before * 0.9);
    results.push({ kind, ...result });
  }
  const matrixPath = info.outputPath('compression-matrix.json');
  await writeFile(matrixPath, JSON.stringify(results, null, 2));
  await info.attach('compression-matrix.json', {
    body: JSON.stringify(results, null, 2),
    contentType: 'application/json',
  });
});

test('final JPEG and WebP match one native encode; cancellation remains a failure', async ({
  page,
  extensionId,
}, info) => {
  test.setTimeout(120_000);
  await page.goto(
    `chrome-extension://${extensionId}/tooling/test/harness/screenshot-encoding.html`
  );
  await page.waitForFunction(() => 'screenshotEncodingProof' in window);
  const results = [];
  for (const kind of ['text', 'photo', 'mixed', 'alpha'] as const) {
    const rows = await page.evaluate(async (kind) => {
      const proof = Reflect.get(window, 'screenshotEncodingProof') as {
        formatsProof(
          kind: string
        ): Promise<Array<{ format: string; mime: string; exactSingleEncode: boolean }>>;
      };
      return proof.formatsProof(kind);
    }, kind);
    for (const row of rows) {
      expect(row.mime).toBe(`image/${row.format}`);
      expect(row.exactSingleEncode, `${kind}/${row.format}`).toBe(true);
    }
    results.push({ kind, rows });
  }
  expect(
    await page.evaluate(() =>
      (
        Reflect.get(window, 'screenshotEncodingProof') as { abortProof(): Promise<boolean> }
      ).abortProof()
    )
  ).toBe(true);
  await info.attach('final-format-matrix.json', {
    body: JSON.stringify(results, null, 2),
    contentType: 'application/json',
  });
});

test('image editor final export preserves transparent layers and partial alpha', async ({
  page,
  extensionId,
}) => {
  await page.goto(
    `chrome-extension://${extensionId}/tooling/test/harness/screenshot-encoding.html`
  );
  await page.waitForFunction(() => 'screenshotEncodingProof' in window);
  const result = await page.evaluate(() =>
    (
      Reflect.get(window, 'screenshotEncodingProof') as {
        editorProof(): Promise<{
          exact: boolean;
          transparent: boolean;
          translucent: boolean;
          objects: number;
        }>;
      }
    ).editorProof()
  );
  expect(result).toEqual({ exact: true, transparent: true, translucent: true, objects: 1 });
});

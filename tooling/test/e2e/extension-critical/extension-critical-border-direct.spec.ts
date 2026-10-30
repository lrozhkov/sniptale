import { build } from 'esbuild';
import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('untransformed border strokes match the isolated compositor without scratch canvases', async ({
  page,
}, info) => {
  const bundle = await build({
    stdin: {
      contents: `export {drawSceneBorders} from './apps/extension/src/features/video/composition/draw/border';
export {sceneBorderPath} from './apps/extension/src/features/video/composition/scene-border';`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
  });
  const result = await page.evaluate(async (source) => {
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    try {
      const { drawSceneBorders, sceneBorderPath } = await import(url);
      const actual = document.createElement('canvas'),
        expected = document.createElement('canvas');
      actual.width = expected.width = 240;
      actual.height = expected.height = 160;
      document.body.append(actual, expected);
      let maximum = 0,
        sum = 0,
        samples = 0,
        directAllocations = 0;
      const cases: unknown[] = [];
      for (const style of ['solid', 'dashed', 'dotted'])
        for (const opacity of [1, 0.4])
          for (const clipped of [false, true])
            for (const transformed of [false, true])
              for (const transparent of [false, true]) {
                const a = actual.getContext('2d')!,
                  b = expected.getContext('2d')!;
                for (const c of [a, b]) {
                  c.reset();
                  if (!transparent) {
                    c.fillStyle = '#334455';
                    c.fillRect(0, 0, 240, 160);
                  }
                  c.globalAlpha = 0.7;
                  c.lineJoin = 'bevel';
                  c.lineWidth = 9;
                  c.lineCap = 'round';
                  c.setLineDash([3, 2]);
                  c.beginPath();
                  c.rect(3, 3, 10, 10);
                }
                b.shadowColor = 'rgba(255, 0, 0, 0)';
                const matrix = transformed
                  ? { a: 1.15, b: 0.08, c: -0.04, d: 0.9, e: -8, f: 4 }
                  : undefined;
                if (matrix) {
                  a.setTransform(matrix);
                  b.setTransform(matrix);
                }
                const frames = [
                  {
                    id: 'first',
                    ...sceneBorderPath({ x: 16.5, y: 18.5, width: 207, height: 123 }, 12, true),
                    width: 5,
                    color: transparent ? '#ff880080' : '#ff8800',
                    style,
                    start: 0,
                    end: 1,
                    opacity,
                    dashOffset: -17,
                  },
                  {
                    id: 'second',
                    ...sceneBorderPath({ x: 38, y: 32, width: 150, height: 96 }, 7, true),
                    width: 3,
                    color: '#99eeff',
                    style,
                    start: 0.2,
                    end: 1.2,
                    opacity: 0.5,
                  },
                ];
                const clip = clipped
                  ? { rect: { x: 20, y: 20, width: 198, height: 116 }, radius: 15 }
                  : undefined;
                const state = JSON.stringify([
                  a.globalAlpha,
                  a.lineJoin,
                  a.lineWidth,
                  a.lineCap,
                  a.getLineDash(),
                  a.getTransform(),
                ]);
                const resources = {
                  canvas(_role: string, size: { width: number; height: number }) {
                    if (!transformed) {
                      directAllocations++;
                      throw new Error('Unexpected direct-path allocation');
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = size.width;
                    canvas.height = size.height;
                    return {
                      canvas,
                      context: canvas.getContext('2d')!,
                      release() {
                        canvas.width = canvas.height = 0;
                      },
                    };
                  },
                };
                drawSceneBorders(a, actual, frames, clip, resources, matrix);
                if (
                  JSON.stringify([
                    a.globalAlpha,
                    a.lineJoin,
                    a.lineWidth,
                    a.lineCap,
                    a.getLineDash(),
                    a.getTransform(),
                  ]) !== state
                )
                  throw new Error('Caller state changed');
                drawSceneBorders(b, expected, frames, clip, undefined, matrix);
                if (
                  [
                    { x: 5, y: 5 },
                    { x: 200, y: 100 },
                  ].some(
                    (point) =>
                      a.isPointInPath(point.x, point.y) !== b.isPointInPath(point.x, point.y)
                  )
                )
                  throw new Error('Caller path changed');
                const left = a.getImageData(0, 0, 240, 160).data,
                  right = b.getImageData(0, 0, 240, 160).data;
                let caseMaximum = 0,
                  caseSum = 0;
                for (let i = 0; i < left.length; i += 4) {
                  // Compare visible premultiplied colour; RGB at zero alpha is not a pixel difference.
                  for (let channel = 0; channel < 4; channel++) {
                    const leftValue =
                      channel === 3 ? left[i + 3]! : (left[i + channel]! * left[i + 3]!) / 255;
                    const rightValue =
                      channel === 3 ? right[i + 3]! : (right[i + channel]! * right[i + 3]!) / 255;
                    const delta = Math.abs(leftValue - rightValue);
                    maximum = Math.max(maximum, delta);
                    caseMaximum = Math.max(caseMaximum, delta);
                    caseSum += delta;
                    sum += delta;
                    samples++;
                  }
                }
                cases.push({
                  style,
                  opacity,
                  clipped,
                  transformed,
                  transparent,
                  maximum: caseMaximum,
                  mean: caseSum / left.length,
                });
              }
      return { maximum, mean: sum / samples, directAllocations, cases };
    } finally {
      URL.revokeObjectURL(url);
    }
  }, bundle.outputFiles[0]!.text);
  await page.screenshot({ path: info.outputPath('direct-border.png'), fullPage: false });
  await writeFile(info.outputPath('border-parity.json'), JSON.stringify(result, null, 2));
  expect(result.directAllocations).toBe(0);
  expect(result.maximum).toBeLessThanOrEqual(16);
  expect(result.mean).toBeLessThanOrEqual(0.1);
});

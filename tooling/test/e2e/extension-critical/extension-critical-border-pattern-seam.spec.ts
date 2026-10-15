import { writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { expect, test } from '@playwright/test';

test('rotating border patterns cross the closed seam like an uninterrupted straight line', async ({
  page,
}, info) => {
  const bundle = await build({
    stdin: {
      contents: `export { drawReviewBorders } from './apps/extension/src/workflows/video-review/render-border';
export { quickEditBorderPath } from './apps/extension/src/features/video/review/advanced/border';`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
  });
  const results = await page.evaluate(async (source) => {
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    try {
      const { drawReviewBorders, quickEditBorderPath } = await import(url);
      const actual = document.createElement('canvas');
      const expected = document.createElement('canvas');
      actual.width = expected.width = 420;
      actual.height = expected.height = 230;
      document.body.style.background = '#202020';
      document.body.append(actual, expected);
      const context = actual.getContext('2d')!;
      const reference = expected.getContext('2d')!;
      const results = [];
      for (const height of [2037.125, 153.75])
        for (const radius of [0, 17.5, 70])
          for (const width of [1.5, 4, 9])
            for (const style of ['dashed', 'dotted']) {
              const rect = { x: 20, y: 30, width: 363.125, height };
              const geometry = quickEditBorderPath(rect, radius, true);
              const pitch =
                geometry.perimeter /
                Math.max(
                  1,
                  Math.round(geometry.perimeter / (width * (style === 'dashed' ? 5 : 2)))
                );
              let maxDifference = 0;
              for (let phase = -30; phase <= 30; phase++) {
                const offset = (phase * pitch) / 13;
                context.clearRect(0, 0, actual.width, actual.height);
                reference.clearRect(0, 0, expected.width, expected.height);
                drawReviewBorders(context, actual, [
                  {
                    id: 'border',
                    ...geometry,
                    width,
                    style,
                    color: '#ffffff',
                    start: 0,
                    end: 1,
                    opacity: 1,
                    dashOffset: offset,
                  },
                ]);
                reference.lineWidth = width;
                reference.strokeStyle = '#ffffff';
                reference.lineCap = style === 'dotted' ? 'round' : 'butt';
                reference.setLineDash(style === 'dashed' ? [pitch * 0.6, pitch * 0.4] : [0, pitch]);
                reference.lineDashOffset = offset;
                reference.beginPath();
                // A whole number of repeats before the seam gives an uninterrupted reference.
                reference.moveTo(rect.x + rect.width / 2 - pitch * 20, rect.y);
                reference.lineTo(410, rect.y);
                reference.stroke();
                const a = context.getImageData(186, 27, 32, 6).data;
                const b = reference.getImageData(186, 27, 32, 6).data;
                for (let i = 3; i < a.length; i += 4)
                  maxDifference = Math.max(maxDifference, Math.abs(a[i]! - b[i]!));
              }
              results.push({ height, radius, width, style, maxDifference });
            }
      return results;
    } finally {
      URL.revokeObjectURL(url);
    }
  }, bundle.outputFiles[0]!.text);
  await writeFile(info.outputPath('pattern-seam.json'), JSON.stringify(results, null, 2));
  await page.screenshot({ path: info.outputPath('pattern-seam.png'), fullPage: false });
  for (const result of results)
    expect.soft(result.maxDifference, JSON.stringify(result)).toBeLessThanOrEqual(16);
});

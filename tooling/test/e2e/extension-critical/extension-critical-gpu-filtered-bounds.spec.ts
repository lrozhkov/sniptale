import { writeFile } from 'node:fs/promises';
import type {
  GpuPreviewGroup,
  GpuPreviewLayer,
} from '../../../../apps/extension/src/features/video/composition/canvas/gpu-preview';
import type { CameraSpatialFrame } from '../../../../apps/extension/src/features/video/project/motion/spatial';
import type { QuickEditHomography } from '../../../../apps/extension/src/features/video/composition/motion/spatial-geometry';
import { build } from 'esbuild';
import { expect, test } from '@playwright/test';
import { startHostServer } from '../support/host-server';
import { enableGpuPreviewProof } from '../support/gpu-preview-proof';

enableGpuPreviewProof();

test('filtered sparse groups preserve full-scissor pixels and faint convolution support', async ({
  page,
}, info) => {
  const bundles = await Promise.all(
    [false, true].map((reference) =>
      build({
        stdin: {
          contents: `export {createGpuPreviewRenderer} from './apps/extension/src/features/video/composition/canvas/gpu-preview';`,
          resolveDir: process.cwd(),
        },
        bundle: true,
        format: 'esm',
        platform: 'browser',
        write: false,
        plugins: reference
          ? [
              {
                name: 'full-scissor-reference',
                setup(builder) {
                  builder.onLoad({ filter: /[/\\]gpu-preview-bounds\.ts$/ }, () => ({
                    contents:
                      'export function createGpuPreviewDrawBounds(){return(_layer,output)=>[0,0,output.width,output.height]}',
                    loader: 'ts',
                  }));
                },
              },
            ]
          : [],
      })
    )
  );
  const host = await startHostServer();
  try {
    await page.setViewportSize({ width: 1920, height: 900 });
    await page.route('**/filtered-bounds-proof.html', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>Filtered bounds proof</title>',
      })
    );
    await page.goto(`${host.origin}/filtered-bounds-proof.html`);
    const results = await page.evaluate(
      async (codes) => {
        const modules = await Promise.all(
          codes.map(async (code) => {
            const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
            try {
              return await import(url);
            } finally {
              URL.revokeObjectURL(url);
            }
          })
        );
        const renderers = await Promise.all(
          modules.map((module) => module.createGpuPreviewRenderer())
        );
        if (renderers.some((renderer) => !renderer)) throw new Error('GPU renderer unavailable');
        const identity: QuickEditHomography = [1, 0, 0, 0, 1, 0, 0, 0, 1];
        const board = document.createElement('div');
        document.body.append(board);
        const results = [];
        try {
          for (const mode of [
            'depth',
            'blur',
            'nested-mask',
            'faint',
            'fractional',
            'density',
            'horizon',
            'full-hd',
          ]) {
            const logical =
              mode === 'full-hd' ? { width: 1904, height: 1072 } : { width: 640, height: 360 };
            const output = mode === 'density' ? { width: 1280, height: 720 } : logical;
            const texture = mode === 'density' ? { width: 1919, height: 1079 } : logical;
            const ink = new OffscreenCanvas(37, 23);
            const paint = ink.getContext('2d')!;
            paint.fillStyle = mode === 'faint' ? 'rgba(230,60,180,0.02)' : '#e245b7aa';
            paint.fillRect(0, 0, 37, 23);
            paint.fillStyle = '#00e8ff';
            paint.fillRect(14, 7, 3, 8);
            const rect = {
              x: logical.width * 0.42 + 0.375,
              y: logical.height * 0.38 + 0.25,
              width: 37,
              height: 23,
            };
            const content = { source: ink, rect, inverse: identity };
            const group: GpuPreviewGroup = {
              kind: 'group',
              output: texture,
              logical,
              layers: [content],
            };
            const frame: CameraSpatialFrame = {
              rotation: [0, 0, 0, 1],
              perspective: 0.5,
              windowMotion: 0,
              lockBackground: false,
              focus: [
                {
                  settings: {
                    enabled: true,
                    mode: 'area',
                    x: 0.5,
                    y: 0.5,
                    width: 0.15,
                    softness: 0.4,
                    strength: 0.8,
                  },
                  weight: 1,
                },
              ],
            };
            let source: GpuPreviewGroup = group;
            if (mode === 'nested-mask') {
              const mask = new OffscreenCanvas(640, 360);
              const maskContext = mask.getContext('2d')!;
              maskContext.fillStyle = '#fff';
              maskContext.beginPath();
              maskContext.ellipse(rect.x + 18, rect.y + 11, 15, 9, 0, 0, Math.PI * 2);
              maskContext.fill();
              source = {
                kind: 'group',
                output: texture,
                logical,
                layers: [
                  { source: group, rect: { x: 0, y: 0, ...logical }, inverse: identity, blur: 4 },
                  {
                    source: mask,
                    rect: { x: 0, y: 0, ...logical },
                    inverse: identity,
                    blend: 'mask',
                  },
                ],
              };
            }
            const layer: GpuPreviewLayer = {
              source,
              rect: { x: 0, y: 0, ...logical },
              inverse:
                mode === 'horizon'
                  ? [1, 0, 0, 0, 1, 0, 0.0025, 0, -1]
                  : mode === 'fractional'
                    ? [1.06, 0.04, -5.25, -0.06, 0.94, 9.5, 0.00012, -0.00004, 1]
                    : identity,
              ...(mode === 'blur'
                ? { blur: 12 }
                : { depth: { frame, window: { x: 0, y: 0, ...logical } } }),
            };
            const snapshots = [];
            for (const renderer of renderers) {
              const bitmap = await renderer.render({
                output,
                logical,
                layers: [layer],
                signal: new AbortController().signal,
              });
              try {
                const canvas = document.createElement('canvas');
                canvas.width = output.width;
                canvas.height = output.height;
                canvas.style.cssText = 'width:320px;height:180px';
                canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
                board.append(canvas);
                snapshots.push(
                  canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
                );
              } finally {
                bitmap.close();
              }
            }
            let maximum = 0,
              changed = 0,
              visible = 0;
            for (let index = 0; index < snapshots[0].length; index++) {
              const difference = Math.abs(snapshots[0][index] - snapshots[1][index]);
              maximum = Math.max(maximum, difference);
              changed += difference !== 0;
              if (index % 4 === 3) visible += snapshots[1][index] > 0;
            }
            results.push({ mode, output, maximum, changed, visible });
          }
          return results;
        } finally {
          for (const renderer of renderers) renderer?.dispose();
        }
      },
      bundles.map((bundle) => bundle.outputFiles[0]!.text)
    );
    await writeFile(
      info.outputPath('filtered-bounds-results.json'),
      JSON.stringify(results, null, 2)
    );
    await page.screenshot({ path: info.outputPath('filtered-bounds.png'), fullPage: false });
    expect(results).toHaveLength(8);
    for (const result of results) {
      expect(result.maximum, result.mode).toBe(0);
      expect(result.changed, result.mode).toBe(0);
      if (result.mode !== 'horizon') expect(result.visible, result.mode).toBeGreaterThan(0);
    }
  } finally {
    await new Promise<void>((resolve, reject) =>
      host.server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});

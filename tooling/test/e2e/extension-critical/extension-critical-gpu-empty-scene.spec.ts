import { build } from 'esbuild';
import { expect, test } from '@playwright/test';
import { startHostServer } from '../support/host-server';
import { enableGpuPreviewProof } from '../support/gpu-preview-proof';
enableGpuPreviewProof();

test('native-grid opaque video removes only the redundant group with identical pixels', async ({
  page,
}, info) => {
  const bundle = await build({
    stdin: {
      contents: `export {createGpuPreviewRenderer} from './apps/extension/src/features/video/composition/canvas/gpu-preview';`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
  });
  const host = await startHostServer();
  try {
    await page.route('**/empty-scene-proof.html', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>GPU scene proof</title>',
      })
    );
    await page.goto(`${host.origin}/empty-scene-proof.html`);
    const results = await page.evaluate(async (source) => {
      const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      const { createGpuPreviewRenderer } = await import(url);
      const renderer = await createGpuPreviewRenderer();
      if (!renderer) throw new Error('GPU renderer unavailable');
      const output = { width: 64, height: 72 };
      const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
      const bytes = new Uint8Array((64 * 64 * 3) / 2);
      for (let y = 0; y < 64; y++)
        for (let x = 0; x < 64; x++) bytes[y * 64 + x] = y < 56 ? 32 + ((x * 3 + y) % 180) : 235;
      bytes.fill(128, 64 * 64);
      const video = new VideoFrame(bytes, {
        format: 'NV12',
        codedWidth: 64,
        codedHeight: 64,
        visibleRect: { x: 0, y: 0, width: 64, height: 56 },
        displayWidth: 64,
        displayHeight: 56,
        timestamp: 0,
        colorSpace: { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false },
      });
      const background = new OffscreenCanvas(64, 72);
      const context = background.getContext('2d')!;
      context.fillStyle = '#375283';
      context.fillRect(0, 0, 64, 72);
      const backdrop = { source: background, rect: { x: 0, y: 0, ...output }, inverse: identity };
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 72;
      document.body.append(canvas);
      const surface = renderer.createSurface(canvas, { offscreen: true });
      const metadata = {
        format: video.format,
        coded: [video.codedWidth, video.codedHeight],
        visible: video.visibleRect?.toJSON(),
      };
      const results = [];
      const original = GPUCommandEncoder.prototype.beginRenderPass;
      let passes = 0;
      GPUCommandEncoder.prototype.beginRenderPass = function (...args) {
        passes++;
        return original.apply(this, args);
      };
      try {
        for (const variant of ['native', 'fractional', 'rounded', 'translucent']) {
          const rect = { x: variant === 'fractional' ? 0.25 : 0, y: 8, width: 64, height: 56 };
          const layer = {
            source: video,
            rect,
            inverse: identity,
            clip: { rect, radius: variant === 'rounded' ? 7 : 0 },
            ...(variant === 'translucent' ? { opacity: 0.5 } : {}),
          };
          const group = { kind: 'group', output, logical: output, layers: [layer] };
          const wrapper = { source: group, rect: { x: 0, y: 0, ...output }, inverse: identity };
          const snapshots = [];
          const counts = [];
          for (const shared of [true, false]) {
            const layers = [backdrop, wrapper, ...(shared ? [{ ...wrapper, opacity: 0 }] : [])];
            passes = 0;
            await surface.present({
              output,
              logical: output,
              layers,
              signal: new AbortController().signal,
            });
            counts.push(passes);
            const read = new OffscreenCanvas(64, 72),
              ctx = read.getContext('2d')!;
            ctx.drawImage(canvas, 0, 0);
            snapshots.push(ctx.getImageData(0, 0, 64, 72).data);
          }
          let max = 0,
            changed = 0;
          for (let i = 0; i < snapshots[0].length; i++) {
            const delta = Math.abs(snapshots[0][i] - snapshots[1][i]);
            max = Math.max(max, delta);
            if (delta) changed++;
          }
          results.push({ variant, counts, max, changed });
        }
      } finally {
        GPUCommandEncoder.prototype.beginRenderPass = original;
        surface.dispose();
        renderer.dispose();
        video.close();
        URL.revokeObjectURL(url);
      }
      return { source: metadata, results };
    }, bundle.outputFiles[0]!.text);
    await info.attach('gpu-scene-equivalence', {
      body: JSON.stringify(results),
      contentType: 'application/json',
    });
    const visible = results.source.visible;
    const conversion =
      results.source.format === 'NV12' &&
      visible &&
      (visible.x !== 0 ||
        visible.y !== 0 ||
        visible.width !== results.source.coded[0] ||
        visible.height !== results.source.coded[1])
        ? 1
        : 0;
    for (const row of results.results) {
      expect(row.max, row.variant).toBe(0);
      expect(row.changed, row.variant).toBe(0);
      expect(row.counts, row.variant).toEqual(
        row.variant === 'native'
          ? [2 + conversion, 1 + conversion]
          : [2 + conversion, 2 + conversion]
      );
    }
  } finally {
    await new Promise<void>((resolve, reject) =>
      host.server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});

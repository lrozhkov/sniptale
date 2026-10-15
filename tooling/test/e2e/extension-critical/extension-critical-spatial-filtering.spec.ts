import { build } from 'esbuild';
import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type {
  QuickEditDepthOfField,
  SpatialQuaternion,
} from '../../../../apps/extension/src/features/video/review/advanced/spatial';

test('perspective filters subpixel rules and depth blur without moving line copies', async ({
  page,
}, info) => {
  const bundle = await build({
    stdin: {
      contents:
        "export { createReviewSpatialRenderer } from './apps/extension/src/workflows/" +
        "video-review/spatial-renderer';",
      resolveDir: process.cwd(),
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
  });
  const metrics = await page.evaluate(async (text) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
    const { createReviewSpatialRenderer } = await import(url);
    URL.revokeObjectURL(url);
    const renderer = createReviewSpatialRenderer();
    const width = 962,
      height = 586;
    const rect = { x: 0, y: 0, width, height };
    const plane = renderer.surface('plane', width, height);
    const output = document.createElement('canvas');
    output.width = width;
    output.height = height;
    document.body.append(output);
    const context = output.getContext('2d')!;
    const focus = [
      {
        weight: 1,
        settings: {
          enabled: true,
          mode: 'area',
          x: 0,
          y: 0,
          width: 0,
          softness: 0.01,
          strength: 1,
        },
      },
    ];
    const draw = (angle: number, blur: boolean, sharp = false) => {
      const radians = (angle * Math.PI) / 360;
      context.clearRect(0, 0, width, height);
      renderer.draw(context, {
        source: plane.canvas,
        sourceRect: { x: 0, y: 0, width: plane.canvas.width, height: plane.canvas.height },
        output: { width: plane.canvas.width, height: plane.canvas.height },
        base: rect,
        target: rect,
        frame: {
          rotation: [Math.sin(radians), 0, 0, Math.cos(radians)],
          perspective: 1,
          windowMotion: 1,
          lockBackground: true,
          focus: blur ? focus : [],
        },
        sharp: sharp,
      });
    };
    try {
      plane.context.fillStyle = 'white';
      plane.context.fillRect(0, 0, width, height);
      plane.context.fillStyle = 'black';
      plane.context.fillRect(0, 293, width, 1);
      draw(0, true);
      const profile = context.getImageData(480, 268, 1, 51).data;
      const darkness = Array.from({ length: 51 }, (_, i) => 255 - profile[i * 4]!);
      const peak = Math.max(...darkness);
      const variation = darkness
        .slice(1)
        .reduce((sum, value, i) => sum + Math.abs(value - darkness[i]!), 0);
      draw(0, true, true);
      const sharpPeak = 255 - context.getImageData(480, 293, 1, 1).data[0]!;
      plane.context.fillStyle = 'white';
      plane.context.fillRect(0, 0, width, height);
      plane.context.fillStyle = 'black';
      for (let y = 0; y < height; y += 2) plane.context.fillRect(0, y, width, 1);
      const frames = [];
      for (const blur of [false, true]) {
        for (const angle of [57, 57.25, 57.5, 57.75, 58]) {
          draw(angle, blur);
          const data = context.getImageData(450, 270, 64, 40).data;
          const values = Array.from({ length: data.length / 4 }, (_, i) => data[i * 4]!);
          const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
          const rms = Math.sqrt(
            values.reduce((sum, value) => sum + (value - 127.5) ** 2, 0) / values.length
          );
          frames.push({ blur, angle, mean, rms });
        }
      }
      plane.context.clearRect(0, 0, width, height);
      plane.context.fillStyle = 'rgba(255, 0, 0, 0.5)';
      plane.context.fillRect(250, 150, 400, 300);
      draw(35, true);
      const translucent = Array.from(context.getImageData(480, 293, 1, 1).data);
      const outside = context.getImageData(20, 20, 1, 1).data[3]!;
      const originalExtension = WebGLRenderingContext.prototype.getExtension;
      WebGLRenderingContext.prototype.getExtension = function (name: string) {
        return name === 'OES_texture_half_float' ? null : originalExtension.call(this, name);
      };
      let fallbackAlpha = 0,
        depthRejected = false;
      try {
        const fallback = createReviewSpatialRenderer();
        const frame = {
          rotation: [0, 0, 0, 1],
          perspective: 0.5,
          windowMotion: 1,
          lockBackground: true,
          focus: [],
        };
        try {
          context.clearRect(0, 0, width, height);
          fallback.draw(context, {
            source: plane.canvas,
            sourceRect: { x: 0, y: 0, width: plane.canvas.width, height: plane.canvas.height },
            output: { width: plane.canvas.width, height: plane.canvas.height },
            base: rect,
            target: rect,
            frame: frame,
            sharp: false,
          });
          fallbackAlpha = context.getImageData(480, 293, 1, 1).data[3]!;
          try {
            fallback.draw(context, {
              source: plane.canvas,
              sourceRect: { x: 0, y: 0, width: plane.canvas.width, height: plane.canvas.height },
              output: { width: plane.canvas.width, height: plane.canvas.height },
              base: rect,
              target: rect,
              frame: { ...frame, focus },
              sharp: false,
            });
          } catch (error) {
            depthRejected = error instanceof Error && error.message.includes('precision');
          }
        } finally {
          fallback.dispose();
        }
      } finally {
        WebGLRenderingContext.prototype.getExtension = originalExtension;
      }
      return {
        peak,
        variation,
        sharpPeak,
        frames,
        translucent,
        outside,
        fallbackAlpha,
        depthRejected,
      };
    } finally {
      renderer.dispose();
    }
  }, bundle.outputFiles[0]!.text);
  await writeFile(info.outputPath('filter-metrics.json'), JSON.stringify(metrics, null, 2));
  await page.screenshot({ path: info.outputPath('filtered-lines.png'), fullPage: false });
  expect(metrics.translucent[0]).toBeGreaterThan(250);
  expect(metrics.translucent[1]).toBe(0);
  expect(metrics.translucent[3]).toBeGreaterThanOrEqual(126);
  expect(metrics.translucent[3]).toBeLessThanOrEqual(129);
  expect(metrics.outside).toBe(0);
  expect(metrics.fallbackAlpha).toBeGreaterThanOrEqual(126);
  expect(metrics.depthRejected).toBe(true);
  expect.soft(metrics.peak).toBeLessThan(32);
  expect.soft(metrics.variation).toBeLessThan(65);
  expect.soft(metrics.sharpPeak).toBeGreaterThan(240);
  // The area average of equal-width black/white rules is 127.5. Subpixel rules
  // should converge to it rather than produce bands whose brightness changes with angle.
  for (const blur of [false, true]) {
    const means = metrics.frames.filter((frame) => frame.blur === blur).map((frame) => frame.mean);
    expect(Math.max(...means) - Math.min(...means)).toBeLessThan(2.5);
  }
  for (const frame of metrics.frames)
    expect.soft(frame.rms, JSON.stringify(frame)).toBeLessThan(12);
});

test('visual focus contours bound the real WebGL sharp and fully blurred regions', async ({
  page,
}, info) => {
  const bundle = await build({
    stdin: {
      contents:
        "export { createReviewSpatialRenderer } from './apps/extension/src/workflows/" +
        "video-review/spatial-renderer';\n        export { quickEditPlaneProjection, p" +
        "rojectQuickEditPoint } from './apps/extension/src/features/video/review/adva" +
        "nced/spatial-geometry';\n        export { resolveReviewSpatialFocusGeometry, " +
        "unprojectReviewSpatialPoint } from './apps/extension/src/gallery/video-revie" +
        "w/spatial-control-geometry'; export { measureSpatialFocusPixels } from '" +
        "./tooling/test/e2e/support/spatial-focus-probe';",
      resolveDir: process.cwd(),
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
  });
  const metrics = await page.evaluate(async (text) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
    const {
      createReviewSpatialRenderer,
      quickEditPlaneProjection,
      resolveReviewSpatialFocusGeometry,
      measureSpatialFocusPixels,
    } = await import(url);
    URL.revokeObjectURL(url);
    const renderer = createReviewSpatialRenderer();
    const results = [];
    const rotation = (degrees: readonly [number, number, number]): SpatialQuaternion => {
      const [x, y, z] = degrees.map((value) => (value * Math.PI) / 360);
      return [
        Math.sin(x!) * Math.cos(y!) * Math.cos(z!) - Math.cos(x!) * Math.sin(y!) * Math.sin(z!),
        Math.cos(x!) * Math.sin(y!) * Math.cos(z!) + Math.sin(x!) * Math.cos(y!) * Math.sin(z!),
        Math.cos(x!) * Math.cos(y!) * Math.sin(z!) - Math.sin(x!) * Math.sin(y!) * Math.cos(z!),
        Math.cos(x!) * Math.cos(y!) * Math.cos(z!) + Math.sin(x!) * Math.sin(y!) * Math.sin(z!),
      ];
    };
    const cases: {
      name: string;
      width: number;
      height: number;
      angles: readonly [number, number, number];
      mode: 'area' | 'depth';
      offPlane?: boolean;
      focusWidth?: number;
      focusSoftness?: number;
    }[] = [
      {
        name: 'landscape-area-header-strong-tilt',
        width: 960,
        height: 640,
        angles: [-25, 50, 17],
        mode: 'area',
      },
      {
        name: 'portrait-area-header-strong-tilt',
        width: 640,
        height: 960,
        angles: [50, -35, -12],
        mode: 'area',
      },
      // A half-length depth axis doubles plane distances. Keep both thresholds
      // and the beyond sample inside the narrow portrait plane with edge margin.
      {
        name: 'portrait-depth-raw-half-axis',
        width: 640,
        height: 960,
        angles: [0, 30, 0],
        mode: 'depth',
        focusWidth: 0.1,
        focusSoftness: 0.035,
      },
      {
        name: 'landscape-depth-compound-tilt',
        width: 960,
        height: 640,
        angles: [-40, 50, 17],
        mode: 'depth',
      },
      {
        name: 'frontal-depth-no-boundaries',
        width: 960,
        height: 640,
        angles: [0, 0, 0],
        mode: 'depth',
      },
      {
        name: 'area-boundaries-outside-plane',
        width: 640,
        height: 960,
        angles: [35, -30, 0],
        mode: 'area',
        offPlane: true,
      },
    ];
    try {
      for (const scenario of cases) {
        const { width, height } = scenario;
        // This is the decorated window: 32px header + 24px padding are part of
        // its plane, not subtracted into a video-content-only focus metric.
        const base = { x: 48, y: 40, width: width - 96, height: height - 80 };
        const target = {
          x: base.x - 10,
          y: base.y + 8,
          width: base.width * 1.04,
          height: base.height * 1.04,
        };
        const plane = renderer.surface('plane', width, height);
        plane.context.fillStyle = '#777';
        plane.context.fillRect(base.x, base.y, base.width, base.height);
        for (let y = base.y; y < base.y + base.height; y += 8)
          for (let x = base.x; x < base.x + base.width; x += 8) {
            plane.context.fillStyle = ((x - base.x) / 8 + (y - base.y) / 8) % 2 ? '#fff' : '#000';
            plane.context.fillRect(
              x,
              y,
              Math.min(8, base.x + base.width - x),
              Math.min(8, base.y + base.height - y)
            );
          }
        // Mark the real header/content split without changing the geometry authority.
        plane.context.fillStyle = '#89a';
        plane.context.fillRect(base.x, base.y + 32, base.width, 2);
        const focus: QuickEditDepthOfField = {
          enabled: true,
          mode: scenario.mode,
          x: 0.5,
          y: 0.5,
          width: scenario.offPlane ? 1 : (scenario.focusWidth ?? 0.16),
          softness: scenario.focusSoftness ?? 0.055,
          strength: 1,
        };
        const frame = {
          rotation: rotation(scenario.angles),
          perspective: 1,
          windowMotion: 1,
          lockBackground: true,
          focus: [{ weight: 1, settings: focus }],
        };
        const projection = quickEditPlaneProjection(base, target, frame);
        const geometry = resolveReviewSpatialFocusGeometry({
          plane: base,
          projection,
          rotation: frame.rotation,
          focus,
        });
        if (!geometry) throw new Error(`Missing focus geometry: ${scenario.name}`);
        const output = document.createElement('canvas');
        output.width = width;
        output.height = height;
        const context = output.getContext('2d')!;
        const draw = (settings: QuickEditDepthOfField | null) => {
          context.clearRect(0, 0, width, height);
          renderer.draw(context, {
            source: plane.canvas,
            sourceRect: { x: 0, y: 0, width: plane.canvas.width, height: plane.canvas.height },
            output: { width: plane.canvas.width, height: plane.canvas.height },
            base: base,
            target: target,
            frame: {
              ...frame,
              focus: settings ? [{ weight: 1, settings }] : [],
            },
            sharp: false,
          });
          return context.getImageData(0, 0, width, height).data;
        };
        const sharp = draw(null);
        // At our central sample points this reference is saturated, independent
        // of the contour helper: the shader sees distance > 0.01 from corner 0,0.
        const blurred = draw({ ...focus, mode: 'area', x: 0, y: 0, width: 0, softness: 0.01 });
        const actual = draw(focus);
        results.push({
          name: scenario.name,
          ...measureSpatialFocusPixels({
            geometry,
            projection,
            base,
            focus,
            width,
            height,
            offPlane: scenario.offPlane,
            actual,
            sharp,
            blurred,
          }),
        });
        // Keep the actual rendered pixels and overlay together as inspectable proof.
        context.strokeStyle = '#f80';
        context.lineWidth = 1;
        for (const paths of [geometry.sharp, geometry.soft])
          for (const path of paths) {
            context.beginPath();
            path.forEach((point: { x: number; y: number }, index: number) =>
              index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y)
            );
            context.stroke();
          }
        output.style.width = '320px';
        output.style.height = 'auto';
        output.dataset.case = scenario.name;
        document.body.append(output);
      }
      return results;
    } finally {
      renderer.dispose();
    }
  }, bundle.outputFiles[0]!.text);
  await writeFile(
    info.outputPath('focus-contour-webgl-metrics.json'),
    JSON.stringify(metrics, null, 2)
  );
  await page.screenshot({ path: info.outputPath('focus-contour-webgl.png'), fullPage: false });
  for (const result of metrics) {
    if (
      result.name === 'frontal-depth-no-boundaries' ||
      result.name === 'area-boundaries-outside-plane'
    ) {
      expect(result.sharpPaths, result.name).toBe(0);
      expect(result.softPaths, result.name).toBe(0);
      expect(result.count, result.name).toBeGreaterThan(10000);
      expect(result.maximum, result.name).toBeLessThanOrEqual(1);
      continue;
    }
    for (const kind of ['inside', 'sharp', 'soft', 'beyond']) {
      const samples = result.samples.filter((sample) => sample.kind === kind);
      expect(samples.length, `${result.name}: ${kind} sample coverage`).toBeGreaterThanOrEqual(2);
      expect(
        samples.filter((sample) => sample.referenceSeparation > 15).length,
        `${result.name}: ${kind} non-vacuous contrast`
      ).toBeGreaterThanOrEqual(2);
      for (const sample of samples) {
        const label = `${result.name} ${kind} ${JSON.stringify(sample.point)}`;
        // Quantization and the 3x3 footprint may straddle a threshold by a pixel;
        // derivative-zero smoothstep endpoints still agree within 3/255 levels.
        expect.soft(sample.error, label).toBeLessThanOrEqual(3);
      }
    }
  }
});

test('a straight faint rule keeps its center across a spatially varying depth blur', async ({
  page,
}, info) => {
  const bundle = await build({
    stdin: {
      contents:
        "export { createReviewSpatialRenderer } from './apps/extension/src/workflows/" +
        "video-review/spatial-renderer'; export {quickEditPlaneProjection, projectQui" +
        "ckEditPoint} from './apps/extension/src/features/video/review/advanced/spati" +
        "al-geometry';",
      resolveDir: process.cwd(),
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
  });
  const metrics = await page.evaluate(async (text) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
    const { createReviewSpatialRenderer, quickEditPlaneProjection, projectQuickEditPoint } =
      await import(url);
    URL.revokeObjectURL(url);
    const renderer = createReviewSpatialRenderer();
    const width = 1920,
      height = 1172;
    const rect = { x: 0, y: 0, width, height };
    const plane = renderer.surface('plane', width, height);
    const output = document.createElement('canvas');
    output.width = width;
    output.height = height;
    document.body.append(output);
    const context = output.getContext('2d')!;
    const results = [];
    try {
      for (const row of [400, 401, 402, 403])
        for (const scale of [1, 1.3]) {
          plane.context.fillStyle = 'white';
          plane.context.fillRect(0, 0, width, height);
          plane.context.fillStyle = '#ddd';
          plane.context.fillRect(0, row, width, 1);
          const angle = scale === 1 ? 0 : (20 * Math.PI) / 360;
          const frame = {
            rotation: [0, Math.sin(angle), 0, Math.cos(angle)],
            perspective: 1,
            windowMotion: 1,
            lockBackground: true,
            focus: [
              {
                weight: 1,
                settings: {
                  enabled: true,
                  mode: 'area',
                  x: 0,
                  y: (row + 0.5) / height,
                  width: 0.1,
                  softness: 0.8,
                  strength: 1,
                },
              },
            ],
          };
          const target = {
            x: (width * (1 - scale)) / 2,
            y: (height * (1 - scale)) / 2,
            width: width * scale,
            height: height * scale,
          };
          context.clearRect(0, 0, width, height);
          renderer.draw(context, {
            source: plane.canvas,
            sourceRect: { x: 0, y: 0, width: plane.canvas.width, height: plane.canvas.height },
            output: { width: plane.canvas.width, height: plane.canvas.height },
            base: rect,
            target: target,
            frame: frame,
            sharp: false,
          });
          const projection = quickEditPlaneProjection(rect, target, frame);
          const a = projectQuickEditPoint(projection, { x: 0, y: row + 0.5 });
          const b = projectQuickEditPoint(projection, { x: width, y: row + 0.5 });
          const data = context.getImageData(0, 0, width, height).data;
          const offsets = [];
          for (let x = 300; x < 1600; x += 4) {
            const expected = a.y + ((x + 0.5 - a.x) * (b.y - a.y)) / (b.x - a.x);
            let mass = 0,
              moment = 0;
            for (let y = Math.floor(expected) - 80; y < expected + 80; y++) {
              const darkness = 255 - data[(y * width + x) * 4]!;
              mass += darkness;
              moment += darkness * (y + 0.5 - expected);
            }
            offsets.push(mass ? moment / mass : 100);
          }
          results.push({ row, scale, maximum: Math.max(...offsets.map(Math.abs)), offsets });
        }
      return results;
    } finally {
      renderer.dispose();
    }
  }, bundle.outputFiles[0]!.text);
  await writeFile(info.outputPath('line-centroid.json'), JSON.stringify(metrics, null, 2));
  await page.screenshot({ path: info.outputPath('line-centroid.png'), fullPage: false });
  for (const result of metrics)
    expect
      .soft(result.maximum, `source row ${result.row}, scale ${result.scale}`)
      .toBeLessThanOrEqual(result.scale === 1 ? 0.5 : 1);
});

test('rotated strong shadow stays continuous across the former source-raster edge', async ({
  page,
}, info) => {
  const bundle = await build({
    entryPoints: ['tooling/test/e2e/support/spatial-shadow-probe.ts'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    loader: { '.woff2': 'dataurl', '.svg': 'text' },
  });
  const metrics = await page.evaluate(async (text) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
    try {
      return (await import(url)).probeSpatialShadowEdge();
    } finally {
      URL.revokeObjectURL(url);
    }
  }, bundle.outputFiles[0]!.text);
  await writeFile(info.outputPath('shadow-source-edge.json'), JSON.stringify(metrics, null, 2));
  await page.screenshot({ path: info.outputPath('shadow-source-edge.png'), fullPage: false });
  expect(metrics.count).toBeGreaterThanOrEqual(45);
  expect(metrics.minimumReference).toBeLessThan(210);
  // Canvas2D rotation and the GPU bilinear sample may differ by a quantized edge texel.
  expect(metrics.mean).toBeLessThanOrEqual(3);
  expect(metrics.maximum).toBeLessThanOrEqual(6);
});

test('padded tilted blur agrees with an oversized reference and refuses one byte below its real peak', async ({
  page,
}, info) => {
  const bundle = await build({
    entryPoints: ['tooling/test/e2e/support/spatial-shadow-probe.ts'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    loader: { '.woff2': 'dataurl', '.svg': 'text' },
  });
  const results = await page.evaluate(async (text) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
    try {
      return await (await import(url)).probeSpatialShadowBudget();
    } finally {
      URL.revokeObjectURL(url);
    }
  }, bundle.outputFiles[0]!.text);
  await writeFile(info.outputPath('padded-blur-budget.json'), JSON.stringify(results, null, 2));
  await page.screenshot({ path: info.outputPath('padded-blur-budget.png'), fullPage: false });
  for (const result of results) {
    expect(result.afterDispose).toBe(0);
    expect(result.peakCanvases).toBeLessThanOrEqual(result.canvasLimit);
    expect(result.preservedFront).toEqual([238, 68, 170, 255]);
    if (result.mode === 'refusal') {
      expect(result.refused).toBe(true);
      continue;
    }
    expect(result.refused).toBe(false);
    expect(result.peak).toBe(result.limit);
    expect(result.count).toBeGreaterThan(1000);
    // Different odd mip grids shift the approximation by a texel; exterior shadow remains smooth.
    expect(result.mean).toBeLessThanOrEqual(3);
    expect(result.maximum).toBeLessThanOrEqual(6);
  }
});

import { evaluateQuickEditSpotlightAtTime } from '../../../../apps/extension/src/features/video/review/advanced/focus';
import { createQuickEditZoomRegion } from '../../../../apps/extension/src/features/video/review/advanced/zoom';
import { drawPointerFeedbackFrame } from '../../../../apps/extension/src/features/video/composition/draw/pointer-feedback';
import { drawSceneLens } from '../../../../apps/extension/src/features/video/composition/draw/scene-lens';
import { drawSceneSpotlights } from '../../../../apps/extension/src/features/video/composition/draw/spotlight';
import {
  resolveSceneSpotlightTarget,
  sampleSceneSpotlight,
  sceneSpotlightOpeningPath,
} from '../../../../apps/extension/src/features/video/composition/scene-spotlight';
import {
  createQuickEditSpotlight,
  placeQuickEditLens,
} from '../../../../apps/extension/src/features/video/project/scene/focus-appearance';

function surface(width = 1024, height = 640) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** Compare cursor placement with a manually centered opening, preserving pixels beyond the window. */
export function lensEdgeProbe() {
  const source = surface(400, 240);
  const ink = source.getContext('2d')!;
  for (let x = 0; x < 400; x++) {
    ink.fillStyle = `rgb(${x % 256},${(x * 7) % 256},120)`;
    ink.fillRect(x, 0, 1, 240);
  }
  ink.fillStyle = '#fff';
  ink.font = '18px Arial';
  for (let y = 24; y < 240; y += 30) ink.fillText('Lens edge · readable details', 50, y);
  const window = { x: 40, y: 20, width: 320, height: 200 };
  const base = ink.getImageData(0, 0, 400, 240).data;
  const results = [];
  for (const shape of [undefined, 'circle', 'rounded'] as const)
    for (const optics of ['flat', 'optical'] as const)
      for (const point of [
        { x: 0, y: 0.5 },
        { x: 1, y: 0.5 },
        { x: 0.5, y: 0 },
        { x: 0.5, y: 1 },
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ]) {
        const authored = {
          ...createQuickEditSpotlight(),
          effect: 'magnify' as const,
          magnification: 2,
          lensOptics: optics,
          ...(shape ? { lensShape: shape } : {}),
        };
        const actual = surface(400, 240),
          reference = surface(400, 240);
        const placed = placeQuickEditLens(authored, point);
        const expected = {
          ...authored,
          area: {
            ...authored.area,
            x: point.x - authored.area.width / 2,
            y: point.y - authored.area.height / 2,
          },
        };
        for (const [canvas, value] of [
          [actual, placed],
          [reference, expected],
        ] as const) {
          const context = canvas.getContext('2d')!;
          context.drawImage(source, 0, 0);
          drawSceneSpotlights(context, canvas, null, [
            { ...resolveSceneSpotlightTarget(value, window, 1), clip: { rect: window, radius: 0 } },
          ]);
        }
        const pixels = actual.getContext('2d')!.getImageData(0, 0, 400, 240).data;
        const expectedPixels = reference.getContext('2d')!.getImageData(0, 0, 400, 240).data;
        let maximum = 0,
          outsideChanged = 0,
          insideChanged = 0;
        for (let y = 0; y < 240; y++)
          for (let x = 0; x < 400; x++) {
            const index = (y * 400 + x) * 4;
            const inside =
              x >= window.x &&
              x < window.x + window.width &&
              y >= window.y &&
              y < window.y + window.height;
            for (let channel = 0; channel < 4; channel++) {
              maximum = Math.max(
                maximum,
                Math.abs(pixels[index + channel]! - expectedPixels[index + channel]!)
              );
              if (pixels[index + channel] !== base[index + channel]) {
                if (inside) insideChanged++;
                else outsideChanged++;
              }
            }
          }
        const geometry = resolveSceneSpotlightTarget(placed, window, 1);
        results.push({
          shape: shape ?? 'legacy',
          optics,
          point,
          maximum,
          outsideChanged,
          insideChanged,
          opening: geometry.opening,
          radius: geometry.radius,
        });
        if (optics === 'optical' && shape === 'circle') document.body.append(actual);
      }
  return results;
}

/** Text and fine monochrome detail expose central resampling and rim-only dispersion. */
export function opticalLensProbe() {
  const source = surface();
  const ink = source.getContext('2d')!;
  ink.fillStyle = '#252628';
  ink.fillRect(0, 0, 1024, 640);
  ink.strokeStyle = '#777';
  ink.lineWidth = 1;
  for (let x = 0; x < 1024; x += 24) {
    ink.beginPath();
    ink.moveTo(x, 0);
    ink.lineTo(x, 640);
    ink.stroke();
  }
  ink.font = '18px Arial';
  for (let y = 30; y < 640; y += 42) {
    ink.fillStyle = '#f2f2f2';
    ink.fillText('Selection colors   Export video   Readable details   0123456789', 230, y);
  }
  ink.fillStyle = '#fff';
  for (let x = 440; x < 584; x += 2) ink.fillRect(x, 290, 1, 60);
  const results = [];
  for (const shape of ['circle', 'rounded', 'scene', 'scene-wide'] as const) {
    const outputs = [];
    const times = [];
    for (const optics of ['flat', 'optical'] as const) {
      const canvas = surface();
      const context = canvas.getContext('2d')!;
      context.drawImage(source, 0, 0);
      const bounds = {
        x: 292,
        y: shape === 'scene-wide' ? 180 : 100,
        width: 440,
        height: shape === 'scene-wide' ? 280 : 440,
      };
      const started = performance.now();
      if (shape === 'scene' || shape === 'scene-wide') {
        context.save();
        context.beginPath();
        context.roundRect(bounds.x, bounds.y, bounds.width, bounds.height, 60);
        context.clip();
        drawSceneLens(context, source, bounds, { scale: 2, optics }, 60);
        context.restore();
      } else
        drawPointerFeedbackFrame(
          context,
          {
            effect: 'magnify',
            point: { x: 512, y: 320 },
            radius: 220,
            stroke: 0,
            color: '#00000000',
            opacity: 1,
            lens: { scale: 2, optics, shape, shadow: 0 },
          },
          {
            rect: { x: 0, y: 0, width: 1024, height: 640 },
            draw: (target, x, y, width, height) => target.drawImage(source, x, y, width, height),
          }
        );
      times.push(performance.now() - started);
      outputs.push(canvas);
      if (optics === 'optical') {
        const title = document.createElement('p');
        title.textContent = shape;
        document.body.append(title, canvas);
      }
    }
    const flat = outputs[0]!.getContext('2d')!.getImageData(0, 0, 1024, 640).data;
    const optical = outputs[1]!.getContext('2d')!.getImageData(0, 0, 1024, 640).data;
    let centralMaximum = 0,
      fringePixels = 0;
    for (let y = 270; y < 370; y++)
      for (let x = 440; x < 584; x++) {
        const i = (y * 1024 + x) * 4;
        for (let c = 0; c < 4; c++)
          centralMaximum = Math.max(centralMaximum, Math.abs(flat[i + c]! - optical[i + c]!));
      }
    for (let y = 100; y < 540; y++)
      for (let x = 292; x < 732; x++) {
        const i = (y * 1024 + x) * 4;
        if (Math.abs(optical[i]! - optical[i + 2]!) > 12) fringePixels++;
      }
    results.push({ shape, centralMaximum, fringePixels, drawMs: times });
  }
  return results;
}

/** A standalone circle fade must keep the circular clip at every visible phase sample. */
export function lensFadeProbe() {
  const source = surface(400, 240);
  const ink = source.getContext('2d')!;
  for (let x = 0; x < 400; x++) {
    ink.fillStyle = `rgb(${x % 256},${(x * 7) % 256},120)`;
    ink.fillRect(x, 0, 1, 240);
  }
  const window = { x: 40, y: 20, width: 320, height: 200 };
  const results = [];
  for (const optics of ['flat', 'optical'] as const)
    for (const phase of ['enter', 'exit'] as const)
      for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
        const spotlight = {
          ...createQuickEditSpotlight(),
          effect: 'magnify' as const,
          lensShape: 'circle' as const,
          lensOptics: optics,
        };
        const frame = sampleSceneSpotlight({
          spotlight,
          window,
          extent: window,
          scale: 1,
          phase,
          progress,
        });
        const actual = surface(400, 240),
          reference = surface(400, 240);
        for (const [canvas, radius] of [
          [actual, frame.radius],
          [reference, frame.opening.width / 2],
        ] as const) {
          const context = canvas.getContext('2d')!;
          context.drawImage(source, 0, 0);
          drawSceneSpotlights(context, canvas, null, [
            { ...frame, radius, clip: { rect: window, radius: 0 } },
          ]);
        }
        const a = actual.getContext('2d')!.getImageData(0, 0, 400, 240).data;
        const b = reference.getContext('2d')!.getImageData(0, 0, 400, 240).data;
        let maximum = 0;
        for (let i = 0; i < a.length; i++) maximum = Math.max(maximum, Math.abs(a[i]! - b[i]!));
        results.push({
          optics,
          phase,
          progress,
          radius: frame.radius,
          diameter: frame.opening.width,
          maximum,
        });
        if (optics === 'optical' && phase === 'enter') document.body.append(actual);
      }
  return results;
}

/** Mixed legacy/circle links keep exact endpoint pixels and approach them continuously. */
export function lensLinkProbe() {
  const source = surface(400, 400),
    ink = source.getContext('2d')!;
  for (let x = 0; x < 400; x++) {
    ink.fillStyle = `rgb(${x % 256},${(x * 7) % 256},120)`;
    ink.fillRect(x, 0, 1, 400);
  }
  const window = { x: 0, y: 0, width: 400, height: 400 };
  const results = [];
  for (const reverse of [false, true])
    for (const optics of ['flat', 'optical'] as const) {
      const legacy = {
        ...createQuickEditSpotlight(),
        effect: 'magnify' as const,
        roundness: 0.5,
        lensOptics: optics,
      };
      const circle = { ...legacy, lensShape: 'circle' as const };
      const a = {
        ...createQuickEditZoomRegion({ id: 'a', at: 0, duration: 2 }),
        linkTo: 'b',
        spotlight: reverse ? circle : legacy,
      };
      const b = {
        ...createQuickEditZoomRegion({ id: 'b', at: 4, duration: 2 }),
        spotlight: reverse ? legacy : circle,
      };
      const paint = (frame: ReturnType<typeof resolveSceneSpotlightTarget>) => {
        const canvas = surface(400, 400),
          context = canvas.getContext('2d')!;
        context.drawImage(source, 0, 0);
        drawSceneSpotlights(context, canvas, null, [frame]);
        return canvas;
      };
      const pixels = (canvas: HTMLCanvasElement) =>
        canvas.getContext('2d')!.getImageData(0, 0, 400, 400).data;
      const difference = (a: Uint8ClampedArray, b: Uint8ClampedArray, path: Path2D) => {
        let maximum = 0,
          interiorMaximum = 0,
          changed = 0;
        for (let i = 0; i < a.length; i++) {
          const delta = Math.abs(a[i]! - b[i]!);
          maximum = Math.max(maximum, delta);
          if (delta) changed++;
          if (
            delta &&
            !ink.isPointInStroke(path, (Math.floor(i / 4) % 400) + 0.5, Math.floor(i / 1600) + 0.5)
          )
            interiorMaximum = Math.max(interiorMaximum, delta);
        }
        return { maximum, changed, interiorMaximum };
      };
      // Q and equivalent C commands can differ in edge coverage; measure the one-pixel AA band.
      ink.lineWidth = 2;
      const startPath = new Path2D(
        sceneSpotlightOpeningPath(resolveSceneSpotlightTarget(a.spotlight, window, 1))
      );
      const endPath = new Path2D(
        sceneSpotlightOpeningPath(resolveSceneSpotlightTarget(b.spotlight, window, 1))
      );
      const start = pixels(paint(resolveSceneSpotlightTarget(a.spotlight, window, 1)));
      const end = pixels(paint(resolveSceneSpotlightTarget(b.spotlight, window, 1)));
      for (const time of [2, 2.000001, 3, 3.999999, 4]) {
        const frame = evaluateQuickEditSpotlightAtTime({
          regions: [a, b],
          time,
          output: window,
          video: window,
          scale: 1,
        })!;
        const canvas = paint(frame),
          actual = pixels(canvas);
        results.push({
          reverse,
          optics,
          time,
          start: difference(actual, start, startPath),
          end: difference(actual, end, endPath),
          arcMix: frame.arcMix ?? null,
        });
        if (time === 3) document.body.append(canvas);
      }
    }
  return results;
}

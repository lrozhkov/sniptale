import { drawPointerFeedbackFrame } from '../../../../apps/extension/src/features/video/composition/draw/pointer-feedback';
import { drawSceneLens } from '../../../../apps/extension/src/features/video/composition/draw/scene-lens';

function surface(width = 1024, height = 640) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
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

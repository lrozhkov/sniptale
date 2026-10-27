import {
  optimizeScreenshotDataUrl,
  finalizeScreenshotDataUrl,
} from '../../../apps/extension/src/platform/media-utils/screenshot-encoding';
import { createEncodingFixture, type EncodingFixture } from './screenshot-encoding-fixtures';

async function pixels(dataUrl: string): Promise<ImageData> {
  const image = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const canvas = new OffscreenCanvas(image.width, image.height);
  try {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Proof canvas unavailable');
    context.drawImage(image, 0, 0);
    return context.getImageData(0, 0, canvas.width, canvas.height);
  } finally {
    image.close();
    canvas.width = canvas.height = 0;
  }
}

async function pngProof(kind: EncodingFixture) {
  const canvas = await createEncodingFixture(kind);
  const original = canvas.toDataURL('image/png');
  const start = performance.now();
  const output = await optimizeScreenshotDataUrl(original);
  const elapsedMs = performance.now() - start;
  canvas.width = canvas.height = 0;
  const reference = await pixels(original);
  const result = await pixels(output);
  const exact =
    reference.width === result.width &&
    reference.height === result.height &&
    reference.data.every((value, index) => value === result.data[index]);
  const [before, after] = await Promise.all([
    fetch(original).then((r) => r.blob()),
    fetch(output).then((r) => r.blob()),
  ]);
  return {
    kind,
    before: before.size,
    after: after.size,
    width: result.width,
    height: result.height,
    exact,
    elapsedMs,
  };
}

async function formatsProof(kind: EncodingFixture) {
  const canvas = await createEncodingFixture(kind);
  const original = canvas.toDataURL('image/png');
  canvas.width = canvas.height = 0;
  const rows = [];
  for (const format of ['jpeg', 'webp'] as const) {
    for (const quality of [90, 100]) {
      const output = await finalizeScreenshotDataUrl(original, { format, quality });
      const expectedCanvas = document.createElement('canvas');
      const reference = await pixels(original);
      expectedCanvas.width = reference.width;
      expectedCanvas.height = reference.height;
      expectedCanvas.getContext('2d')!.putImageData(reference, 0, 0);
      const expected = await pixels(expectedCanvas.toDataURL(`image/${format}`, quality / 100));
      const actual = await pixels(output);
      rows.push({
        format,
        quality,
        mime: (await (await fetch(output)).blob()).type,
        exactSingleEncode: expected.data.every((value, index) => value === actual.data[index]),
      });
      expectedCanvas.width = expectedCanvas.height = 0;
    }
  }
  return rows;
}

async function abortProof() {
  const controller = new AbortController();
  controller.abort(new DOMException('Cancelled', 'AbortError'));
  try {
    await optimizeScreenshotDataUrl('data:image/png;base64,AA==', controller.signal);
  } catch (error) {
    return error instanceof DOMException && error.name === 'AbortError';
  }
  return false;
}

async function editorProof() {
  const [{ Canvas, Rect }, { renderEditorControllerForExport }, { renderEditorCanvasToDataUrl }] =
    await Promise.all([
      import('fabric'),
      import('../../../apps/extension/src/editor/controller/public-api/document/export'),
      import('../../../apps/extension/src/editor/controller/document/export'),
    ]);
  const canvas = new Canvas(document.createElement('canvas'), {
    width: 256,
    height: 180,
    renderOnAddRemove: false,
  });
  try {
    canvas.add(
      new Rect({ left: 30, top: 20, width: 150, height: 120, fill: 'rgba(20,80,220,0.5)' })
    );
    const options = { format: 'png' as const, quality: 100 };
    const reference = await pixels(renderEditorCanvasToDataUrl(canvas, options));
    const exported = await renderEditorControllerForExport(
      { canvas, canvasDocumentSize: { width: 256, height: 180 } },
      options
    );
    const output = await pixels(exported);
    let transparent = false;
    let translucent = false;
    for (let index = 3; index < output.data.length; index += 4) {
      transparent ||= output.data[index] === 0;
      translucent ||= output.data[index]! > 0 && output.data[index]! < 255;
    }
    return {
      exact: reference.data.every((value, index) => value === output.data[index]),
      transparent,
      translucent,
      objects: canvas.getObjects().length,
    };
  } finally {
    await canvas.dispose();
  }
}

Object.assign(window, {
  screenshotEncodingProof: { pngProof, formatsProof, abortProof, editorProof },
});
document.body.textContent = 'Screenshot encoding proof ready';

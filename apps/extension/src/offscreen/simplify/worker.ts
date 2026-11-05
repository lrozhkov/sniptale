import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { createSimplifyRaster, type SimplifyRaster } from '../../features/simplify/raster';
import { parseSimplifySettings } from '../../features/simplify/settings';
import { isSimplifyCommand } from '../../contracts/messaging/contracts/runtime/actions/simplify';
import {
  readSimplifyPngDimensions,
  type OffscreenSimplifyCommand,
  type SimplifyCompletion,
} from '../../contracts/messaging/contracts/runtime-message/simplify.types';

let source: OffscreenCanvas | null = null;
let raster: SimplifyRaster | null = null;
let sessionId: string | null = null;

function context(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const result = canvas.getContext('2d');
  if (!result) throw new Error('Simplify canvas is unavailable');
  return result;
}
async function pngDataUrl(canvas: OffscreenCanvas): Promise<string> {
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const buffer = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < buffer.length; offset += 32768)
    binary += String.fromCharCode(...buffer.subarray(offset, offset + 32768));
  return `data:image/png;base64,${btoa(binary)}`;
}
async function execute(command: OffscreenSimplifyCommand): Promise<SimplifyCompletion> {
  if (command.operation === 'prepare') {
    const dimensions = readSimplifyPngDimensions(command.dataUrl);
    if (!dimensions || source) throw new Error('Invalid simplify source');
    const blob = await (await fetch(command.dataUrl)).blob();
    const bitmap = await createImageBitmap(blob);
    try {
      if (bitmap.width !== dimensions.width || bitmap.height !== dimensions.height)
        throw new Error('Simplify source dimensions changed');
      source = new OffscreenCanvas(bitmap.width, bitmap.height);
      const target = context(source);
      target.drawImage(bitmap, 0, 0);
      raster = createSimplifyRaster(target.getImageData(0, 0, bitmap.width, bitmap.height));
      sessionId = command.sessionId;
      return { sessionId, width: bitmap.width, height: bitmap.height, version: raster.version };
    } finally {
      bitmap.close();
    }
  }
  if (!source || !raster || sessionId !== command.sessionId || command.operation !== 'render')
    throw new Error('Simplify session is unavailable');
  const settings = parseSimplifySettings(command.settings);
  if (!settings) throw new Error('Invalid simplify settings');
  const { x, y, width, height } = command.region;
  if (x + width > source.width || y + height > source.height)
    throw new Error('Simplify region is outside the source raster');
  const rotation = (command.region.rotation ?? 0) % 360;
  if (!settings.automatic && settings.manualKind === 'text' && rotation !== 0) {
    const padding = (width + 8) * (height + 8) <= 16_777_216 ? 4 : 0;
    const localSource = new OffscreenCanvas(width + padding * 2, height + padding * 2);
    const localContext = context(localSource);
    localContext.translate(localSource.width / 2, localSource.height / 2);
    localContext.rotate((-rotation * Math.PI) / 180);
    localContext.drawImage(source, -(x + width / 2), -(y + height / 2));
    localContext.resetTransform();
    const localRaster = createSimplifyRaster(
      localContext.getImageData(0, 0, localSource.width, localSource.height)
    );
    const localOutput = new OffscreenCanvas(localSource.width, localSource.height);
    localRaster.render(
      context(localOutput),
      localSource,
      { x: padding, y: padding, width, height },
      settings
    );
    const tile = new OffscreenCanvas(width, height);
    context(tile).drawImage(localOutput, padding, padding, width, height, 0, 0, width, height);
    return { sessionId, width, height, version: raster.version, dataUrl: await pngDataUrl(tile) };
  }
  const output = new OffscreenCanvas(source.width, source.height);
  raster.render(context(output), source, command.region, settings);
  const tile = new OffscreenCanvas(width, height);
  context(tile).drawImage(output, x, y, width, height, 0, 0, width, height);
  return { sessionId, width, height, version: raster.version, dataUrl: await pngDataUrl(tile) };
}
self.onmessage = (event: MessageEvent<unknown>) => {
  const input = event.data;
  if (
    !isRecord(input) ||
    typeof input['requestId'] !== 'number' ||
    !Number.isSafeInteger(input['requestId']) ||
    !isRecord(input['command']) ||
    typeof input['command']['sessionId'] !== 'string' ||
    !isSimplifyCommand(input['command'])
  )
    return;
  const candidate = input['command'];
  if (!('sessionId' in candidate) || typeof candidate.sessionId !== 'string') return;
  const command: OffscreenSimplifyCommand = { ...candidate, sessionId: candidate.sessionId };
  const requestId = input['requestId'];
  void execute(command).then(
    (completion) => self.postMessage({ requestId, completion }),
    () => self.postMessage({ requestId, error: 'Simplify worker failed' })
  );
};

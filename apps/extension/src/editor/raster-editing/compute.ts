import { isImageDataUrl } from '@sniptale/runtime-contracts/validation/data-url';
import {
  parseEditorRasterMetadata,
  type EditorRasterMetadata,
} from '../../features/editor/document/raster-state';
import {
  assertRasterSize,
  assertSelectionMask,
  type PixelBounds,
  type SelectionMask,
  type SourcePoint,
} from './contracts';
import {
  decodeEditorRasterPixels,
  encodeEditorRasterPixels,
  encodeRasterFragment,
  RasterImageResourceLimitError,
} from './image-state';
import {
  assertRasterPixelData,
  composeRasterPixels,
  fillRasterRegion,
  hideRasterRegion,
  removeRasterColor,
  type RasterPixelData,
} from './pixels';
import { findRegion } from './region';

/** Fixed local failure codes. Messages and resource URLs never cross this boundary. */
export type RasterComputeFailure =
  | 'invalid-command'
  | 'resource-limit'
  | 'compute-failed'
  | 'cancelled';
export class RasterComputeError extends Error {
  constructor(readonly code: RasterComputeFailure) {
    super(code);
    this.name = 'RasterComputeError';
  }
}
type Rgba = readonly [number, number, number, number];
/** Dedicated-worker requests contain admitted immutable source snapshots. */
export type RasterComputeCommand =
  | { kind: 'decode'; metadata: EditorRasterMetadata }
  | {
      kind: 'encode';
      metadata: EditorRasterMetadata;
      before: RasterPixelData;
      after: RasterPixelData;
    }
  | {
      kind: 'region';
      pixels: RasterPixelData;
      selection: SelectionMask;
      seed: SourcePoint;
      tolerance: number;
      grow: number;
      contiguous: boolean;
    }
  | {
      kind: 'edit';
      metadata: EditorRasterMetadata;
      pixels: RasterPixelData;
      region: Uint8Array;
      selection: SelectionMask;
      action: 'fill' | 'hide' | 'remove';
      color: Rgba;
    }
  | { kind: 'fragment'; pixels: RasterPixelData; selection: SelectionMask; bounds: PixelBounds };
type RasterEncodedCandidate = { metadata: EditorRasterMetadata; visibleFullDataUrl: string };
export type RasterComputeValue =
  | { kind: 'decoded'; pixels: RasterPixelData }
  | { kind: 'encoded'; candidate: RasterEncodedCandidate }
  | { kind: 'region'; mask: Uint8Array }
  | { kind: 'fragment'; dataUrl: string };
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function metadata(value: unknown): EditorRasterMetadata {
  const result = parseEditorRasterMetadata(
    value,
    (source, kind): source is string =>
      isImageDataUrl(source) && (kind === 'image' || source.startsWith('data:image/png;'))
  );
  if (!result) throw new RasterComputeError('invalid-command');
  return result;
}
function pixels(value: unknown): RasterPixelData {
  if (
    !record(value) ||
    typeof value['width'] !== 'number' ||
    typeof value['height'] !== 'number' ||
    !(value['color'] instanceof Uint8ClampedArray) ||
    !(value['visibility'] === null || value['visibility'] instanceof Uint8Array) ||
    !(value['key'] === null || value['key'] instanceof Uint8ClampedArray)
  )
    throw new RasterComputeError('invalid-command');
  const result = {
    width: value['width'],
    height: value['height'],
    color: value['color'],
    visibility: value['visibility'],
    key: value['key'],
  };
  assertRasterPixelData(result);
  return result;
}
function selection(value: unknown, count: number): SelectionMask {
  if (value !== null && !(value instanceof Uint8Array))
    throw new RasterComputeError('invalid-command');
  assertSelectionMask(value, count);
  return value;
}
function bounds(value: unknown, size: RasterPixelData): PixelBounds {
  if (
    !record(value) ||
    typeof value['x'] !== 'number' ||
    typeof value['y'] !== 'number' ||
    typeof value['width'] !== 'number' ||
    typeof value['height'] !== 'number'
  )
    throw new RasterComputeError('invalid-command');
  const result = { x: value['x'], y: value['y'], width: value['width'], height: value['height'] };
  assertRasterSize(result);
  if (
    !Number.isInteger(result.x) ||
    !Number.isInteger(result.y) ||
    result.x < 0 ||
    result.y < 0 ||
    result.x + result.width > size.width ||
    result.y + result.height > size.height
  )
    throw new RasterComputeError('invalid-command');
  return result;
}
function rgba(value: unknown): Rgba {
  if (
    !Array.isArray(value) ||
    value['length'] !== 4 ||
    !value['every'](
      (channel) =>
        typeof channel === 'number' && Number.isInteger(channel) && channel >= 0 && channel <= 255
    )
  )
    throw new RasterComputeError('invalid-command');
  const r: unknown = value[0],
    g: unknown = value[1],
    b: unknown = value[2],
    a: unknown = value[3];
  if (
    typeof r !== 'number' ||
    typeof g !== 'number' ||
    typeof b !== 'number' ||
    typeof a !== 'number'
  )
    throw new RasterComputeError('invalid-command');
  return [r, g, b, a];
}
/** Parse all request values before decoding, allocating output planes or changing a target. */
function parseCommand(value: unknown): RasterComputeCommand {
  if (!record(value)) throw new RasterComputeError('invalid-command');
  if (value['kind'] === 'decode') return { kind: 'decode', metadata: metadata(value['metadata']) };
  if (value['kind'] === 'encode') {
    const before = pixels(value['before']),
      after = pixels(value['after']),
      state = metadata(value['metadata']);
    if (
      before.width !== after.width ||
      before.height !== after.height ||
      before.width !== state.sniptaleRasterState.width ||
      before.height !== state.sniptaleRasterState.height
    )
      throw new RasterComputeError('invalid-command');
    return { kind: 'encode', metadata: state, before, after };
  }
  const source = pixels(value['pixels']),
    count = assertRasterSize(source),
    mask = selection(value['selection'], count);
  if (value['kind'] === 'fragment')
    return {
      kind: 'fragment',
      pixels: source,
      selection: mask,
      bounds: bounds(value['bounds'], source),
    };
  if (value['kind'] === 'region') {
    if (
      !record(value['seed']) ||
      typeof value['seed']['x'] !== 'number' ||
      typeof value['seed']['y'] !== 'number' ||
      !Number.isInteger(value['seed']['x']) ||
      !Number.isInteger(value['seed']['y']) ||
      value['seed']['x'] < 0 ||
      value['seed']['y'] < 0 ||
      value['seed']['x'] >= source.width ||
      value['seed']['y'] >= source.height ||
      typeof value['tolerance'] !== 'number' ||
      !Number.isInteger(value['tolerance']) ||
      value['tolerance'] < 0 ||
      value['tolerance'] > 255 ||
      typeof value['grow'] !== 'number' ||
      !Number.isSafeInteger(value['grow']) ||
      value['grow'] < 0 ||
      typeof value['contiguous'] !== 'boolean'
    )
      throw new RasterComputeError('invalid-command');
    return {
      kind: 'region',
      pixels: source,
      selection: mask,
      seed: { x: value['seed']['x'], y: value['seed']['y'] },
      tolerance: value['tolerance'],
      grow: value['grow'],
      contiguous: value['contiguous'],
    };
  }
  if (value['kind'] === 'edit') {
    const state = metadata(value['metadata']),
      region = selection(value['region'], count);
    if (
      !region ||
      source.width !== state.sniptaleRasterState.width ||
      source.height !== state.sniptaleRasterState.height ||
      (value['action'] !== 'fill' && value['action'] !== 'hide' && value['action'] !== 'remove')
    )
      throw new RasterComputeError('invalid-command');
    return {
      kind: 'edit',
      metadata: state,
      pixels: source,
      region,
      selection: mask,
      action: value['action'],
      color: rgba(value['color']),
    };
  }
  throw new RasterComputeError('invalid-command');
}
/** Reject malformed requests with a fixed code, including failures in nested plane validation. */
export function parseRasterComputeCommand(value: unknown): RasterComputeCommand {
  try {
    return parseCommand(value);
  } catch {
    throw new RasterComputeError('invalid-command');
  }
}
/** Execute only parsed commands. Worker and deterministic tests share this implementation. */
export async function executeRasterCompute(
  value: unknown,
  signal?: AbortSignal
): Promise<RasterComputeValue> {
  const command = parseRasterComputeCommand(value);
  signal?.throwIfAborted();
  switch (command.kind) {
    case 'decode':
      return { kind: 'decoded', pixels: await decodeEditorRasterPixels(command.metadata, signal) };
    case 'encode':
      return {
        kind: 'encoded',
        candidate: await encodeEditorRasterPixels(
          command.metadata,
          command.before,
          command.after,
          signal
        ),
      };
    case 'fragment':
      return {
        kind: 'fragment',
        dataUrl: await encodeRasterFragment(
          command.pixels,
          command.bounds,
          command.selection,
          signal
        ),
      };
    case 'region':
      return {
        kind: 'region',
        mask: findRegion({
          ...command.pixels,
          rgba: composeRasterPixels(command.pixels),
          selection: command.selection,
          seed: command.seed,
          tolerance: command.tolerance,
          grow: command.grow,
          contiguous: command.contiguous,
        }),
      };
    case 'edit': {
      const after =
        command.action === 'fill'
          ? fillRasterRegion(command.pixels, command.region, command.color)
          : command.action === 'hide'
            ? hideRasterRegion(command.pixels, command.region)
            : removeRasterColor(
                command.pixels,
                command.region,
                [command.color[0], command.color[1], command.color[2]],
                command.selection
              );
      return {
        kind: 'encoded',
        candidate: await encodeEditorRasterPixels(command.metadata, command.pixels, after, signal),
      };
    }
  }
}
export function rasterComputeFailure(error: unknown): RasterComputeFailure {
  return error instanceof RasterComputeError
    ? error.code
    : error instanceof RasterImageResourceLimitError
      ? 'resource-limit'
      : 'compute-failed';
}
/** A Canvas owns one client. Cancel terminates its active worker and permits a lazy retry. */
export interface RasterComputeClient {
  run(command: RasterComputeCommand, signal?: AbortSignal): Promise<RasterComputeValue>;
  cancel(): void;
  dispose(): void;
}
export type RasterWorker = Pick<
  Worker,
  'postMessage' | 'terminate' | 'addEventListener' | 'removeEventListener'
>;
function parseResult(value: unknown): RasterComputeValue {
  if (!record(value)) throw new RasterComputeError('compute-failed');
  if (value['kind'] === 'decoded') return { kind: 'decoded', pixels: pixels(value['pixels']) };
  if (
    value['kind'] === 'encoded' &&
    record(value['candidate']) &&
    typeof value['candidate']['visibleFullDataUrl'] === 'string' &&
    isImageDataUrl(value['candidate']['visibleFullDataUrl'])
  )
    return {
      kind: 'encoded',
      candidate: {
        metadata: metadata(value['candidate']['metadata']),
        visibleFullDataUrl: value['candidate']['visibleFullDataUrl'],
      },
    };
  if (value['kind'] === 'region' && value['mask'] instanceof Uint8Array) {
    assertSelectionMask(value['mask'], value['mask'].length);
    return { kind: 'region', mask: value['mask'] };
  }
  if (
    value['kind'] === 'fragment' &&
    typeof value['dataUrl'] === 'string' &&
    isImageDataUrl(value['dataUrl'])
  )
    return { kind: 'fragment', dataUrl: value['dataUrl'] };
  throw new RasterComputeError('compute-failed');
}
function checkedResult(command: RasterComputeCommand, value: unknown): RasterComputeValue {
  const result = parseResult(value);
  const size =
    command.kind === 'decode' || command.kind === 'encode'
      ? command.metadata.sniptaleRasterState
      : command.pixels;
  if (
    command.kind === 'decode' &&
    result.kind === 'decoded' &&
    result.pixels.width === size.width &&
    result.pixels.height === size.height
  )
    return result;
  if (
    command.kind === 'region' &&
    result.kind === 'region' &&
    result.mask.length === size.width * size.height
  )
    return result;
  if (command.kind === 'fragment' && result.kind === 'fragment') return result;
  if (
    (command.kind === 'edit' || command.kind === 'encode') &&
    result.kind === 'encoded' &&
    result.candidate.metadata.sniptaleRasterState.width === size.width &&
    result.candidate.metadata.sniptaleRasterState.height === size.height
  )
    return result;
  throw new RasterComputeError('compute-failed');
}
/** Create a dedicated local module Worker only when the first operation starts. */
export function createRasterComputeClient(options: {
  createWorker: () => RasterWorker;
}): RasterComputeClient {
  let worker: RasterWorker | null = null,
    disposed = false,
    sequence = 0;
  let rejectActive: (() => void) | null = null;
  function cancel() {
    rejectActive?.();
    rejectActive = null;
    worker?.terminate();
    worker = null;
  }
  return {
    cancel,
    dispose() {
      disposed = true;
      cancel();
    },
    async run(command, signal) {
      if (disposed || signal?.aborted) throw new RasterComputeError('cancelled');
      parseRasterComputeCommand(command);
      if (rejectActive) cancel();
      try {
        worker ??= options.createWorker();
      } catch {
        throw new RasterComputeError('compute-failed');
      }
      const current = worker,
        id = ++sequence;
      return new Promise<RasterComputeValue>((resolve, reject) => {
        function cleanup() {
          current.removeEventListener('message', message);
          current.removeEventListener('error', failed);
          signal?.removeEventListener('abort', cancel);
          if (rejectActive === aborted) rejectActive = null;
        }
        function aborted() {
          cleanup();
          reject(new RasterComputeError('cancelled'));
        }
        function failed() {
          cleanup();
          current.terminate();
          if (worker === current) worker = null;
          reject(new RasterComputeError('compute-failed'));
        }
        function message(event: MessageEvent<unknown>) {
          if (!record(event.data) || event.data['id'] !== id) return;
          cleanup();
          if (event.data['ok'] !== true) {
            const code = event.data['code'];
            reject(
              new RasterComputeError(
                code === 'invalid-command' || code === 'resource-limit' || code === 'cancelled'
                  ? code
                  : 'compute-failed'
              )
            );
            return;
          }
          try {
            resolve(checkedResult(command, event.data['value']));
          } catch {
            reject(new RasterComputeError('compute-failed'));
          }
        }
        rejectActive = aborted;
        current.addEventListener('message', message);
        current.addEventListener('error', failed);
        signal?.addEventListener('abort', cancel, { once: true });
        // Structured clone preserves accepted buffers. They are deliberately never transferred.
        try {
          current.postMessage({ id, command });
        } catch {
          failed();
        }
      });
    },
  };
}

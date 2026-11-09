import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createDefaultSimplifySettings } from '../../features/simplify/settings';

vi.mock('../../platform/i18n', () => ({ translate: (key: string) => key }));

const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';

interface WorkerScope {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage: ReturnType<typeof vi.fn>;
}

const scope: WorkerScope = { onmessage: null, postMessage: vi.fn() };
const bitmap = { width: 1, height: 1, close: vi.fn() };
const decode = vi.fn(async (_blob: Blob) => bitmap);
const fetchRequest = vi.fn(() => {
  throw new Error('Worker must decode inline PNG bytes without fetch');
});

class FakeCanvas {
  static instances: FakeCanvas[] = [];
  static unavailable = false;
  static encodeFailure = false;
  readonly context = {
    drawImage: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    resetTransform: vi.fn(),
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    fillRect: vi.fn(),
    roundRect: vi.fn(),
    fill: vi.fn(),
    getImageData: () => ({
      width: this.width,
      height: this.height,
      data: new Uint8ClampedArray(this.width * this.height * 4).fill(255),
    }),
  };
  constructor(
    readonly width: number,
    readonly height: number
  ) {
    FakeCanvas.instances.push(this);
  }
  getContext() {
    return FakeCanvas.unavailable ? null : this.context;
  }
  async convertToBlob(options: ImageEncodeOptions) {
    if (FakeCanvas.encodeFailure) throw new Error('private encoder failure');
    expect(options.type).toBe('image/png');
    return new Blob([Uint8Array.from(atob(png.slice(22)), (value) => value.charCodeAt(0))], {
      type: 'image/png',
    });
  }
}

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  bitmap.width = 1;
  bitmap.height = 1;
  FakeCanvas.instances = [];
  FakeCanvas.unavailable = false;
  FakeCanvas.encodeFailure = false;
  decode.mockResolvedValue(bitmap);
  scope.onmessage = null;
  vi.stubGlobal('self', scope);
  vi.stubGlobal('fetch', fetchRequest);
  vi.stubGlobal('createImageBitmap', decode);
  vi.stubGlobal('OffscreenCanvas', FakeCanvas);
  await import('./worker');
});

afterEach(() => vi.unstubAllGlobals());

function prepare(dataUrl: unknown) {
  const event = new MessageEvent('message', {
    data: { requestId: 7, command: { operation: 'prepare', sessionId: 'source-1', dataUrl } },
  });
  expect(event.origin).toBe('');
  expect(scope.onmessage).toBeTypeOf('function');
  scope.onmessage?.(event);
}

it('accepts empty-origin dedicated-worker delivery and decodes the exact PNG bytes without fetch', async () => {
  prepare(png);
  await vi.waitFor(() => expect(scope.postMessage).toHaveBeenCalledOnce());
  expect(scope.postMessage).toHaveBeenCalledWith({
    requestId: 7,
    completion: { sessionId: 'source-1', width: 1, height: 1, version: expect.any(String) },
  });
  expect(decode).toHaveBeenCalledOnce();
  const blob = decode.mock.calls[0]?.[0];
  expect(blob).toBeInstanceOf(Blob);
  if (!blob) throw new Error('Worker did not decode a PNG Blob');
  expect(blob.type).toBe('image/png');
  expect(new Uint8Array(await blob.arrayBuffer())).toEqual(
    Uint8Array.from(atob(png.slice(22)), (character) => character.charCodeAt(0))
  );
  expect(fetchRequest).not.toHaveBeenCalled();
  expect(bitmap.close).toHaveBeenCalledOnce();
});

it.each(['https://example.com/source.png', 'data:image/png;base64,%%%', null])(
  'rejects malformed or external source %s before image decoding',
  (dataUrl) => {
    prepare(dataUrl);
    expect(decode).not.toHaveBeenCalled();
    expect(fetchRequest).not.toHaveBeenCalled();
    expect(scope.postMessage).not.toHaveBeenCalled();
  }
);

it('returns the fixed worker failure response when image decoding fails', async () => {
  decode.mockRejectedValueOnce(new Error('private decoder details'));
  prepare(png);
  await vi.waitFor(() =>
    expect(scope.postMessage).toHaveBeenCalledWith({
      requestId: 7,
      error: 'Simplify worker failed',
    })
  );
  expect(fetchRequest).not.toHaveBeenCalled();
});

it('rejects changed decoded dimensions and closes the bitmap', async () => {
  bitmap.width = 2;
  prepare(png);
  await vi.waitFor(() =>
    expect(scope.postMessage).toHaveBeenCalledWith({
      requestId: 7,
      error: 'Simplify worker failed',
    })
  );
  expect(bitmap.close).toHaveBeenCalledOnce();
  expect(fetchRequest).not.toHaveBeenCalled();
});

function dispatch(command: unknown, requestId = 8) {
  scope.onmessage?.(new MessageEvent('message', { data: { requestId, command } }));
}

function render(overrides: Record<string, unknown> = {}) {
  return {
    operation: 'render',
    sessionId: 'source-1',
    settings: createDefaultSimplifySettings(),
    region: { x: 0, y: 0, width: 1, height: 1 },
    ...overrides,
  };
}

async function prepared() {
  prepare(png);
  await vi.waitFor(() => expect(scope.postMessage).toHaveBeenCalledOnce());
  scope.postMessage.mockClear();
}

async function expectFailure() {
  await vi.waitFor(() =>
    expect(scope.postMessage).toHaveBeenCalledWith({
      requestId: 8,
      error: 'Simplify worker failed',
    })
  );
}

it.each([
  { automatic: true, manualKind: 'text' },
  { automatic: false, manualKind: 'image' },
  { automatic: false, manualKind: 'text' },
] as const)('renders and PNG-encodes an exact crop with settings %j', async (settings) => {
  await prepared();
  dispatch(render({ settings: { ...createDefaultSimplifySettings(), ...settings } }));
  await vi.waitFor(() =>
    expect(scope.postMessage).toHaveBeenCalledWith({
      requestId: 8,
      completion: {
        sessionId: 'source-1',
        width: 1,
        height: 1,
        version: expect.any(String),
        dataUrl: png,
      },
    })
  );
  const [source, output, tile] = FakeCanvas.instances;
  expect(output?.context.drawImage).toHaveBeenCalledWith(source, 0, 0);
  expect(tile?.context.drawImage).toHaveBeenCalledWith(output, 0, 0, 1, 1, 0, 0, 1, 1);
  expect(tile?.width).toBe(1);
  expect(tile?.height).toBe(1);
  expect(fetchRequest).not.toHaveBeenCalled();
});

it('projects rotated manual text into padded local coordinates and removes padding from the output', async () => {
  await prepared();
  dispatch(
    render({
      settings: { ...createDefaultSimplifySettings(), automatic: false },
      region: { x: 0, y: 0, width: 1, height: 1, rotation: 450 },
    })
  );
  await vi.waitFor(() =>
    expect(scope.postMessage).toHaveBeenCalledWith({
      requestId: 8,
      completion: {
        sessionId: 'source-1',
        width: 1,
        height: 1,
        version: expect.any(String),
        dataUrl: png,
      },
    })
  );
  const [source, localSource, localOutput, tile] = FakeCanvas.instances;
  expect(localSource?.width).toBe(9);
  expect(localSource?.height).toBe(9);
  expect(localSource?.context.translate).toHaveBeenCalledWith(4.5, 4.5);
  expect(localSource?.context.rotate).toHaveBeenCalledWith(-Math.PI / 2);
  expect(localSource?.context.drawImage).toHaveBeenCalledWith(source, -0.5, -0.5);
  expect(localSource?.context.resetTransform).toHaveBeenCalledOnce();
  expect(tile?.context.drawImage).toHaveBeenCalledWith(localOutput, 4, 4, 1, 1, 0, 0, 1, 1);
});

it('refuses rendering before preparation', async () => {
  dispatch(render());
  await expectFailure();
  expect(FakeCanvas.instances).toHaveLength(0);
});

it.each([
  { sessionId: 'other-session' },
  { region: { x: 1, y: 0, width: 1, height: 1 } },
  { region: { x: 0, y: 1, width: 1, height: 1 } },
  { operation: 'dispose' },
])('refuses commands outside the prepared session or source bounds: %j', async (overrides) => {
  await prepared();
  dispatch(render(overrides));
  await expectFailure();
  expect(FakeCanvas.instances).toHaveLength(1);
});

it('refuses replacement preparation without decoding another source', async () => {
  await prepared();
  dispatch({ operation: 'prepare', sessionId: 'source-1', dataUrl: png });
  await expectFailure();
  expect(decode).toHaveBeenCalledOnce();
});

it.each([
  null,
  {},
  { requestId: '8', command: {} },
  { requestId: 0.5, command: {} },
  { requestId: 8, command: null },
  { requestId: 8, command: { operation: 'prepare', dataUrl: png } },
  {
    requestId: 8,
    command: render({ settings: { ...createDefaultSimplifySettings(), sensitivity: 91 } }),
  },
  { requestId: 8, command: render({ region: { x: -1, y: 0, width: 1, height: 1 } }) },
])('rejects invalid envelopes or payloads before canvas work: %j', (data) => {
  scope.onmessage?.(new MessageEvent('message', { data }));
  expect(decode).not.toHaveBeenCalled();
  expect(FakeCanvas.instances).toHaveLength(0);
  expect(scope.postMessage).not.toHaveBeenCalled();
});

it('closes the bitmap and reports failure if the source canvas is unavailable', async () => {
  FakeCanvas.unavailable = true;
  dispatch({ operation: 'prepare', sessionId: 'source-1', dataUrl: png });
  await expectFailure();
  expect(bitmap.close).toHaveBeenCalledOnce();
});

it('reports encoding failure without publishing a partial completion and allows retry', async () => {
  await prepared();
  FakeCanvas.encodeFailure = true;
  dispatch(render());
  await expectFailure();
  FakeCanvas.encodeFailure = false;
  scope.postMessage.mockClear();
  dispatch(render());
  await vi.waitFor(() =>
    expect(scope.postMessage).toHaveBeenCalledWith({
      requestId: 8,
      completion: {
        sessionId: 'source-1',
        width: 1,
        height: 1,
        version: expect.any(String),
        dataUrl: png,
      },
    })
  );
  expect(decode).toHaveBeenCalledOnce();
});

// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRealtimeVideoUpscaler } from './vendor/clark-x2/realtimeVideoUpscaler.js';

afterEach(() => vi.unstubAllGlobals());

it('destroys the acquired Clark device when model loading fails before the backend exists', async () => {
  const probe = { destroy: vi.fn() };
  const device = { destroy: vi.fn() };
  const requestDevice = vi.fn().mockResolvedValueOnce(probe).mockResolvedValueOnce(device);
  const adapter = { features: new Set(['shader-f16']), requestDevice };
  vi.stubGlobal('navigator', {
    gpu: { requestAdapter: async () => adapter, getPreferredCanvasFormat: () => 'rgba8unorm' },
  });
  vi.stubGlobal('document', {
    createElement: () => ({ getContext: () => ({ configure: vi.fn() }) }),
  });
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Model unavailable')));
  await expect(createRealtimeVideoUpscaler({ width: 128, height: 128 })).rejects.toThrow(
    'Model unavailable'
  );
  expect(probe.destroy).toHaveBeenCalledOnce();
  expect(device.destroy).toHaveBeenCalledOnce();
});

import {
  createExportEnhancer,
  ExportEnhancementError,
  probeEnhancementCapabilities,
} from './enhancer';
import type { ClarkBackend } from './vendor/clark-x2/realtimeVideoUpscaler.js';
import { parseEnhancementMode } from './mode';
import type { BicubicBackend } from './bicubic';

const request = {
  sourceSize: { width: 100, height: 80 },
  roi: { x: 0, y: 0, width: 100, height: 80 },
  targetSize: { width: 200, height: 160 },
  zoomActive: true,
};
const frameClose = vi.fn();
beforeEach(() => {
  frameClose.mockClear();
  vi.stubGlobal(
    'VideoFrame',
    class {
      close = frameClose;
      constructor(
        readonly source: HTMLCanvasElement,
        readonly init: VideoFrameInit
      ) {}
    }
  );
});
function sourceRequest() {
  return { ...request, source: document.createElement('canvas') };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function backend(width = 328, height = 288): ClarkBackend {
  const image = document.createElement('canvas');
  image.width = width;
  image.height = height;
  return { ready: true, unavailable: false, enhance: vi.fn(async () => image), destroy: vi.fn() };
}
function bicubicBackend(): BicubicBackend {
  return {
    gl: { isContextLost: () => false, finish: vi.fn() },
    update: vi.fn(),
    dispose: vi.fn(),
    draw: vi.fn((_region, _mode, _strength, width, height) => {
      const image = document.createElement('canvas');
      image.width = width;
      image.height = height;
      return image;
    }),
  };
}

it('defaults to off and imports or allocates no backend for off, inactive or non-growing requests', async () => {
  const createElement = vi.fn(() => {
    throw new Error('Unexpected allocation');
  });
  const createClark = vi.fn(),
    createBicubic = vi.fn();
  for (const mode of [undefined, 'off', 'clark-x2', 'bicubic-sharpen'] as const) {
    const enhancer = createExportEnhancer({
      ...(mode ? { mode } : {}),
      document: { createElement },
      createClark,
      createBicubic,
    });
    const source = sourceRequest();
    if (mode && mode !== 'off') source.zoomActive = false;
    expect(
      await enhancer.withEnhancedRegion(source, () => {
        throw new Error('Unexpected output');
      })
    ).toEqual({ applied: false, tileCount: 0 });
    await enhancer.withEnhancedRegion(
      { ...source, zoomActive: true, targetSize: { width: 50, height: 40 } },
      () => {}
    );
    await enhancer.dispose();
  }
  expect(createElement).not.toHaveBeenCalled();
  expect(createClark).not.toHaveBeenCalled();
  expect(createBicubic).not.toHaveBeenCalled();
  expect(() => parseEnhancementMode('span')).toThrow(TypeError);
});

it('keeps the original source borrowed and produces exact source crop and destination before consumption', async () => {
  const driver = backend();
  const createClark = vi.fn(async () => driver);
  const enhancer = createExportEnhancer({ mode: 'clark-x2', createClark });
  const consume = vi.fn();
  const source = sourceRequest();
  expect(await enhancer.withEnhancedRegion(source, consume)).toEqual({
    applied: true,
    tileCount: 1,
  });
  expect(createClark).toHaveBeenCalledExactlyOnceWith({ width: 164, height: 144 });
  expect(consume.mock.calls[0]?.[0]).toEqual({
    image: expect.objectContaining({ width: 328, height: 288 }),
    sourceRect: { x: 64, y: 64, width: 200, height: 160 },
    destination: { x: 0, y: 0, width: 200, height: 160 },
  });
  expect(frameClose).toHaveBeenCalledOnce();
  await enhancer.withEnhancedRegion(source, consume);
  expect(createClark).toHaveBeenCalledOnce();
  await enhancer.dispose();
  expect(driver.destroy).toHaveBeenCalledOnce();
  expect(source.source.width).toBe(300);
});

it('cancels initialization, rejects parallel requests and drains the acquired backend before disposal', async () => {
  const initialized = deferred<ClarkBackend>();
  const driver = backend();
  const enhancer = createExportEnhancer({
    mode: 'clark-x2',
    createClark: () => initialized.promise,
  });
  const controller = new AbortController();
  const consume = vi.fn();
  const running = enhancer.withEnhancedRegion(
    { ...sourceRequest(), signal: controller.signal },
    consume
  );
  await expect(enhancer.withEnhancedRegion(sourceRequest(), consume)).rejects.toMatchObject({
    code: 'busy',
  });
  controller.abort();
  const closed = vi.fn();
  const disposing = enhancer.dispose().then(closed);
  await Promise.resolve();
  expect(closed).not.toHaveBeenCalled();
  initialized.resolve(driver);
  await expect(running).rejects.toMatchObject({ name: 'AbortError' });
  await disposing;
  expect(driver.destroy).toHaveBeenCalledOnce();
  expect(consume).not.toHaveBeenCalled();
  await expect(enhancer.withEnhancedRegion(sourceRequest(), consume)).rejects.toMatchObject({
    code: 'disposed',
  });
});

it('holds source and frame until inference settles and discards an aborted late output', async () => {
  const inference = deferred<HTMLCanvasElement>();
  const driver = backend();
  driver.enhance = () => inference.promise;
  const enhancer = createExportEnhancer({ mode: 'clark-x2', createClark: async () => driver });
  const controller = new AbortController();
  const consume = vi.fn();
  const running = enhancer.withEnhancedRegion(
    { ...sourceRequest(), signal: controller.signal },
    consume
  );
  await Promise.resolve();
  expect(frameClose).not.toHaveBeenCalled();
  controller.abort();
  const disposing = enhancer.dispose();
  expect(driver.destroy).not.toHaveBeenCalled();
  inference.resolve(document.createElement('canvas'));
  await expect(running).rejects.toMatchObject({ name: 'AbortError' });
  await disposing;
  expect(frameClose).toHaveBeenCalledOnce();
  expect(driver.destroy).toHaveBeenCalledOnce();
  expect(consume).not.toHaveBeenCalled();
});

it('drains an active consumer and prevents later tiles after cancellation', async () => {
  const consumed = deferred<void>();
  const driver = bicubicBackend();
  const enhancer = createExportEnhancer({ mode: 'bicubic-sharpen', createBicubic: () => driver });
  const controller = new AbortController();
  const consume = vi.fn(() => consumed.promise);
  const running = enhancer.withEnhancedRegion(
    { ...sourceRequest(), signal: controller.signal, coreLimit: { width: 50, height: 40 } },
    consume
  );
  await Promise.resolve();
  expect(consume).toHaveBeenCalledOnce();
  controller.abort();
  const disposing = enhancer.dispose();
  expect(driver.dispose).not.toHaveBeenCalled();
  consumed.resolve();
  await expect(running).rejects.toMatchObject({ name: 'AbortError' });
  await disposing;
  expect(driver.dispose).toHaveBeenCalledOnce();
  expect(consume).toHaveBeenCalledOnce();
});

it.each(['unavailable', 'init', 'loss', 'invalid'] as const)(
  'rejects selected Clark failures without switching algorithms: %s',
  async (failure) => {
    const driver = backend();
    const fallback = vi.fn();
    const consume = vi.fn();
    const enhancer = createExportEnhancer({
      mode: 'clark-x2',
      createBicubic: fallback,
      createClark: async () => {
        if (failure === 'unavailable') return null;
        if (failure === 'init') throw new Error('Init failure');
        if (failure === 'loss') return { ...driver, unavailable: true };
        return { ...driver, ready: false };
      },
    });
    await expect(enhancer.withEnhancedRegion(sourceRequest(), consume)).rejects.toMatchObject({
      name: 'ExportEnhancementError',
      code: {
        unavailable: 'unavailable',
        init: 'initialization-failed',
        loss: 'device-lost',
        invalid: 'invalid-output',
      }[failure],
    });
    expect(fallback).not.toHaveBeenCalled();
    expect(consume).not.toHaveBeenCalled();
    await enhancer.dispose();
  }
);

it('closes failed inference frames and rejects stale output after device loss', async () => {
  for (const rejection of [true, false]) {
    const driver = backend();
    const lost = {
      ...driver,
      get unavailable() {
        return !rejection && frameClose.mock.calls.length > 0;
      },
      enhance: async () => {
        if (rejection) throw new Error('GPU failure');
        return document.createElement('canvas');
      },
    };
    frameClose.mockClear();
    const enhancer = createExportEnhancer({ mode: 'clark-x2', createClark: async () => lost });
    await expect(enhancer.withEnhancedRegion(sourceRequest(), vi.fn())).rejects.toBeInstanceOf(
      ExportEnhancementError
    );
    expect(frameClose).toHaveBeenCalledOnce();
    await enhancer.dispose();
  }
});

it('releases the old size backend and preserves completed tile ordering', async () => {
  const drivers: ClarkBackend[] = [];
  const enhancer = createExportEnhancer({
    mode: 'clark-x2',
    createClark: async ({ width, height }) => {
      const driver = backend(width * 2, height * 2);
      drivers.push(driver);
      return driver;
    },
  });
  const tiles: number[] = [];
  await enhancer.withEnhancedRegion(
    { ...sourceRequest(), coreLimit: { width: 60, height: 40 } },
    (tile) => {
      tiles.push(tile.destination.x);
    }
  );
  expect(tiles).toEqual([0, 120, 0, 120]);
  expect(drivers.length).toBe(4);
  expect(
    drivers.slice(0, -1).every((driver) => vi.mocked(driver.destroy).mock.calls.length === 1)
  ).toBe(true);
  await enhancer.dispose();
  expect(drivers.at(-1)?.destroy).toHaveBeenCalledOnce();
});

it('uses the real default Clark runtime and reports absent WebGPU explicitly', async () => {
  vi.stubGlobal('navigator', {});
  const enhancer = createExportEnhancer({ mode: 'clark-x2' });
  await expect(enhancer.withEnhancedRegion(sourceRequest(), vi.fn())).rejects.toMatchObject({
    code: 'unavailable',
  });
  await enhancer.dispose();
  expect(await probeEnhancementCapabilities()).toEqual({
    clark: false,
    reason: 'webgpu-unavailable',
  });
});

it('reports unsupported f16 and adapter failures without claiming support', async () => {
  vi.stubGlobal('navigator', { gpu: { requestAdapter: async () => ({ features: new Set() }) } });
  expect(await probeEnhancementCapabilities()).toEqual({
    clark: false,
    reason: 'shader-f16-unavailable',
  });
  vi.stubGlobal('navigator', {
    gpu: {
      requestAdapter: async () => {
        throw new Error('Driver unavailable');
      },
    },
  });
  expect(await probeEnhancementCapabilities()).toEqual({
    clark: false,
    reason: 'adapter-request-failed',
  });
});

function glFixture(compiled = true) {
  const loseContext = vi.fn();
  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    ARRAY_BUFFER: 5,
    STATIC_DRAW: 6,
    FLOAT: 7,
    TEXTURE_2D: 8,
    TEXTURE_MIN_FILTER: 9,
    TEXTURE_MAG_FILTER: 10,
    LINEAR: 11,
    TEXTURE_WRAP_S: 12,
    TEXTURE_WRAP_T: 13,
    CLAMP_TO_EDGE: 14,
    UNPACK_FLIP_Y_WEBGL: 15,
    RGBA: 16,
    UNSIGNED_BYTE: 17,
    TRIANGLES: 18,
    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn<(shader: unknown, text: string) => void>(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => compiled),
    getShaderInfoLog: () => 'Shader rejected',
    createProgram: () => ({}),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: () => true,
    useProgram: vi.fn(),
    createBuffer: () => ({}),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    getAttribLocation: () => 0,
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    createTexture: () => ({}),
    bindTexture: vi.fn(),
    texParameteri: vi.fn(),
    pixelStorei: vi.fn(),
    texImage2D: vi.fn(),
    getUniformLocation: (_program: unknown, name: string) => name,
    uniform2f: vi.fn(),
    viewport: vi.fn(),
    uniform4fv: vi.fn(),
    uniform1i: vi.fn(),
    uniform1f: vi.fn(),
    drawArrays: vi.fn(),
    deleteShader: vi.fn(),
    deleteProgram: vi.fn(),
    deleteBuffer: vi.fn(),
    deleteTexture: vi.fn(),
    getExtension: () => ({ loseContext }),
    finish: vi.fn(),
    isContextLost: () => false,
  };
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      constructor(
        public width: number,
        public height: number
      ) {}
      getContext() {
        return gl;
      }
    }
  );
  return { gl, loseContext };
}

it('runs the actual default bicubic upload and crop path with the prepared shader constants', async () => {
  const { gl, loseContext } = glFixture();
  const enhancer = createExportEnhancer({ mode: 'bicubic-sharpen' });
  const consume = vi.fn();
  await enhancer.withEnhancedRegion(sourceRequest(), consume);
  expect(gl.shaderSource.mock.calls[1]?.[1]).toContain('vec3(-.045),vec3(.045)');
  expect(gl.uniform4fv).toHaveBeenCalledWith('region', [32, 32, 100, 80]);
  expect(gl.uniform1i).toHaveBeenCalledWith('mode', 1);
  expect(gl.uniform1f).toHaveBeenCalledWith('strength', 0.35);
  expect(gl.viewport).toHaveBeenCalledWith(0, 0, 200, 160);
  expect(consume).toHaveBeenCalledOnce();
  await enhancer.withEnhancedRegion(sourceRequest(), consume);
  expect(gl.texImage2D).toHaveBeenCalledTimes(2);
  await enhancer.dispose();
  expect(gl.deleteShader).toHaveBeenCalledTimes(2);
  expect(loseContext).toHaveBeenCalledOnce();
});

it('releases actual bicubic initialization resources when the shader fails', async () => {
  const { gl, loseContext } = glFixture(false);
  const enhancer = createExportEnhancer({ mode: 'bicubic-sharpen' });
  await expect(enhancer.withEnhancedRegion(sourceRequest(), vi.fn())).rejects.toMatchObject({
    code: 'initialization-failed',
  });
  expect(gl.deleteShader).toHaveBeenCalledOnce();
  expect(loseContext).toHaveBeenCalledOnce();
  await enhancer.dispose();
});

it('rejects invalid input before allocation and preserves consumer failures while releasing the session', async () => {
  const driver = bicubicBackend();
  const create = vi.fn(() => driver);
  const enhancer = createExportEnhancer({ mode: 'bicubic-sharpen', createBicubic: create });
  await expect(
    enhancer.withEnhancedRegion({ ...sourceRequest(), roi: { ...request.roi, x: -1 } }, vi.fn())
  ).rejects.toMatchObject({ code: 'invalid-input' });
  expect(create).not.toHaveBeenCalled();
  const failed = new Error('Compositor rejected tile');
  await expect(
    enhancer.withEnhancedRegion(sourceRequest(), () => {
      throw failed;
    })
  ).rejects.toBe(failed);
  await enhancer.dispose();
  expect(driver.dispose).toHaveBeenCalledOnce();
});

it('detects bicubic device loss before consuming the current tile', async () => {
  const driver = bicubicBackend();
  let lost = false;
  driver.gl.isContextLost = () => lost;
  driver.gl.finish = () => {
    lost = true;
  };
  const consume = vi.fn();
  const enhancer = createExportEnhancer({ mode: 'bicubic-sharpen', createBicubic: () => driver });
  await expect(enhancer.withEnhancedRegion(sourceRequest(), consume)).rejects.toMatchObject({
    code: 'device-lost',
  });
  expect(consume).not.toHaveBeenCalled();
  await enhancer.dispose();
});

it('reports missing WebGL for the selected default bicubic backend without switching mode', async () => {
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      getContext() {
        return null;
      }
    }
  );
  const clark = vi.fn();
  const enhancer = createExportEnhancer({ mode: 'bicubic-sharpen', createClark: clark });
  await expect(enhancer.withEnhancedRegion(sourceRequest(), vi.fn())).rejects.toMatchObject({
    code: 'initialization-failed',
    mode: 'bicubic-sharpen',
  });
  expect(clark).not.toHaveBeenCalled();
  await enhancer.dispose();
});

// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createReviewSpatialTextures } from './spatial-textures';
import { createReviewSpatialRenderer } from './spatial-renderer';
import { resolveReviewSpatialFilterLevels } from './spatial-filter-levels';
import type { QuickEditHomography } from '../motion/spatial-geometry';
import { createPreviewRenderResources } from '../../../../workflows/video-review/preview-render-resources';
import {
  DEFAULT_CAMERA_DEPTH as DEFAULT_QUICK_EDIT_DEPTH,
  type CameraSpatialFrame as QuickEditSpatialFrame,
} from '../../project/motion/spatial';

const sessions: ReturnType<typeof createPreviewRenderResources>[] = [];
afterEach(() => {
  sessions.splice(0).forEach((session) => session.dispose());
  vi.restoreAllMocks();
});
function graphics() {
  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    MAX_TEXTURE_SIZE: 5,
    MAX_RENDERBUFFER_SIZE: 6,
    MAX_VIEWPORT_DIMS: 7,
    NO_ERROR: 0,
    FRAMEBUFFER_COMPLETE: 17,
    FRAMEBUFFER: 18,
    TEXTURE_2D: 3553,
    TEXTURE_MIN_FILTER: 10241,
    TEXTURE_MAG_FILTER: 10240,
    TEXTURE_WRAP_S: 10242,
    TEXTURE_WRAP_T: 10243,
    LINEAR: 9729,
    CLAMP_TO_EDGE: 33071,
    createFramebuffer: vi.fn<() => object | null>(() => ({})),
    deleteFramebuffer: vi.fn(),
    bindFramebuffer: vi.fn(),
    framebufferTexture2D: vi.fn(),
    checkFramebufferStatus: vi.fn(() => 17),
    uniform2fv: vi.fn(),
    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    deleteShader: vi.fn(),
    createProgram: vi.fn(() => ({})),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    deleteProgram: vi.fn(),
    createBuffer: vi.fn(() => ({})),
    createTexture: vi.fn<() => object | null>(() => ({})),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    useProgram: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    bindTexture: vi.fn(),
    activeTexture: vi.fn(),
    uniform1i: vi.fn(),
    texParameteri: vi.fn(),
    pixelStorei: vi.fn(),
    getUniformLocation: vi.fn((_program: unknown, name: string) => name),
    getParameter: vi.fn<(name: number) => unknown>((name: number) =>
      name === 7 ? new Int32Array([4096, 4096]) : 4096
    ),
    isContextLost: vi.fn(() => false),
    viewport: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
    uniformMatrix3fv: vi.fn(),
    uniform2f: vi.fn(),
    uniform4f: vi.fn(),
    texImage2D: vi.fn<(...args: unknown[]) => void>(),
    drawArrays: vi.fn(),
    getError: vi.fn(() => 0),
    deleteTexture: vi.fn(),
    deleteBuffer: vi.fn(),
    getExtension: vi.fn<(name: string) => unknown>((name) => {
      if (name === 'WEBGL_lose_context') return { loseContext };
      return name === 'OES_texture_half_float' ? { HALF_FLOAT_OES: 36193 } : {};
    }),
  };
  Object.defineProperties(gl, {
    drawingBufferWidth: { configurable: true, get: () => gpu().width },
    drawingBufferHeight: { configurable: true, get: () => gpu().height },
  });
  const gpu = () => getContext.mock.contexts[0] as HTMLCanvasElement;
  const loseContext = vi.fn();
  const context = { clearRect: vi.fn(), drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
  const getContext = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation((kind: string) => {
      if (kind === 'webgl') {
        return gl as unknown as CanvasRenderingContext2D;
      }
      return context;
    });
  return {
    gl,
    context,
    getContext,
    loseContext,
    gpu: () => getContext.mock.contexts[0] as HTMLCanvasElement,
  };
}

it('bounds filter levels and retains full fallback for uncertain precision or horizon', () => {
  const output = { width: 640, height: 360 };
  const identity: QuickEditHomography = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  expect(
    resolveReviewSpatialFilterLevels({ inverse: identity, output, precision: 23, blurWeights: [] })
  ).toBe(2);
  const magnified: QuickEditHomography = [0.5, 0, 0, 0, 0.5, 0, 0, 0, 1];
  expect(
    resolveReviewSpatialFilterLevels({
      inverse: magnified,
      output,
      precision: 23,
      blurWeights: [],
    })
  ).toBe(1);
  expect(
    resolveReviewSpatialFilterLevels({
      inverse: magnified,
      output,
      precision: 23,
      blurWeights: [1],
    })
  ).toBeGreaterThan(1);
  const minified: QuickEditHomography = [4, 0, 0, 0, 4, 0, 0, 0, 1];
  const sharp = resolveReviewSpatialFilterLevels({
    inverse: minified,
    output,
    precision: 23,
    blurWeights: [],
  });
  expect(sharp).toBeGreaterThanOrEqual(3);
  expect(sharp).toBeLessThan(8);
  expect(
    resolveReviewSpatialFilterLevels({
      inverse: identity,
      output: { width: 1920, height: 1080 },
      precision: 23,
      blurWeights: [1, 1],
    })
  ).toBe(7);
  for (const precision of [0, 15, NaN])
    expect(
      resolveReviewSpatialFilterLevels({ inverse: identity, output, precision, blurWeights: [] })
    ).toBe(8);
  expect(
    resolveReviewSpatialFilterLevels({
      inverse: [1, 0, 0, 0, 1, 0, -0.002, 0, 1],
      output,
      precision: 23,
      blurWeights: [],
    })
  ).toBe(8);
});

it('bounds float32 finite-step sampling over affine, oblique, padded and near-edge output positions', () => {
  const output = { width: 640, height: 360 };
  const matrices: QuickEditHomography[] = [
    [1, 0, 0, 0, 1, 0, 0, 0, 1],
    [3, 0.25, -280, -0.15, 2, 95, 0, 0, 1],
    [1.2, 0.12, -160, 0.08, 0.9, -80, 0.0003, -0.0002, 1],
    [0.8, -0.3, 70, 0.2, 0.9, -10, -0.0011, 0.0002, 1],
  ];
  const f = Math.fround;
  for (const inverse of matrices) {
    const levels = resolveReviewSpatialFilterLevels({
      inverse,
      output,
      precision: 23,
      blurWeights: [],
    });
    const m = inverse.map(f);
    const point = (x: number, y: number) => {
      const row = (offset: number) =>
        f(f(f(m[offset]! * x) + f(m[offset + 1]! * y)) + m[offset + 2]!);
      return [f(row(0) / row(6)), f(row(3) / row(6))];
    };
    for (let y = 0.5; y <= output.height; y += 11)
      for (let x = 0.5; x <= output.width; x += 13) {
        const p = point(x, y),
          px = point(x + 1, y),
          py = point(x, y + 1);
        const footprint = Math.max(
          Math.hypot(f(px[0]! - p[0]!), f(px[1]! - p[1]!)),
          Math.hypot(f(py[0]! - p[0]!), f(py[1]! - p[1]!))
        );
        expect(footprint).toBeLessThanOrEqual(2 ** (levels - 1));
      }
  }
});

it('releases omitted level storage and restores complete encoded levels when the required count grows', () => {
  const { gl } = graphics();
  const resources = resourceSession();
  const textures = createReviewSpatialTextures(gl as unknown as WebGLRenderingContext, resources);
  const source = document.createElement('canvas');
  source.width = 64;
  source.height = 32;
  textures.upload(source);
  const full = resources.counters.managedBytes;
  gl.drawArrays.mockClear();
  gl.bindTexture.mockClear();
  gl.deleteTexture.mockClear();
  const sizes = Array.from(textures.upload(source, 2));
  expect(gl.drawArrays).toHaveBeenCalledTimes(1);
  expect(gl.deleteTexture).toHaveBeenCalledTimes(6);
  expect(resources.counters.managedBytes).toBe(64 + 64 * 32 * 4 + 32 * 16 * 8);
  expect(resources.counters.managedBytes).toBeLessThan(full);
  expect(sizes).toEqual([64, 32, ...Array.from({ length: 7 }, () => [32, 16]).flat()]);
  const lastBindings = gl.bindTexture.mock.calls.slice(-6).map((call) => call[1]);
  expect(lastBindings.every((texture) => texture === lastBindings[0] && texture !== null)).toBe(
    true
  );
  gl.drawArrays.mockClear();
  expect(Array.from(textures.upload(source, 1))).toEqual(
    Array.from({ length: 8 }, () => [64, 32]).flat()
  );
  expect(gl.drawArrays).not.toHaveBeenCalled();
  expect(resources.counters.managedBytes).toBe(64 + 64 * 32 * 4);
  gl.drawArrays.mockClear();
  textures.upload(source, 8);
  expect(gl.drawArrays).toHaveBeenCalledTimes(7);
  expect(resources.counters.managedBytes).toBe(full);
  textures.dispose();
  expect(resources.counters.managedBytes).toBe(0);
});
const rect = { x: 20, y: 20, width: 200, height: 100 };
const frame: QuickEditSpatialFrame = {
  rotation: [0, 0, 0, 1],
  perspective: 0.5,
  windowMotion: 1,
  lockBackground: true,
  focus: [
    { settings: { ...DEFAULT_QUICK_EDIT_DEPTH, enabled: true }, weight: 0.4 },
    { settings: { ...DEFAULT_QUICK_EDIT_DEPTH, enabled: true, mode: 'area' }, weight: 0.6 },
  ],
};

it.each([23, null])(
  'uses bounded renderer filtering only with known fragment precision %s',
  (precision) => {
    const { gl, context } = graphics();
    Object.assign(gl, {
      getShaderPrecisionFormat: vi.fn(() => (precision === null ? null : { precision })),
    });
    const renderer = createReviewSpatialRenderer(undefined, resourceSession());
    const source = renderer.surface('plane', 320, 180).canvas;
    const request = {
      source,
      sourceRect: { x: 0, y: 0, width: source.width, height: source.height },
      output: { width: source.width, height: source.height },
      base: rect,
      target: rect,
      frame,
      sharp: true,
      projection: [1, 0, 0, 0, 1, 0, 0, 0, 1] satisfies QuickEditHomography,
    };
    renderer.draw(context, request);
    expect(gl.drawArrays).toHaveBeenCalledTimes(precision === null ? 8 : 2);
    gl.drawArrays.mockClear();
    renderer.draw(context, { ...request, projection: [2, 0, 0, 0, 2, 0, 0, 0, 1] });
    expect(gl.drawArrays).toHaveBeenCalledTimes(precision === null ? 8 : 1);
    expect(gl.useProgram).toHaveBeenLastCalledWith(
      gl.createProgram.mock.results[precision === null ? 0 : 1]!.value
    );
    gl.drawArrays.mockClear();
    renderer.draw(context, { ...request, projection: [0.25, 0, 0, 0, 0.25, 0, 0, 0, 1] });
    // A sharp overlay still gets the low-pass levels needed by minification.
    expect(gl.drawArrays).toHaveBeenCalledTimes(precision === null ? 8 : 4);
    expect(gl.useProgram).toHaveBeenLastCalledWith(gl.createProgram.mock.results[0]!.value);
    renderer.dispose();
    expect(gl.deleteProgram).toHaveBeenCalledTimes(3);
  }
);

it('reuses surfaces, projects premultiplied pixels, keeps sharp overlays unblurred and releases resources once', () => {
  const { gl, context, gpu, loseContext } = graphics();
  const lost = vi.fn();
  const renderer = createReviewSpatialRenderer(lost, resourceSession());
  const plane = renderer.surface('plane', 320, 180);
  expect(renderer.surface('plane', 320, 180).canvas).toBe(plane.canvas);
  renderer.draw(context, {
    source: plane.canvas,
    sourceRect: { x: 0, y: 0, width: plane.canvas.width, height: plane.canvas.height },
    output: { width: plane.canvas.width, height: plane.canvas.height },
    base: rect,
    target: rect,
    frame: frame,
    sharp: false,
  });
  expect(gl.uniform4f).toHaveBeenCalledWith('focusA', 0.5, 0.5, 0.2, 0.2);
  expect(context.drawImage).toHaveBeenCalledWith(gpu(), 0, 0);
  renderer.draw(context, {
    source: plane.canvas,
    sourceRect: { x: 0, y: 0, width: plane.canvas.width, height: plane.canvas.height },
    output: { width: plane.canvas.width, height: plane.canvas.height },
    base: rect,
    target: rect,
    frame: frame,
    sharp: true,
  });
  expect(gl.uniform4f).toHaveBeenCalledWith('focusA', 0.5, 0.5, 1, 0);
  gpu().dispatchEvent(new Event('webglcontextlost'));
  expect(lost).toHaveBeenCalledTimes(1);
  renderer.dispose();
  renderer.dispose();
  gpu().dispatchEvent(new Event('webglcontextlost'));
  expect(lost).toHaveBeenCalledTimes(1);
  expect(loseContext).toHaveBeenCalledTimes(1);
  expect(gl.deleteTexture).toHaveBeenCalledTimes(8);
  expect(plane.canvas.width).toBe(320);
  expect(() =>
    renderer.draw(context, {
      source: plane.canvas,
      sourceRect: { x: 0, y: 0, width: plane.canvas.width, height: plane.canvas.height },
      output: { width: plane.canvas.width, height: plane.canvas.height },
      base: rect,
      target: rect,
      frame: frame,
      sharp: false,
    })
  ).toThrow('context was lost');
});

it.each(['size', 'lost', 'render'] as const)(
  'rejects %s failure instead of drawing an untransformed frame',
  (stage) => {
    const { gl } = graphics();
    const context = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    const renderer = createReviewSpatialRenderer(undefined, resourceSession());
    const source = renderer.surface('plane', 320, 180).canvas;
    if (stage === 'size') gl.getParameter.mockReturnValueOnce(100);
    if (stage === 'lost') gl.isContextLost.mockReturnValueOnce(true);
    if (stage === 'render') gl.getError.mockReturnValueOnce(1);
    expect(() =>
      renderer.draw(context, {
        source,
        sourceRect: { x: 0, y: 0, width: source.width, height: source.height },
        output: { width: source.width, height: source.height },
        base: rect,
        target: rect,
        frame,
        sharp: false,
      })
    ).toThrow(
      stage === 'size' ? 'output size' : stage === 'lost' ? 'context was lost' : 'rendering failed'
    );
    expect(context.drawImage).not.toHaveBeenCalled();
    renderer.dispose();
  }
);

it.each(['compile', 'link', 'unavailable'] as const)(
  'cleans up initialization failure: %s',
  (stage) => {
    const { gl, getContext, loseContext } = graphics();
    if (stage === 'compile') gl.getShaderParameter.mockReturnValue(false);
    if (stage === 'link') gl.getProgramParameter.mockReturnValue(false);
    if (stage === 'unavailable') getContext.mockReturnValue(null);
    expect(() => createReviewSpatialRenderer(undefined, resourceSession())).toThrow();
    expect(loseContext).toHaveBeenCalledTimes(stage === 'unavailable' ? 0 : 1);
  }
);

it('filters odd-sized levels on GPU, reuses allocations and releases partial failures', () => {
  const { gl } = graphics();
  const textures = createReviewSpatialTextures(gl as unknown as WebGLRenderingContext);
  const source = document.createElement('canvas');
  source.width = 963;
  source.height = 587;
  expect(Array.from(textures.upload(source))).toEqual([
    963, 587, 482, 294, 241, 147, 121, 74, 61, 37, 31, 19, 16, 10, 8, 5,
  ]);
  expect(gl.texImage2D.mock.calls.slice(1).every((call) => call[7] === 36193)).toBe(true);
  textures.upload(source);
  expect(gl.createTexture).toHaveBeenCalledTimes(8);
  expect(gl.texImage2D).toHaveBeenCalledTimes(9);
  source.width = 1;
  source.height = 1;
  expect(Array.from(textures.upload(source))).toEqual(Array(16).fill(1));
  textures.dispose();
  textures.dispose();
  expect(gl.deleteTexture).toHaveBeenCalledTimes(8);
  expect(gl.deleteFramebuffer).toHaveBeenCalledTimes(1);
  expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
  gl.createTexture.mockReturnValueOnce({}).mockReturnValueOnce(null);
  expect(() => createReviewSpatialTextures(gl as unknown as WebGLRenderingContext)).toThrow(
    'texture'
  );
  expect(gl.deleteTexture).toHaveBeenCalledTimes(9);
  expect(gl.deleteFramebuffer).toHaveBeenCalledTimes(2);
});

it('restores the main render state after a filter failure and retries with a new owner', () => {
  const { gl, context } = graphics();
  const renderer = createReviewSpatialRenderer(undefined, resourceSession());
  const source = renderer.surface('plane', 320, 180).canvas;
  gl.checkFramebufferStatus.mockReturnValueOnce(0);
  expect(() =>
    renderer.draw(context, {
      source: source,
      sourceRect: { x: 0, y: 0, width: source.width, height: source.height },
      output: { width: source.width, height: source.height },
      base: rect,
      target: rect,
      frame: frame,
      sharp: false,
    })
  ).toThrow('framebuffer is incomplete');
  expect(gl.bindFramebuffer).toHaveBeenLastCalledWith(gl.FRAMEBUFFER, null);
  expect(gl.useProgram).toHaveBeenLastCalledWith(gl.createProgram.mock.results[0]!.value);
  expect(gl.viewport).toHaveBeenLastCalledWith(0, 0, 320, 180);
  renderer.dispose();
  vi.restoreAllMocks();
  const retry = graphics();
  const next = createReviewSpatialRenderer(undefined, resourceSession());
  const nextSource = next.surface('plane', 320, 180).canvas;
  next.draw(retry.context, {
    source: nextSource,
    sourceRect: { x: 0, y: 0, width: nextSource.width, height: nextSource.height },
    output: { width: nextSource.width, height: nextSource.height },
    base: rect,
    target: rect,
    frame,
    sharp: false,
  });
  expect(retry.context.drawImage).toHaveBeenCalledOnce();
  next.dispose();
});

it.each(['compile', 'link', 'framebuffer'] as const)(
  'releases filter initialization failure: %s',
  (failure) => {
    const { gl } = graphics();
    if (failure === 'compile') gl.getShaderParameter.mockReturnValue(false);
    if (failure === 'link') gl.getProgramParameter.mockReturnValue(false);
    if (failure === 'framebuffer') gl.createFramebuffer.mockReturnValue(null);
    expect(() => createReviewSpatialTextures(gl as unknown as WebGLRenderingContext)).toThrow();
    expect(gl.createTexture).not.toHaveBeenCalled();
    if (failure === 'compile') expect(gl.deleteShader).toHaveBeenCalledTimes(1);
    if (failure === 'link' || failure === 'framebuffer')
      expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
  }
);

it('keeps perspective available without float targets but rejects inaccurate depth blur', () => {
  const { gl, context } = graphics();
  gl.getExtension.mockReturnValue(null);
  const renderer = createReviewSpatialRenderer(undefined, resourceSession());
  const source = renderer.surface('plane', 320, 180).canvas;
  renderer.draw(context, {
    source: source,
    sourceRect: { x: 0, y: 0, width: source.width, height: source.height },
    output: { width: source.width, height: source.height },
    base: rect,
    target: rect,
    frame: { ...frame, focus: [] },
    sharp: false,
  });
  renderer.draw(context, {
    source: source,
    sourceRect: { x: 0, y: 0, width: source.width, height: source.height },
    output: { width: source.width, height: source.height },
    base: rect,
    target: rect,
    frame: frame,
    sharp: true,
  });
  expect(() =>
    renderer.draw(context, {
      source: source,
      sourceRect: { x: 0, y: 0, width: source.width, height: source.height },
      output: { width: source.width, height: source.height },
      base: rect,
      target: rect,
      frame: frame,
      sharp: false,
    })
  ).toThrow('Depth renderer precision');
  renderer.dispose();
});

function resourceSession(maximumManagedBytes = 4_000_000) {
  const session = createPreviewRenderResources({ maximumManagedBytes, maximumCanvases: 4 });
  sessions.push(session);
  return session;
}

it.each([true, false])('accounts actual odd texture levels with half-float=%s', (halfFloat) => {
  const { gl } = graphics();
  if (!halfFloat) gl.getExtension.mockReturnValue(null);
  const resources = resourceSession();
  const textures = createReviewSpatialTextures(gl as unknown as WebGLRenderingContext, resources);
  const source = document.createElement('canvas');
  source.width = 5;
  source.height = 3;
  textures.upload(source);
  // Base5×3; reduced3×2,2×1, then five1×1 levels.
  const expected = 64 + 15 * 4 + 13 * (halfFloat ? 8 : 4);
  expect(resources.counters.managedBytes).toBe(expected);
  textures.upload(source);
  expect(resources.counters.managedBytes).toBe(expected);
  expect(gl.createTexture).toHaveBeenCalledTimes(8);
  source.width = 1;
  source.height = 1;
  textures.upload(source);
  expect(resources.counters.managedBytes).toBe(64 + 4 + 7 * (halfFloat ? 8 : 4));
  expect(resources.counters.peakManagedBytes).toBe(expected);
  textures.dispose();
  textures.dispose();
  expect(resources.counters.managedBytes).toBe(0);
  expect(() => textures.upload(source)).toThrow('disposed');
});

it('refuses texture admission before texImage2D and releases prior metadata', () => {
  const { gl } = graphics();
  const resources = resourceSession(64);
  const textures = createReviewSpatialTextures(gl as unknown as WebGLRenderingContext, resources);
  const source = document.createElement('canvas');
  source.width = source.height = 10;
  expect(() => textures.upload(source)).toThrow('resource allocation failed');
  expect(gl.texImage2D).not.toHaveBeenCalled();
  expect(resources.counters.managedBytes).toBe(0);
  expect(gl.deleteTexture).toHaveBeenCalledTimes(8);
});

it('releases all admitted texture storage after framebuffer failure', () => {
  const { gl } = graphics();
  const resources = resourceSession();
  const textures = createReviewSpatialTextures(gl as unknown as WebGLRenderingContext, resources);
  const source = document.createElement('canvas');
  source.width = source.height = 10;
  gl.checkFramebufferStatus.mockReturnValueOnce(0);
  expect(() => textures.upload(source)).toThrow('framebuffer is incomplete');
  expect(resources.counters.managedBytes).toBe(0);
  expect(() => textures.upload(source)).toThrow('disposed');
});

it('retains named canvas slots and releases managed GL reservations on context loss', () => {
  const { context, gpu } = graphics();
  const resources = resourceSession();
  const lost = vi.fn();
  const renderer = createReviewSpatialRenderer(lost, resources);
  const plane = renderer.surface('plane', 10, 10);
  expect(renderer.surface('plane', 10, 10).canvas).toBe(plane.canvas);
  const overlay = renderer.surface('overlay', 10, 10);
  expect(overlay.canvas).not.toBe(plane.canvas);
  renderer.draw(context, {
    source: plane.canvas,
    sourceRect: { x: 0, y: 0, width: plane.canvas.width, height: plane.canvas.height },
    output: { width: plane.canvas.width, height: plane.canvas.height },
    base: rect,
    target: rect,
    frame: frame,
    sharp: false,
  });
  expect(resources.counters.managedBytes).toBeGreaterThan(800);
  gpu().dispatchEvent(new Event('webglcontextlost'));
  expect(lost).toHaveBeenCalledOnce();
  // Released 2D leases remain idle in the session ledger until eviction/disposal.
  expect(resources.counters.managedBytes).toBe(800);
  expect(() => renderer.surface('plane', 10, 10)).toThrow('context was lost');
  renderer.dispose();
  resources.dispose();
  expect(resources.counters.managedBytes).toBe(0);
  expect(plane.canvas.width).toBe(0);
});

it('releases an old surface before resizing and can evict it at exact capacity', () => {
  graphics();
  const resources = resourceSession(132 + 64 + 400);
  const renderer = createReviewSpatialRenderer(undefined, resources);
  const first = renderer.surface('plane', 10, 10);
  const next = renderer.surface('plane', 5, 20);
  expect(first.canvas.width).toBe(0);
  expect(next.canvas.width).toBe(5);
  expect(resources.counters.peakManagedBytes).toBe(596);
  renderer.dispose();
  resources.dispose();
  expect(resources.counters.managedBytes).toBe(0);
});

it('cleans managed constructor and drawing-buffer admission failures', () => {
  const { context, loseContext } = graphics();
  const tooSmall = resourceSession(167);
  expect(() => createReviewSpatialRenderer(undefined, tooSmall)).toThrow(
    'resource allocation failed'
  );
  expect(tooSmall.counters.managedBytes).toBe(0);
  expect(loseContext).toHaveBeenCalledOnce();
  const resources = resourceSession(132 + 64 + 400);
  const renderer = createReviewSpatialRenderer(undefined, resources);
  const plane = renderer.surface('plane', 10, 10);
  expect(() =>
    renderer.draw(context, {
      source: plane.canvas,
      sourceRect: { x: 0, y: 0, width: plane.canvas.width, height: plane.canvas.height },
      output: { width: plane.canvas.width, height: plane.canvas.height },
      base: rect,
      target: rect,
      frame: frame,
      sharp: false,
    })
  ).toThrow('resource allocation failed');
  expect(resources.counters.managedBytes).toBe(400);
  renderer.dispose();
  resources.dispose();
  expect(resources.counters.managedBytes).toBe(0);
});

it('retains linear filtering and edge clamping when a reserved texture is replaced after resize', () => {
  const { gl } = graphics();
  const textures = createReviewSpatialTextures(
    gl as unknown as WebGLRenderingContext,
    resourceSession()
  );
  const source = document.createElement('canvas');
  source.width = 32;
  source.height = 18;
  textures.upload(source);
  gl.texParameteri.mockClear();
  source.width = 64;
  source.height = 36;
  textures.upload(source);
  expect(gl.texParameteri).toHaveBeenCalledWith(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  expect(gl.texParameteri).toHaveBeenCalledWith(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  expect(gl.texParameteri).toHaveBeenCalledWith(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  expect(gl.texParameteri).toHaveBeenCalledWith(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  expect(gl.deleteTexture).toHaveBeenCalled();
  textures.dispose();
});

it('projects an asymmetric padded source into the unchanged output viewport', () => {
  const { gl, context, gpu } = graphics();
  const renderer = createReviewSpatialRenderer(undefined, resourceSession());
  const plane = renderer.surface('plane', 511, 303);
  renderer.draw(context, {
    source: plane.canvas,
    sourceRect: { x: -91, y: -43, width: 511, height: 303 },
    output: { width: 321, height: 181 },
    base: rect,
    target: rect,
    frame,
    sharp: false,
  });
  expect(gpu()).toMatchObject({ width: 321, height: 181 });
  expect(gl.uniform4f).toHaveBeenCalledWith('sourceRect', -91, -43, 511, 303);
  expect(gl.uniform2f).toHaveBeenCalledWith('outputSize', 321, 181);
  expect(gl.uniformMatrix3fv.mock.calls.some(([name]) => name === 'projection')).toBe(false);
  renderer.dispose();
});

it.each(['viewport', 'framebuffer', 'accepted-buffer', 'source-rect', 'unsafe-bytes'] as const)(
  'refuses %s before texture upload or partial publication',
  (failure) => {
    const { gl, context } = graphics();
    const resources = resourceSession();
    const renderer = createReviewSpatialRenderer(undefined, resources);
    const source = renderer.surface('plane', 321, 181).canvas;
    const request = {
      source,
      sourceRect: { x: -12, y: -20, width: 321, height: 181 },
      output: { width: 301, height: 161 },
      base: rect,
      target: rect,
      frame,
    };
    if (failure === 'viewport')
      gl.getParameter.mockImplementation((name) =>
        name === gl.MAX_VIEWPORT_DIMS ? new Int32Array([300, 161]) : 4096
      );
    if (failure === 'framebuffer')
      gl.getParameter.mockImplementation((name) =>
        name === gl.MAX_VIEWPORT_DIMS
          ? new Int32Array([4096, 4096])
          : name === gl.MAX_RENDERBUFFER_SIZE
            ? 160
            : 4096
      );
    if (failure === 'accepted-buffer')
      Object.defineProperty(gl, 'drawingBufferWidth', { get: () => 300 });
    if (failure === 'source-rect') request.sourceRect.width++;
    if (failure === 'unsafe-bytes') request.output.width = Number.MAX_SAFE_INTEGER;
    expect(() => renderer.draw(context, request)).toThrow('output size');
    expect(gl.texImage2D).not.toHaveBeenCalled();
    expect(context.drawImage).not.toHaveBeenCalled();
    expect(resources.counters.managedBytes).toBe(321 * 181 * 4);
    renderer.dispose();
    resources.dispose();
    expect(resources.counters.managedBytes).toBe(0);
  }
);

it('refuses invalid or unsupported surfaces before allocation and permits a valid retry', () => {
  const { gl } = graphics();
  const resources = resourceSession();
  const renderer = createReviewSpatialRenderer(undefined, resources);
  const admitted = vi.spyOn(resources, 'canvas');
  const setWidth = vi.spyOn(HTMLCanvasElement.prototype, 'width', 'set');
  const setHeight = vi.spyOn(HTMLCanvasElement.prototype, 'height', 'set');
  for (const kind of ['plane', 'overlay', 'exposure'] as const) {
    for (const width of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER])
      expect(() => renderer.surface(kind, width, 10)).toThrow('output size');
  }
  gl.getParameter.mockImplementation((name) =>
    name === gl.MAX_VIEWPORT_DIMS ? new Int32Array([16, 16]) : 16
  );
  expect(() => renderer.surface('plane', 17, 10)).toThrow('output size');
  expect(() => renderer.surface('overlay', 10, 17)).toThrow('output size');
  expect(() => renderer.surface('exposure', 17, 10)).toThrow('output size');
  expect(setWidth).not.toHaveBeenCalled();
  expect(setHeight).not.toHaveBeenCalled();
  expect(admitted).not.toHaveBeenCalled();
  const plane = renderer.surface('plane', 10, 10);
  expect(plane.canvas.width).toBe(10);
  expect(plane.canvas.height).toBe(10);
  renderer.dispose();
  // The session retains the released 10×10 canvas until its own disposal.
  expect(resources.counters.managedBytes).toBe(400);
  resources.dispose();
  expect(resources.counters.managedBytes).toBe(0);
});

it('uses the composed source projection and resets local depth coordinates for legacy callers', () => {
  const { gl, context } = graphics();
  const renderer = createReviewSpatialRenderer(undefined, resourceSession());
  const plane = renderer.surface('plane', 320, 180);
  const request = {
    source: plane.canvas,
    sourceRect: { x: 0, y: 0, width: 320, height: 180 },
    output: { width: 320, height: 180 },
    base: rect,
    target: rect,
    frame,
  };
  renderer.draw(context, {
    ...request,
    projection: [1, 0, 7, 0, 1, 9, 0, 0, 1],
    planeInverse: [0, 1, 0, -1, 0, 320, 0, 0, 1],
  });
  expect(gl.uniformMatrix3fv).toHaveBeenCalledWith(
    'inverseProjection',
    false,
    new Float32Array([1, 0, 0, 0, 1, 0, -7, -9, 1])
  );
  expect(gl.uniformMatrix3fv).toHaveBeenCalledWith(
    'inversePlane',
    false,
    new Float32Array([0, -1, 0, 1, 0, 0, 0, 320, 1])
  );
  renderer.draw(context, request);
  expect(gl.uniformMatrix3fv).toHaveBeenLastCalledWith(
    'inversePlane',
    false,
    new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1])
  );
  renderer.dispose();
});

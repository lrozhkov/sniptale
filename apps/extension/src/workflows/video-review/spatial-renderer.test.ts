// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createReviewSpatialTextures } from './spatial-textures';
import { createReviewSpatialRenderer } from './spatial-renderer';
import { createPreviewRenderResources } from './preview-render-resources';
import {
  DEFAULT_QUICK_EDIT_DEPTH,
  type QuickEditSpatialFrame,
} from '../../features/video/review/advanced/spatial';

afterEach(() => vi.restoreAllMocks());
function graphics() {
  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    MAX_TEXTURE_SIZE: 5,
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
    getParameter: vi.fn(() => 4096),
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

it('reuses surfaces, projects premultiplied pixels, keeps sharp overlays unblurred and releases resources once', () => {
  const { gl, context, gpu, loseContext } = graphics();
  const lost = vi.fn();
  const renderer = createReviewSpatialRenderer(lost);
  const plane = renderer.surface('plane', 320, 180);
  expect(renderer.surface('plane', 320, 180).canvas).toBe(plane.canvas);
  renderer.draw(context, plane.canvas, rect, rect, frame);
  expect(gl.uniform4f).toHaveBeenCalledWith('focusA', 0.5, 0.5, 0.2, 0.2);
  expect(context.drawImage).toHaveBeenCalledWith(gpu(), 0, 0);
  renderer.draw(context, plane.canvas, rect, rect, frame, true);
  expect(gl.uniform4f).toHaveBeenCalledWith('focusA', 0.5, 0.5, 1, 0);
  gpu().dispatchEvent(new Event('webglcontextlost'));
  expect(lost).toHaveBeenCalledTimes(1);
  renderer.dispose();
  renderer.dispose();
  gpu().dispatchEvent(new Event('webglcontextlost'));
  expect(lost).toHaveBeenCalledTimes(1);
  expect(loseContext).toHaveBeenCalledTimes(1);
  expect(gl.deleteTexture).toHaveBeenCalledTimes(8);
  expect(plane.canvas.width).toBe(1);
  expect(() => renderer.draw(context, plane.canvas, rect, rect, frame)).toThrow('context was lost');
});

it('rejects unsupported sizes and lost/failed contexts instead of drawing an untransformed frame', () => {
  const { gl } = graphics();
  const context = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
  const renderer = createReviewSpatialRenderer();
  const source = renderer.surface('plane', 320, 180).canvas;
  gl.getParameter.mockReturnValueOnce(100);
  expect(() => renderer.draw(context, source, rect, rect, frame)).toThrow('output size');
  gl.isContextLost.mockReturnValueOnce(true);
  expect(() => renderer.draw(context, source, rect, rect, frame)).toThrow('context was lost');
  gl.getError.mockReturnValueOnce(1);
  expect(() => renderer.draw(context, source, rect, rect, frame)).toThrow('rendering failed');
  expect(context.drawImage).not.toHaveBeenCalled();
  renderer.dispose();
});

it.each(['compile', 'link', 'unavailable'] as const)(
  'cleans up initialization failure: %s',
  (stage) => {
    const { gl, getContext, loseContext } = graphics();
    if (stage === 'compile') gl.getShaderParameter.mockReturnValue(false);
    if (stage === 'link') gl.getProgramParameter.mockReturnValue(false);
    if (stage === 'unavailable') getContext.mockReturnValue(null);
    expect(() => createReviewSpatialRenderer()).toThrow();
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

it('restores the main render state after a filter framebuffer failure and can retry', () => {
  const { gl, context } = graphics();
  const renderer = createReviewSpatialRenderer();
  const source = renderer.surface('plane', 320, 180).canvas;
  gl.checkFramebufferStatus.mockReturnValueOnce(0);
  expect(() => renderer.draw(context, source, rect, rect, frame)).toThrow(
    'framebuffer is incomplete'
  );
  expect(gl.bindFramebuffer).toHaveBeenLastCalledWith(gl.FRAMEBUFFER, null);
  expect(gl.useProgram).toHaveBeenLastCalledWith(gl.createProgram.mock.results[0]!.value);
  expect(gl.viewport).toHaveBeenLastCalledWith(0, 0, 320, 180);
  renderer.draw(context, source, rect, rect, frame);
  renderer.dispose();
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
  const renderer = createReviewSpatialRenderer();
  const source = renderer.surface('plane', 320, 180).canvas;
  renderer.draw(context, source, rect, rect, { ...frame, focus: [] });
  renderer.draw(context, source, rect, rect, frame, true);
  expect(() => renderer.draw(context, source, rect, rect, frame)).toThrow(
    'Depth renderer precision'
  );
  renderer.dispose();
});

function resourceSession(maximumManagedBytes = 1_000_000) {
  return createPreviewRenderResources({ maximumManagedBytes, maximumCanvases: 4 });
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
  renderer.draw(context, plane.canvas, rect, rect, frame);
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
  const resources = resourceSession(168 + 64 + 400);
  const renderer = createReviewSpatialRenderer(undefined, resources);
  const first = renderer.surface('plane', 10, 10);
  const next = renderer.surface('plane', 5, 20);
  expect(first.canvas.width).toBe(0);
  expect(next.canvas.width).toBe(5);
  expect(resources.counters.peakManagedBytes).toBe(632);
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
  const resources = resourceSession(168 + 64 + 400);
  const renderer = createReviewSpatialRenderer(undefined, resources);
  const plane = renderer.surface('plane', 10, 10);
  expect(() => renderer.draw(context, plane.canvas, rect, rect, frame)).toThrow(
    'resource allocation failed'
  );
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

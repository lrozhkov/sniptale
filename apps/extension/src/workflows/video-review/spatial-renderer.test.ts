// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createReviewSpatialRenderer } from './spatial-renderer';
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
    createTexture: vi.fn(() => ({})),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    useProgram: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    bindTexture: vi.fn(),
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
    texImage2D: vi.fn(),
    drawArrays: vi.fn(),
    getError: vi.fn(() => 0),
    deleteTexture: vi.fn(),
    deleteBuffer: vi.fn(),
    getExtension: vi.fn(() => ({ loseContext })),
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
  expect(gl.deleteTexture).toHaveBeenCalledTimes(1);
  expect(plane.canvas.width).toBe(1);
  expect(() => renderer.draw(context, plane.canvas, rect, rect, frame)).toThrow('context was lost');
});

it('rejects unsupported sizes and lost/failed contexts instead of drawing an untransformed frame', () => {
  const { gl, context } = graphics();
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

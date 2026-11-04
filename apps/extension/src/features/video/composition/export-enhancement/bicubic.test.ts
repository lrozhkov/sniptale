import { afterEach, expect, it, vi } from 'vitest';
import { createBicubic } from './bicubic';

afterEach(() => vi.unstubAllGlobals());

function contextFixture(
  failure?: 'program' | 'shader' | 'compile' | 'link' | 'buffer' | 'texture' | 'upload'
) {
  const shaders: WebGLShader[] = [];
  const program = { kind: 'program' } as WebGLProgram;
  const buffer = { kind: 'buffer' } as WebGLBuffer;
  const texture = { kind: 'texture' } as WebGLTexture;
  const loseContext = vi.fn();
  const uploadFailure = new Error('Source upload failed');
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
    createProgram: vi.fn(() => (failure === 'program' ? null : program)),
    createShader: vi.fn(() => {
      if (failure === 'shader') return null;
      const value = { index: shaders.length } as WebGLShader;
      shaders.push(value);
      return value;
    }),
    createBuffer: vi.fn(() => (failure === 'buffer' ? null : buffer)),
    createTexture: vi.fn(() => (failure === 'texture' ? null : texture)),
    getShaderParameter: vi.fn(() => failure !== 'compile'),
    getProgramParameter: vi.fn(() => failure !== 'link'),
    getShaderInfoLog: vi.fn(() => null),
    getProgramInfoLog: vi.fn(() => 'Driver refused program'),
    getExtension: vi.fn(() => ({ loseContext })),
    deleteShader: vi.fn(),
    deleteProgram: vi.fn(),
    deleteBuffer: vi.fn(),
    deleteTexture: vi.fn(),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    useProgram: vi.fn(),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    bindTexture: vi.fn(),
    texParameteri: vi.fn(),
    pixelStorei: vi.fn(),
    getUniformLocation: vi.fn(() => null),
    texImage2D: vi.fn(() => {
      if (failure === 'upload') throw uploadFailure;
    }),
    uniform2f: vi.fn(),
    viewport: vi.fn(),
    uniform4fv: vi.fn(),
    uniform1i: vi.fn(),
    uniform1f: vi.fn(),
    drawArrays: vi.fn(),
    isContextLost: vi.fn(() => false),
    finish: vi.fn(),
  };
  const getContext = vi.fn<() => typeof gl | null>(() => gl);
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      constructor(
        public width: number,
        public height: number
      ) {}
      getContext = getContext;
    }
  );
  const source = { width: 640, height: 360 } as HTMLCanvasElement;
  return { gl, getContext, source, program, buffer, texture, shaders, loseContext, uploadFailure };
}

it('refuses an unavailable WebGL2 context before allocating enhancement resources', () => {
  const f = contextFixture();
  f.getContext.mockReturnValueOnce(null);
  expect(() => createBicubic(f.source)).toThrow('WebGL2 unavailable');
  expect(f.gl.createProgram).not.toHaveBeenCalled();
  expect(f.gl.createTexture).not.toHaveBeenCalled();
});

it.each([
  ['program', 'Program allocation failed'],
  ['shader', 'Shader allocation failed'],
  ['compile', 'Shader compilation failed'],
  ['link', 'Driver refused program'],
  ['buffer', 'Buffer allocation failed'],
  ['texture', 'Texture allocation failed'],
  ['upload', 'Source upload failed'],
] as const)(
  'releases owned enhancement resources after %s initialization failure',
  (failure, message) => {
    const f = contextFixture(failure);
    expect(() => createBicubic(f.source)).toThrow(message);
    for (const shader of f.shaders) expect(f.gl.deleteShader).toHaveBeenCalledWith(shader);
    if (failure !== 'program') expect(f.gl.deleteProgram).toHaveBeenCalledWith(f.program);
    if (failure === 'texture' || failure === 'upload')
      expect(f.gl.deleteBuffer).toHaveBeenCalledWith(f.buffer);
    if (failure === 'upload') expect(f.gl.deleteTexture).toHaveBeenCalledWith(f.texture);
    expect(f.loseContext).toHaveBeenCalledOnce();
    expect(f.gl.drawArrays).not.toHaveBeenCalled();
  }
);

it('preserves requested sample dimensions and releases its context after completed draws', () => {
  const f = contextFixture();
  const backend = createBicubic(f.source);
  const first = backend.draw([0, 0, 640, 360], 1, 0.25, 1280, 720);
  const second = backend.draw([10, 20, 100, 50], 2, 0, 400, 200);
  expect(second).toBe(first);
  expect([second.width, second.height]).toEqual([400, 200]);
  expect(f.gl.viewport).toHaveBeenLastCalledWith(0, 0, 400, 200);
  const replacement = { width: 800, height: 450 } as HTMLCanvasElement;
  backend.update(replacement);
  expect(f.gl.texImage2D.mock.calls.at(-1)?.at(-1)).toBe(replacement);
  expect(f.gl.uniform2f).toHaveBeenLastCalledWith(null, 800, 450);
  backend.dispose();
  for (const shader of f.shaders) expect(f.gl.deleteShader).toHaveBeenCalledWith(shader);
  expect(f.gl.deleteProgram).toHaveBeenCalledWith(f.program);
  expect(f.gl.deleteBuffer).toHaveBeenCalledWith(f.buffer);
  expect(f.gl.deleteTexture).toHaveBeenCalledWith(f.texture);
  expect(f.loseContext).toHaveBeenCalledOnce();
});

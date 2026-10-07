import {
  quickEditPlaneProjection,
  invertQuickEditProjection,
  quickEditRotationMatrix,
} from '../../features/video/review/advanced/spatial-geometry';
import type { QuickEditSpatialFrame } from '../../features/video/review/advanced/spatial';
import type { QuickEditRect } from '../../features/video/review/advanced/scene';
import { createReviewSpatialTextures } from './spatial-textures';
import { REVIEW_SPATIAL_VERTEX, REVIEW_SPATIAL_FRAGMENT } from './spatial-shaders';

/** One explicit GPU owner per preview/export session; callers dispose on close or cancellation. */
export function createReviewSpatialRenderer(onContextLost?: () => void) {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', {
    alpha: true,
    premultipliedAlpha: true,
    preserveDrawingBuffer: true,
  });
  if (!gl) throw new Error('Perspective renderer is unavailable.');
  try {
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('Perspective shader is unavailable.');
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        throw new Error('Perspective shader compilation failed.');
      }
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, REVIEW_SPATIAL_VERTEX);
    const fragment = compile(gl.FRAGMENT_SHADER, REVIEW_SPATIAL_FRAGMENT);
    const program = gl.createProgram();
    if (!program) throw new Error('Perspective program is unavailable.');
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      throw new Error('Perspective program linking failed.');
    }
    const buffer = gl.createBuffer();
    if (!buffer) throw new Error('Perspective buffers are unavailable.');
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.useProgram(program);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const textures = createReviewSpatialTextures(gl);
    for (let index = 0; index < 8; index++)
      gl.uniform1i(gl.getUniformLocation(program, `surface${index}`), index);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    const locations = new Map<string, WebGLUniformLocation | null>();
    const uniform = (name: string) => {
      if (!locations.has(name)) locations.set(name, gl.getUniformLocation(program, name));
      return locations.get(name) ?? null;
    };
    const surfaces = {
      exposure: document.createElement('canvas'),
      plane: document.createElement('canvas'),
      overlay: document.createElement('canvas'),
    };
    let disposed = false;
    const lost = () => {
      if (!disposed) onContextLost?.();
    };
    canvas.addEventListener('webglcontextlost', lost);
    return {
      surface(kind: 'plane' | 'overlay' | 'exposure', width: number, height: number) {
        const surface = surfaces[kind];
        if (surface.width !== width || surface.height !== height) {
          surface.width = width;
          surface.height = height;
        }
        const context = surface.getContext('2d');
        if (!context) throw new Error('Perspective surface is unavailable.');
        context.clearRect(0, 0, width, height);
        return { canvas: surface, context };
      },
      /** Projects a transparent base scene; background and viewport overlays stay outside this pass. */
      draw(
        context: CanvasRenderingContext2D,
        source: HTMLCanvasElement,
        base: QuickEditRect,
        target: QuickEditRect,
        frame: QuickEditSpatialFrame,
        sharp = false
      ) {
        const maximum: unknown = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        if (typeof maximum !== 'number' || source.width > maximum || source.height > maximum)
          throw new Error('Perspective output size is unavailable.');
        if (disposed || gl.isContextLost()) throw new Error('Perspective context was lost.');
        if (
          !sharp &&
          !textures.supportsDepth &&
          frame.focus.some((focus) => focus.weight * focus.settings.strength > 0)
        )
          throw new Error('Depth renderer precision is unavailable.');
        if (canvas.width !== source.width || canvas.height !== source.height) {
          canvas.width = source.width;
          canvas.height = source.height;
        }
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        const m = quickEditPlaneProjection(base, target, frame);
        gl.uniformMatrix3fv(
          uniform('projection'),
          false,
          new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]])
        );
        const inverse = invertQuickEditProjection(m);
        if (!inverse) throw new Error('Perspective projection is unavailable.');
        gl.uniformMatrix3fv(
          uniform('inverseProjection'),
          false,
          new Float32Array([
            inverse[0],
            inverse[3],
            inverse[6],
            inverse[1],
            inverse[4],
            inverse[7],
            inverse[2],
            inverse[5],
            inverse[8],
          ])
        );
        gl.uniform2f(uniform('outputSize'), canvas.width, canvas.height);
        gl.uniform4f(uniform('windowRect'), base.x, base.y, base.width, base.height);
        const rotation = quickEditRotationMatrix(frame.rotation);
        gl.uniform2f(uniform('depthAxis'), rotation[6]!, rotation[7]!);
        const focuses = sharp ? [] : frame.focus;
        for (const [index, name] of ['focusA', 'focusB'].entries()) {
          const focus = focuses[index];
          gl.uniform4f(
            uniform(name),
            focus?.settings.x ?? 0.5,
            focus?.settings.y ?? 0.5,
            focus?.settings.width ?? 1,
            focus ? focus.settings.strength * focus.weight : 0
          );
        }
        gl.uniform4f(
          uniform('blurSettings'),
          focuses[0]?.settings.softness ?? 1,
          focuses[1]?.settings.softness ?? 1,
          0,
          0
        );
        gl.uniform2f(
          uniform('modes'),
          focuses[0]?.settings.mode === 'depth' ? 1 : 0,
          focuses[1]?.settings.mode === 'depth' ? 1 : 0
        );
        let levelSizes: Float32Array;
        try {
          levelSizes = textures.upload(source);
        } finally {
          gl.useProgram(program);
          gl.enableVertexAttribArray(position);
          gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
          gl.viewport(0, 0, canvas.width, canvas.height);
        }
        gl.uniform2fv(uniform('levelSize[0]'), levelSizes);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        if (gl.getError() !== gl.NO_ERROR) throw new Error('Perspective rendering failed.');
        context.drawImage(canvas, 0, 0);
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        canvas.removeEventListener('webglcontextlost', lost);
        textures.dispose();
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        canvas.width = 1;
        canvas.height = 1;
        for (const surface of Object.values(surfaces)) {
          surface.width = 1;
          surface.height = 1;
        }
      },
    };
  } catch (error) {
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    canvas.width = 1;
    canvas.height = 1;
    throw error;
  }
}

export type ReviewSpatialRenderer = ReturnType<typeof createReviewSpatialRenderer>;

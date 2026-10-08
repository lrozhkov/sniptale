import type {
  RenderResources,
  RenderCanvasLease,
} from '../../features/video/composition/canvas/render-resources';
import {
  quickEditPlaneProjection,
  invertQuickEditProjection,
  quickEditRotationMatrix,
} from '../../features/video/review/advanced/spatial-geometry';
import type { QuickEditSpatialFrame } from '../../features/video/review/advanced/spatial';
import type { QuickEditRect } from '../../features/video/review/advanced/scene';
import { createReviewSpatialTextures } from './spatial-textures';
import { REVIEW_SPATIAL_VERTEX, REVIEW_SPATIAL_FRAGMENT } from './spatial-shaders';

/** Compile the shader pipeline before the session admits surfaces or draw requests. */
function prepareSpatialPipeline(gl: WebGLRenderingContext, resources?: RenderResources) {
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
  const textures = createReviewSpatialTextures(gl, resources);
  for (let index = 0; index < 8; index++)
    gl.uniform1i(gl.getUniformLocation(program, `surface${index}`), index);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  const locations = new Map<string, WebGLUniformLocation | null>();
  const uniform = (name: string) => {
    if (!locations.has(name)) locations.set(name, gl.getUniformLocation(program, name));
    return locations.get(name) ?? null;
  };
  return { program, buffer, position, textures, uniform };
}

/** Projection and focus uniforms describe one frame independently of texture lifetime. */
function setSpatialFrameUniforms(
  gl: WebGLRenderingContext,
  uniform: (name: string) => WebGLUniformLocation | null,
  args: {
    base: QuickEditRect;
    target: QuickEditRect;
    frame: QuickEditSpatialFrame;
    sharp: boolean;
    output: { width: number; height: number };
  }
) {
  const { base, target, frame, sharp, output } = args;
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
  gl.uniform2f(uniform('outputSize'), output.width, output.height);
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
}

/** One explicit GPU owner per preview/export session; callers dispose on close or cancellation. */
export function createReviewSpatialRenderer(
  onContextLost?: () => void,
  resources?: RenderResources
) {
  const canvas = document.createElement('canvas');
  if (resources) {
    canvas.width = 0;
    canvas.height = 0;
  }
  const leases = new Map<string, RenderCanvasLease>();
  let drawingBuffer: { release(): void } | undefined;
  let arrays: { release(): void } | undefined;
  const releaseManaged = () => {
    drawingBuffer?.release();
    drawingBuffer = undefined;
    arrays?.release();
    arrays = undefined;
    for (const lease of leases.values()) lease.release();
    leases.clear();
  };
  const gl = canvas.getContext('webgl', {
    alpha: true,
    premultipliedAlpha: true,
    preserveDrawingBuffer: true,
  });
  if (!gl) throw new Error('Perspective renderer is unavailable.');
  try {
    // CPU vertex/matrix arrays plus the explicit GL vertex-buffer storage.
    arrays = resources?.bytes('spatial-vertex-and-matrices', 48 + 48 + 72);
    const { program, buffer, position, textures, uniform } = prepareSpatialPipeline(gl, resources);
    const surfaces = {
      exposure: resources ? null : document.createElement('canvas'),
      plane: resources ? null : document.createElement('canvas'),
      overlay: resources ? null : document.createElement('canvas'),
    };
    let disposed = false;
    const lost = () => {
      if (!disposed) {
        if (resources) dispose();
        onContextLost?.();
      }
    };
    canvas.addEventListener('webglcontextlost', lost);
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener('webglcontextlost', lost);
      textures.dispose();
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.width = resources ? 0 : 1;
      canvas.height = resources ? 0 : 1;
      releaseManaged();
      for (const surface of Object.values(surfaces)) {
        if (surface) {
          surface.width = 1;
          surface.height = 1;
        }
      }
    };
    return {
      surface(kind: 'plane' | 'overlay' | 'exposure', width: number, height: number) {
        if (disposed) throw new Error('Perspective context was lost.');
        if (resources) {
          try {
            let lease = leases.get(kind);
            if (lease && (lease.canvas.width !== width || lease.canvas.height !== height)) {
              lease.release();
              leases.delete(kind);
              lease = undefined;
            }
            if (!lease) {
              lease = resources.canvas(`spatial-${kind}`, { width, height });
              leases.set(kind, lease);
            }
            lease.context.clearRect(0, 0, width, height);
            return { canvas: lease.canvas, context: lease.context };
          } catch (error) {
            dispose();
            throw error;
          }
        }
        const surface = surfaces[kind];
        if (!surface) throw new Error('Perspective surface is unavailable.');
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
        try {
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
            if (resources) {
              canvas.width = 0;
              canvas.height = 0;
              drawingBuffer?.release();
              drawingBuffer = undefined;
              drawingBuffer = resources.bytes(
                'spatial-drawing-buffer',
                source.width * source.height * 4
              );
            }
            canvas.width = source.width;
            canvas.height = source.height;
          }
          gl.viewport(0, 0, canvas.width, canvas.height);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          setSpatialFrameUniforms(gl, uniform, { base, target, frame, sharp, output: canvas });
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
        } catch (error) {
          if (resources) dispose();
          throw error;
        }
      },
      dispose,
    };
  } catch (error) {
    releaseManaged();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    canvas.width = 1;
    canvas.height = 1;
    throw error;
  }
}

export type ReviewSpatialRenderer = ReturnType<typeof createReviewSpatialRenderer>;
